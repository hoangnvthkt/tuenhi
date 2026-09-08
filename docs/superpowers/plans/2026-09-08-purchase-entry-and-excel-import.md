# Purchase Entry and Excel Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow authorized receipt creators to save mandatory unit costs per draft line, search products by text, and add all-valid purchase lines from Excel without creating a second purchasing workflow.

**Architecture:** Store draft costs in an `app_private` table keyed by receipt line and let the existing save command atomically replace lines and their costs. New DRAFT receipts post from persisted private costs, while pre-existing `AWAITING_COST` receipts retain their legacy posting path. The browser validates a strict purchase template in memory, resolves exact SKUs through a bounded read RPC, and only transfers preview rows to the unsaved line editor.

**Tech Stack:** React 19, TypeScript, TanStack Query, Vitest/Testing Library, SheetJS, ExcelJS template generator, Supabase/Postgres RPC and RLS.

**Spec:** `docs/superpowers/specs/2026-09-08-purchase-entry-and-product-thumbnail-design.md`

## Global Constraints

- New receipt lines require a positive canonical quantity (up to 3 decimals) and positive canonical money cost (up to 2 decimals).
- `purchase.post` remains the only permission that posts stock and financial movements; price entry does not grant posting.
- A draft creator may read only their own draft costs; `purchase.cost.read` remains the cross-receipt/final-cost permission.
- `AWAITING_COST` exists only for legacy receipts and must not be created by the new flow.
- Excel accepts only `purchase-receipt-v1.xlsx`, with exactly `Hướng dẫn`, `Dữ liệu`, `__tuenhi_meta`, no formulas/macros/external links, 5 MiB/5,000-row/50-column limits, and never uploads the file.
- Do not run `db push`, Cloud mutations, seed/cleanup, Cloud E2E, or synthetic Cloud data without a separately approved release step.
- Create the migration through `pnpm exec supabase migration new`; do not invent its timestamp or edit historical migrations.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/<CLI-generated>_purchase_draft_costs.sql` | Private draft-cost storage, save/post/read RPC changes, exact-SKU resolver, grants/revokes. |
| `supabase/tests/phase_1c_inventory_assertions.sql` | Transactional SQL assertions for new contracts and price boundaries. |
| `src/features/inventory/purchase/model/purchase-draft.ts` | `PurchaseDraftLine` including `unitCost`. |
| `src/features/inventory/purchase/api/purchase-api.ts` | Save/post payloads and `resolveProductsBySku`. |
| `src/features/inventory/purchase/api/purchase-schemas.ts` | Zod schemas for draft cost detail and SKU resolution. |
| `src/features/inventory/purchase/components/PurchaseProductCombobox.tsx` | Accessible debounced name/SKU/barcode search and selection. |
| `src/features/inventory/purchase/components/PurchaseExcelImportDialog.tsx` | Local file selection, preview, row errors and all-or-nothing apply action. |
| `src/features/inventory/purchase/model/purchase-excel-import.ts` | Pure purchase-template row validation, duplicate detection and preview mapping. |
| `src/features/inventory/purchase/components/PurchaseLineEditor.tsx` | Product search field, required price field, import controls and line editing. |
| `src/features/inventory/purchase/components/PurchaseActions.tsx` | Direct post action for priced DRAFT receipts; legacy AWAITING_COST compatibility only. |
| `src/features/inventory/purchase/pages/PurchaseDetailPage.tsx` | Draft-cost hydration, client validation, SKU resolver wiring and save/post callbacks. |
| `src/features/imports/model/contracts.ts` | Add `PURCHASE_RECEIPT` import target. |
| `src/features/imports/model/template-contracts.ts` | `purchase-receipt-v1.xlsx` contract with the three approved columns. |
| `src/features/imports/parser/workbook-parser.ts` | Continue strict inspection for the new target. |
| `scripts/generate-import-templates.mjs` | Produce the approved purchase receipt template. |

### Task 1: Add secure private draft-cost and exact-SKU contracts

**Files:**
- Create: `supabase/migrations/<CLI-generated>_purchase_draft_costs.sql`
- Modify: `supabase/tests/phase_1c_inventory_assertions.sql`
- Test: `supabase/tests/phase_1c_inventory_assertions.sql`

**Interfaces:**
- Consumes: existing `api.purchase_receipts`, `api.purchase_receipt_lines`, `app_private.purchase_receipt_line_costs`, permission helpers and command deduplication.
- Produces: `app_private.purchase_receipt_draft_line_costs`, extended `api.save_purchase_receipt_draft(...)`, existing-signature `api.post_purchase_receipt(uuid,bigint,jsonb,uuid)`, extended `api.get_purchase_receipt_cost_detail(uuid)`, and `api.resolve_purchase_receipt_products(text[])`.

- [ ] **Step 1: Add failing transactional SQL assertions for the intended contracts.**

Add the private table and resolver signatures to the initial contract checks, and add command assertions that save a DRAFT with `unitCost`, verify no cost field appears in operational JSON, verify creator-only draft-cost read, and verify a DRAFT post writes the final cost. The command fixture must use a generated SKU pair and these payload shapes:

```sql
jsonb_build_array(
  jsonb_build_object('productId', v_product_one_id, 'receivedQty', '2', 'unitCost', '12500.50'),
  jsonb_build_object('productId', v_product_two_id, 'receivedQty', '1', 'unitCost', '9000')
)
```

Add negative assertions for `unitCost = '0'`, a missing `unitCost`, an inactive product, duplicate `productId`, and a resolver call containing one known and one unknown SKU.

- [ ] **Step 2: Run the SQL assertion file in parse-only review mode and confirm the new symbols are absent.**

Run: `pnpm exec supabase db query --help`

Expected: command help is displayed; do not connect or execute Cloud SQL in this planning-stage test.

- [ ] **Step 3: Create the additive migration using the CLI, then implement the private contract.**

Run: `pnpm exec supabase migration new purchase_draft_costs`

In the generated file create the private relation below, enable and force RLS, revoke all table privileges from `PUBLIC`, `anon`, and `authenticated`, and grant direct access only to `service_role`:

```sql
create table app_private.purchase_receipt_draft_line_costs (
  purchase_receipt_line_id uuid primary key references api.purchase_receipt_lines(id) on delete cascade,
  unit_cost numeric(18,2) not null check (unit_cost > 0),
  line_cost numeric(20,2) not null check (line_cost > 0),
  entered_by uuid not null references api.profiles(id) on delete restrict,
  updated_at timestamptz not null default now()
);
```

Replace the save implementation so `p_lines` accepts exactly `productId`, `receivedQty`, `unitCost`; validates the two canonical formats and positivity before any write; inserts the line order and `round(received_qty * unit_cost, 2)` into the private table inside the existing command transaction. Preserve idempotency/version/audit behavior and do not put unit cost in operational/audit JSON.

Keep the public post signature for backward compatibility. For `DRAFT`, require an empty JSON array and load all costs from `purchase_receipt_draft_line_costs`; reject missing draft cost with `COST_LINES_REQUIRED`. For legacy `AWAITING_COST`, preserve the current validated `p_cost_lines` branch. In both branches insert only the final values into `purchase_receipt_line_costs` after stock locks have been acquired.

Update cost-detail logic so it returns draft costs only when `(receipt.created_by = auth.uid() and has purchase.draft.manage and purchase.cost.enter)` or the caller has `purchase.cost.read`; keep final costs restricted to `purchase.cost.read`. Grant `purchase.cost.enter` to each active role currently assigned `purchase.draft.manage`, without granting `purchase.cost.read`.

Add `app_private.resolve_purchase_receipt_products_impl(p_skus text[])` and an `api` security-invoker wrapper. It must reject callers without `purchase.draft.manage`, null/empty arrays and arrays over 5,000; trim/NFC normalize each requested SKU, match exact active `api.products.sku`, preserve input order, and return only `{requestedSku, productId, sku, productName, unitName, isActive}`. Revoke `PUBLIC` and grant only `authenticated` on every new/replaced wrapper and implementation function.

- [ ] **Step 4: Review migration security and assertions.**

Run: `rg -n "purchase_receipt_draft_line_costs|resolve_purchase_receipt_products|unitCost|COST_LINES_REQUIRED" supabase/migrations supabase/tests/phase_1c_inventory_assertions.sql`

Expected: every new table is private and RLS-forced, only wrappers in `api` are callable by `authenticated`, cost fields are absent from operational DTO SQL, and each required failure appears in an assertion.

- [ ] **Step 5: Commit the database contract and assertions.**

```bash
git add supabase/migrations supabase/tests/phase_1c_inventory_assertions.sql
git commit -m "feat: persist priced purchase drafts"
```

### Task 2: Make purchase client models and commands price-aware

**Files:**
- Create: `src/features/inventory/purchase/api/purchase-api.test.ts`
- Modify: `src/features/inventory/purchase/model/purchase-draft.ts`
- Modify: `src/features/inventory/purchase/api/purchase-api.ts`
- Modify: `src/features/inventory/purchase/api/purchase-schemas.ts`
- Test: `src/features/inventory/purchase/api/purchase-api.test.ts`

**Interfaces:**
- Consumes: Task 1 `save_purchase_receipt_draft`, `get_purchase_receipt_cost_detail`, and `resolve_purchase_receipt_products` RPCs.
- Produces: `PurchaseDraftLine { productId: string; receivedQty: string; unitCost: string }`, `PurchaseApi.resolveProductsBySku(skus: string[])`, and a `post(id, version, idempotencyKey?)` client method that sends no client-owned costs.

- [ ] **Step 1: Write failing API contract tests.**

Mock the inventory RPC transport and assert these requests exactly:

```ts
expect(rpc).toHaveBeenCalledWith(
  'save_purchase_receipt_draft',
  expect.objectContaining({
    p_lines: [{ productId, receivedQty: '2', unitCost: '12500.50' }],
  }),
  expect.anything(),
);
expect(rpc).toHaveBeenCalledWith(
  'post_purchase_receipt',
  expect.objectContaining({ p_cost_lines: [] }),
  expect.anything(),
);
```

Also test that a resolver response with an unmatched `requestedSku` still parses and that a malformed UUID or decimal response is rejected by Zod.

- [ ] **Step 2: Run the focused API test and confirm it fails because the new API methods/types do not exist.**

Run: `pnpm vitest run src/features/inventory/purchase/api/purchase-api.test.ts`

Expected: FAIL with missing `unitCost`, resolver, or changed `post` contract.

- [ ] **Step 3: Implement the model, schemas and API wrappers.**

Use these public TypeScript shapes:

```ts
export type PurchaseDraftLine = {
  productId: string;
  receivedQty: string;
  unitCost: string;
};

type ResolvedPurchaseProduct = {
  requestedSku: string;
  productId: string | null;
  sku: string | null;
  productName: string | null;
  unitName: string | null;
  isActive: boolean;
};
```

Extend save payloads with `unitCost`. Keep cost DTO parsing separate from operational receipt parsing. `resolveProductsBySku` must return early with `[]` for an empty caller list, otherwise call the resolver with `p_skus`. `post` must send `p_cost_lines: []`; it must not accept a `costs` parameter.

- [ ] **Step 4: Run focused tests and TypeScript validation.**

Run: `pnpm vitest run src/features/inventory/purchase/api/purchase-api.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the purchase client contract.**

```bash
git add src/features/inventory/purchase/api src/features/inventory/purchase/model/purchase-draft.ts
git commit -m "feat: send purchase costs with draft lines"
```

### Task 3: Replace the product select and owner-cost handoff in the draft UI

**Files:**
- Create: `src/features/inventory/purchase/components/PurchaseProductCombobox.tsx`
- Create: `src/features/inventory/purchase/components/PurchaseProductCombobox.test.tsx`
- Modify: `src/features/inventory/purchase/components/PurchaseLineEditor.tsx`
- Modify: `src/features/inventory/purchase/components/PurchaseActions.tsx`
- Modify: `src/features/inventory/purchase/pages/PurchaseDetailPage.tsx`
- Modify: `src/features/inventory/purchase/pages/PurchaseDetailPage.test.tsx`
- Test: `src/features/inventory/purchase/components/PurchaseProductCombobox.test.tsx`
- Test: `src/features/inventory/purchase/pages/PurchaseDetailPage.test.tsx`

**Interfaces:**
- Consumes: Task 2 `PurchaseDraftLine`, `PurchaseApi.post`, and `catalogApi.list({ search, limit: 20 })`.
- Produces: a searchable product line editor and a DRAFT-only direct post action that has no client price payload.

- [ ] **Step 1: Write failing combobox and page tests.**

Cover typing `THUOC-A`, typing a product name and typing a barcode; make the fake catalog API return matching items. Verify Enter selects the active unselected result, duplicate/inactive items cannot be selected, Escape closes the result list, and the resulting line renders the product detail link. In `PurchaseDetailPage.test.tsx`, give the logged-in creator `purchase.draft.manage` and `purchase.cost.enter`, then assert the page fetches draft costs, renders `Đơn giá nhập`, refuses blank/zero cost before `save`, removes **Gửi owner nhập giá**, and calls post with no line-cost parameter.

- [ ] **Step 2: Run the two focused component suites and confirm failure.**

Run: `pnpm vitest run src/features/inventory/purchase/components/PurchaseProductCombobox.test.tsx src/features/inventory/purchase/pages/PurchaseDetailPage.test.tsx`

Expected: FAIL because the select-only editor and AWAITING_COST handoff are still present.

- [ ] **Step 3: Implement the accessible product combobox.**

Give the input `role="combobox"`, an `aria-controls` listbox and `aria-expanded`; debounce a nonempty query by 250 ms; cancel stale result application in `useEffect`; render SKU/name/unit; maintain active option index for ArrowUp/ArrowDown, select with Enter, close with Escape/click outside. Filter any inactive result and every `lineProductIds` value except the row's current product before rendering. Preserve initial line products by injecting the receipt/prefill item into the local result map.

- [ ] **Step 4: Implement required draft costs and the direct post state machine.**

In `PurchaseLineEditor`, place a `NumericField` labelled `Đơn giá nhập` on every editable DRAFT row whenever `canEnterCost` is true. Initial blank/new rows use `{ productId: '', receivedQty: '1', unitCost: '' }`. Hydrate a creator's persisted draft costs through the scoped cost-detail RPC, but do not request/render them for an unauthorized viewer.

In `save`, require every line to have a unique product, positive quantity and positive money cost before invoking the command. In `PurchaseActions`, remove the submit action for DRAFT; allow a post-permitted user to post a fully priced DRAFT through `useFinancialCommand`. Retain the old AWAITING_COST controls only for legacy receipts and retain cancel/reverse/offline/version behavior.

- [ ] **Step 5: Run tests and inspect the user-facing labels.**

Run: `pnpm vitest run src/features/inventory/purchase/components/PurchaseProductCombobox.test.tsx src/features/inventory/purchase/pages/PurchaseDetailPage.test.tsx && pnpm lint && pnpm typecheck`

Expected: PASS; no visible **Gửi owner nhập giá** control for a new DRAFT and no price request for a user outside the scoped cost permission.

- [ ] **Step 6: Commit the searchable priced draft editor.**

```bash
git add src/features/inventory/purchase/components src/features/inventory/purchase/pages/PurchaseDetailPage.tsx src/features/inventory/purchase/pages/PurchaseDetailPage.test.tsx
git commit -m "feat: enter purchase costs in draft lines"
```

### Task 4: Add strict all-or-nothing purchase Excel import

**Files:**
- Create: `src/features/inventory/purchase/model/purchase-excel-import.ts`
- Create: `src/features/inventory/purchase/model/purchase-excel-import.test.ts`
- Create: `src/features/inventory/purchase/components/PurchaseExcelImportDialog.tsx`
- Create: `src/features/inventory/purchase/components/PurchaseExcelImportDialog.test.tsx`
- Modify: `src/features/imports/model/contracts.ts`
- Modify: `src/features/imports/model/template-contracts.ts`
- Modify: `src/features/imports/model/template-contracts.test.ts`
- Modify: `src/features/imports/parser/workbook-parser.test.ts`
- Modify: `src/features/inventory/purchase/components/PurchaseLineEditor.tsx`
- Modify: `src/features/inventory/purchase/pages/PurchaseDetailPage.tsx`
- Modify: `scripts/generate-import-templates.mjs`
- Test: `src/features/inventory/purchase/model/purchase-excel-import.test.ts`
- Test: `src/features/inventory/purchase/components/PurchaseExcelImportDialog.test.tsx`

**Interfaces:**
- Consumes: Task 2 `resolveProductsBySku`, generic `inspectWorkbook(file, { target: 'PURCHASE_RECEIPT', version: 1 })`, and `PurchaseDraftLine`.
- Produces: `validatePurchaseReceiptWorkbook(...)` returning `{ rows, issues, canApply }`; `canApply` is true only when every input row is valid.

- [ ] **Step 1: Write failing contract/parser tests for the new workbook target.**

Add this expected contract to `template-contracts.test.ts`:

```ts
[
  { header: 'SKU', field: 'sku', type: 'text', required: true },
  { header: 'Số lượng nhận', field: 'receivedQty', type: 'quantity', required: true },
  { header: 'Đơn giá nhập', field: 'unitCost', type: 'money', required: true },
]
```

Update the workbook factory so metadata is parameterized, then prove the inspector accepts a correct `PURCHASE_RECEIPT` v1 workbook and still rejects a formula, merge, extra sheet, wrong metadata and over-limit input.

- [ ] **Step 2: Write failing pure-validation and dialog tests.**

Use rows 2–5 containing: a valid SKU, missing SKU, zero quantity and a duplicate SKU. Mock resolver output for the valid SKU. Assert row numbers and Vietnamese issue messages are stable; assert `canApply` is false and the **Nạp vào phiếu** button is disabled. Add a separate all-valid fixture and assert clicking **Nạp vào phiếu** calls `onApply` once with every resolved `{productId, receivedQty, unitCost}` and never calls the save API.

- [ ] **Step 3: Run the focused import suites and confirm failure.**

Run: `pnpm vitest run src/features/imports/model/template-contracts.test.ts src/features/imports/parser/workbook-parser.test.ts src/features/inventory/purchase/model/purchase-excel-import.test.ts src/features/inventory/purchase/components/PurchaseExcelImportDialog.test.tsx`

Expected: FAIL because `PURCHASE_RECEIPT`, the validator and dialog do not exist.

- [ ] **Step 4: Implement the template, parser integration and pure validator.**

Add `PURCHASE_RECEIPT` to `ImportTarget`, `IMPORT_TARGETS` and `CURRENT_TEMPLATE_VERSION`; create a contract named `purchase-receipt-v1.xlsx` with exactly the three approved fields. Keep the generic workbook inspection limits unchanged.

Implement a pure validator that: checks exact headers; trims SKU; validates canonical quantity/money with the existing numeric utility; reports duplicate normalized SKU in the file; reports any product ID already in the editor; calls the resolver once with unique candidate SKUs; reports unknown/inactive resolver rows; and maps only resolved valid rows to `PurchaseDraftLine`. Set `canApply` to `issues.length === 0 && lines.length > 0`.

- [ ] **Step 5: Implement the dialog and editor integration.**

The editor exposes **Tải file mẫu** linking to `/templates/import/purchase-receipt-v1.xlsx` and **Nhập từ Excel** only while editable. The dialog reads `File` locally through `inspectWorkbook`, renders the exact six preview columns in the spec, has an accessible error summary, and clears its transient state on close/reselection. On apply, append all parsed lines to the current editor state and close; do not call `save`, mutate receipt state, or replace NCC/date/note.

- [ ] **Step 6: Generate and verify the binary template, then run focused tests.**

Run: `pnpm templates:generate && pnpm templates:verify && pnpm vitest run src/features/imports/model/template-contracts.test.ts src/features/imports/parser/workbook-parser.test.ts src/features/inventory/purchase/model/purchase-excel-import.test.ts src/features/inventory/purchase/components/PurchaseExcelImportDialog.test.tsx`

Expected: `public/templates/import/purchase-receipt-v1.xlsx` is regenerated and every focused test passes.

- [ ] **Step 7: Commit the all-or-nothing Excel workflow.**

```bash
git add src/features/imports src/features/inventory/purchase scripts/generate-import-templates.mjs public/templates/import/purchase-receipt-v1.xlsx
git commit -m "feat: import purchase receipt lines from excel"
```

### Task 5: Verify, document, and prepare the separately approved migration release

**Files:**
- Modify: `docs/guides/huong-dan-su-dung-co-ban-tuenhi.docx`
- Modify: `docs/guides/build_user_guide.py`
- Modify: `README.md`
- Modify: `docs/runbooks/phase-2-purchase-entry-release.md`
- Test: `src/features/inventory/purchase/**/*.test.tsx`
- Test: `src/features/imports/**/*.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4 and the existing controlled-development Cloud policy.
- Produces: an updated novice guide/runbook and a release checklist that does not apply a migration until an owner expressly authorizes it.

- [ ] **Step 1: Write the release checklist before running release commands.**

Document these ordered gates in the new runbook: local `pnpm check`; review the single CLI-generated migration; Cloud identity/migration-list/advisor read-only checks; owner approval of the reviewed migration; `db push --dry-run`; apply only that migration; regenerate types; run SQL assertions and read-only verification; deploy frontend; verify a real manual receipt without synthetic data. Document rollback as frontend rollback plus an additive follow-up migration, never a down migration or data rewrite.

- [ ] **Step 2: Update the novice guide source and regenerate the approved DOCX.**

Add the purchase steps: choose/search product by SKU/name/barcode, enter positive unit cost on each line, optionally download/import the three-column template, fix every preview error, then save draft and let an authorized owner post. State that supplier/date/note stay in the app. Do not document an owner price-request step.

- [ ] **Step 3: Run local quality gates and render the guide for visual QA.**

Run: `pnpm check`

Run the existing document builder and render workflow from `docs/guides/build_user_guide.py`, then inspect every rendered page for clipped Vietnamese labels and incorrect workflow copy.

Expected: local checks pass and the rendered guide has no old **Gửi owner nhập giá** instruction.

- [ ] **Step 4: Record Cloud release as a human approval checkpoint, not an automatic action.**

Do not run `db push` in an autonomous task. Present the reviewed migration and dry-run command to the owner, obtain an explicit release approval, then follow the new runbook exactly.

- [ ] **Step 5: Commit documentation and the release runbook.**

```bash
git add README.md docs/guides docs/runbooks/phase-2-purchase-entry-release.md
git commit -m "docs: describe priced purchase receipt workflow"
```
