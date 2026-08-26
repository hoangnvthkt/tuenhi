# Phase 1F-B6 — Dữ liệu thật và baseline backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay thế dữ liệu mock Owner Pilot bằng dữ liệu vận hành thật đã được Owner phê duyệt, sau đó tạo và xác minh hai baseline backup trước giao dịch bán thật đầu tiên.

**Architecture:** B6-A thêm một luồng service-only hai pha để lập manifest và hủy dữ liệu mock theo đúng manifest, có audit và không dùng runner/cleanup tổng hợp cũ. B6-B chỉ chạy sau phê duyệt manifest của Owner: nhập dữ liệu trực tiếp qua ứng dụng, đối soát, tạo baseline database + Storage đã mã hóa ở `/Users/admin/TueNhi-Backups`, và giữ Cloud ở `OWNER_PILOT`.

**Tech Stack:** React 19, TypeScript, TanStack Query, Supabase Cloud/Postgres, Supabase Storage, Node.js scripts, native `pg_dump`/`pg_restore`, OpenSSL AES-256, Vitest, Playwright.

**Spec:** `docs/runbooks/phase-1f-b5-owner-pilot-readiness.md`, `docs/reports/2026-08-25-phase-1f-b5-production-readiness.md`, and the approved Phase 1F-B3/B5 boundaries in the handoff history.

## Global Constraints

- Create branch `codex/phase-1f-b6-real-data-baselines` from B5 commit `838ac1c`; never merge `main` or deploy Vercel Production in B6.
- Keep Supabase project `ccfhkhtxoruyniwxowrz` in `OWNER_PILOT`; do not run `cutover:preflight`, `cutover:cleanup-tests`, Cloud runners, Cloud E2E, automated cleanup, restore, or lifecycle commands.
- Do not create staff accounts. The Owner Waiver remains audited but is not used to invite staff in B6.
- The only retained records through mock disposal are the verified Owner identity, lifecycle/policy/audit history, migrations, and Supabase Auth configuration. Store configuration and sales channels require Owner’s explicit keep-or-replace decision in the manifest approval.
- No deletion happens merely because a record looks like test data. Disposal must be service-only, use a manifest generated immediately before execution, reject any live-state hash mismatch, and record an audit receipt.
- Do not commit real workbooks, images, generated manifests, database dumps, encrypted archives, receipts, passphrases, or credentials.
- Use `/Users/admin/TueNhi-Backups` only after the Owner starts entering real data; passphrases are interactive only and never supplied through chat, flags, environment variables, or logs.
- Product quantities remain canonical integers. Currency remains canonical decimal strings; do not recompute server financial totals with `Number` or `parseFloat`.

---

## Decision gate before any delete

Owner must approve one manifest produced by B6-A and state one of these exact dispositions for store configuration:

| Record family | Required Owner decision |
| --- | --- |
| Owner Auth/profile, lifecycle/policy/audit | Always retain |
| Store settings and branding | Retain as real configuration, or replace as mock configuration |
| Sales channels | Retain as real configuration, or replace as mock configuration |
| Categories, suppliers, customers, products, prices, product images | Dispose |
| Opening/purchase/count documents, balances, movements, cost records | Dispose |
| Sales, payments, returns, financial events, transfer proofs | Dispose |
| Import runs and legacy archive data | Dispose |

The approval message must include the manifest SHA-256 and disposition. A changed manifest, a new document, or an unknown storage object invalidates approval and requires a new manifest. B6-A may be implemented and deployed before approval; B6-B must not begin before approval.

## File map

- `supabase/migrations/<timestamp>_phase_1f_b6_owner_pilot_mock_disposition.sql` — private manifest/disposal/finalization functions, service-only API wrappers, immutable audit receipt, grants and empty search paths.
- `supabase/tests/phase_1f_b6_mock_disposition_assertions.sql` — function signatures, grants, private boundary, lifecycle/policy guards, mismatch/retry behavior.
- `scripts/cutover-mock-manifest.mjs` — read-only service command that writes a versioned manifest outside the repository and prints its SHA-256.
- `scripts/cutover-dispose-mock.mjs` — service-only two-phase delete command; validates the approved manifest, deletes only exact DB records, removes the returned Storage paths, finalizes the audit receipt.
- `scripts/cutover-verify-real-data.mjs` — read-only reconciliation command for catalog, images, opening inventory, valuation, financial event count and reports before first sale.
- `scripts/cutover-lib.mjs` — shared stable JSON hashing, external-path checks and protected service calls.
- `scripts/*.test.mjs` — manifest hashing, workspace refusal, mismatched-manifest rejection, Storage finalization and no-plaintext archive behavior.
- `package.json` — adds `cutover:mock-manifest`, `cutover:dispose-mock`, and `cutover:verify-real-data` only.
- `docs/runbooks/phase-1f-b6-real-data-baselines.md` — Owner-facing execution checklist and recorded sign-offs.
- `docs/reports/2026-08-26-phase-1f-b6-real-data-readiness.md` — append-only evidence report; initially records B6-A, then B6-B baseline receipts and reconciliation.

### Task 1: Establish B6 branch, read-only baseline and Owner manifest contract

**Files:**
- Create: `docs/runbooks/phase-1f-b6-real-data-baselines.md`
- Create: `docs/reports/2026-08-26-phase-1f-b6-real-data-readiness.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `node --env-file=.env scripts/cutover-verify.mjs` and the current B5 readiness report.
- Produces: a signed-off baseline section containing branch/commit, lifecycle, staff policy, mock counts, and the disposition table above.

- [ ] **Step 1: Create the B6 branch and capture a read-only baseline**

Run:

```bash
git switch -c codex/phase-1f-b6-real-data-baselines 838ac1c
node --env-file=.env scripts/cutover-verify.mjs
pnpm exec supabase migration list --linked
pnpm exec supabase db lint --linked --level error
pnpm exec supabase db advisors --linked --type security --level error --fail-on error
pnpm exec supabase db advisors --linked --type performance --level error --fail-on error
```

Expected: lifecycle `OWNER_PILOT`, policy `OWNER_WAIVER`, one Owner profile, and an explicit list of mock operational counts. Do not run `cutover:preflight`.

- [ ] **Step 2: Write the Owner runbook before adding any delete path**

Document the exact manifest approval string:

```text
Tôi duyệt manifest <sha256>; cấu hình cửa hàng: <retain|replace>; kênh bán: <retain|replace>.
```

Document that the action permanently deletes only the listed mock data, that no mock backup is requested, and that real-data backup begins only after the catalog/imagery stage.

- [ ] **Step 3: Add a failing documentation contract test**

Create a small Node test that reads the runbook and asserts it contains `OWNER_PILOT`, `manifest SHA-256`, `/Users/admin/TueNhi-Backups`, both baseline milestones, and the no-Production constraint.

Run:

```bash
node --test scripts/cutover-real-data-runbook.test.mjs
```

Expected: FAIL until the runbook contains every mandatory phrase.

- [ ] **Step 4: Complete the documentation and make the contract test pass**

Run:

```bash
node --test scripts/cutover-real-data-runbook.test.mjs
pnpm format:check
git diff --check
```

Expected: documentation is explicit enough to prevent a delete without an Owner-reviewed hash.

- [ ] **Step 5: Commit the baseline/runbook slice**

```bash
git add README.md docs/runbooks/phase-1f-b6-real-data-baselines.md \
  docs/reports/2026-08-26-phase-1f-b6-real-data-readiness.md \
  scripts/cutover-real-data-runbook.test.mjs
git commit -m "docs: define owner-pilot real data cutover"
```

### Task 2: Service-only manifest and guarded mock-disposal database contract

**Files:**
- Create: `supabase/migrations/<timestamp>_phase_1f_b6_owner_pilot_mock_disposition.sql`
- Create: `supabase/tests/phase_1f_b6_mock_disposition_assertions.sql`

**Interfaces:**
- Consumes: lifecycle data from `app_private`, business tables in `api`, and the Owner-only service role.
- Produces:

```sql
api.get_owner_pilot_mock_manifest(p_keep_store_settings boolean, p_keep_sales_channels boolean)
api.dispose_owner_pilot_mock_data(p_manifest_sha256 text, p_keep_store_settings boolean, p_keep_sales_channels boolean)
api.finalize_owner_pilot_mock_storage_disposal(p_receipt_id uuid, p_deleted_paths jsonb)
```

All wrappers are `security invoker`, are granted only to `service_role`, and return an envelope with a correlation ID. Their `app_private` implementations are `security definer set search_path = ''` and are not granted to `anon` or `authenticated`.

- [ ] **Step 1: Write failing SQL assertions first**

The assertion file must raise when any condition below is false:

```sql
-- service_role has EXECUTE; authenticated and anon do not
-- all private implementations are security definer with search_path=""
-- only OWNER_PILOT + OWNER_WAIVER or LEAKED_PASSWORD_PROTECTED may dispose
-- a hash mismatch raises MOCK_MANIFEST_MISMATCH without deleting rows
-- an already-finalized receipt cannot delete anything a second time
-- direct authenticated SELECT on financial/cost tables remains denied
```

Run the assertions before the migration; expected result is failure because the functions do not exist.

- [ ] **Step 2: Implement a stable manifest calculation in `app_private`**

The manifest payload must have deterministic keys and sorted UUID/path arrays:

```json
{
  "version": 1,
  "lifecycle": "OWNER_PILOT",
  "keepStoreSettings": false,
  "keepSalesChannels": false,
  "records": {
    "categories": [], "suppliers": [], "customers": [], "products": [],
    "productImages": [], "purchaseReceipts": [], "openingDocuments": [],
    "stockCounts": [], "sales": [], "saleReturns": [], "importRuns": [], "legacySales": []
  },
  "storagePaths": { "productImages": [], "paymentProofs": [], "storeBranding": [] }
}
```

Hash the UTF-8 stable JSON with `encode(digest(payload::text, 'sha256'), 'hex')`. The manifest includes IDs and object paths, never credentials or passphrases.

- [ ] **Step 3: Implement the two-phase disposition transaction**

`dispose_owner_pilot_mock_data` recomputes the manifest inside the transaction, verifies its SHA-256 and both keep flags, inserts an immutable audit receipt, then deletes only manifest IDs in FK-safe order. It must preserve Owner Auth/profile and lifecycle/audit tables. It returns `{ receiptId, storagePaths, correlationId }` but does not remove Storage itself.

`finalize_owner_pilot_mock_storage_disposal` accepts only the exact, sorted set of paths returned by the receipt and marks it finalized. It rejects missing, additional, duplicate, or mismatched paths with `MOCK_STORAGE_DISPOSAL_MISMATCH`.

- [ ] **Step 4: Run the migration security gate before Cloud push**

```bash
pnpm exec supabase db push --dry-run
pnpm exec supabase db query --linked --file supabase/tests/phase_1f_b6_mock_disposition_assertions.sql
```

Expected: dry-run lists only the B6 migration; assertions fail before push and pass only after applying it.

- [ ] **Step 5: Apply and verify without disposing data**

```bash
pnpm exec supabase db push
pnpm exec supabase db query --linked --file supabase/tests/phase_1f_b6_mock_disposition_assertions.sql
pnpm exec supabase migration list --linked
pnpm exec supabase db lint --linked --level error
```

Expected: functions exist and are unreachable from browser roles. No business row count changes.

- [ ] **Step 6: Commit the database contract slice**

```bash
git add supabase/migrations supabase/tests
git commit -m "feat: guard owner-pilot mock disposition"
```

### Task 3: Manifest/disposal scripts and non-destructive test coverage

**Files:**
- Create: `scripts/cutover-mock-manifest.mjs`
- Create: `scripts/cutover-dispose-mock.mjs`
- Create: `scripts/cutover-mock-manifest.test.mjs`
- Create: `scripts/cutover-dispose-mock.test.mjs`
- Modify: `scripts/cutover-lib.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes the three service-only RPCs from Task 2 and absolute `CUTOVER_MANIFEST_DIR` outside the repository.
- Produces:

```bash
pnpm cutover:mock-manifest -- --keep-store-settings --keep-sales-channels
pnpm cutover:dispose-mock -- --manifest /absolute/path/manifest.json --confirm
```

- [ ] **Step 1: Write failing script tests**

Use temporary directories outside the workspace and mock the service client. Cover:

```js
assert.rejects(() => assertExternalDirectory(process.cwd(), 'CUTOVER_MANIFEST_DIR'));
assert.throws(() => parseManifest({ sha256: 'not-a-64-char-hex' }));
assert.rejects(() => dispose({ approvedHash: staleHash }), /MOCK_MANIFEST_MISMATCH/);
assert.deepEqual(sortedUniquePaths(input), expectedPaths);
```

Also prove the script never calls the finalization RPC when one Storage delete fails, and never logs a service key, manifest contents marked as sensitive, or a passphrase.

- [ ] **Step 2: Implement `cutover:mock-manifest` as read-only**

Require `CUTOVER_MANIFEST_DIR` to be an absolute external directory. Call only `get_owner_pilot_mock_manifest`, write `tuenhi-owner-pilot-mock-manifest-<UTC>.json` with mode `0600`, calculate a local SHA-256, and fail if it differs from the server SHA-256.

- [ ] **Step 3: Implement `cutover:dispose-mock` with two explicit confirmations**

Require `--manifest`, `--confirm`, and the exact textual environment value `CUTOVER_MOCK_DISPOSITION=OWNER_APPROVED`. Validate the external manifest, call the dispose RPC, delete exactly returned private Storage objects through the service client, then call finalization. On a Storage error, print the receipt ID and stop; do not retry DB disposal or run broad bucket cleanup.

- [ ] **Step 4: Run targeted tests and static checks**

```bash
node --test scripts/cutover-mock-manifest.test.mjs scripts/cutover-dispose-mock.test.mjs
pnpm check
git diff --check
```

Expected: all failure paths leave Cloud business data untouched; no code calls legacy `cutover:cleanup-tests`.

- [ ] **Step 5: Commit and push Preview checkpoint B6-A**

```bash
git add package.json scripts
git commit -m "feat: add guarded owner-pilot mock disposal tools"
git push origin codex/phase-1f-b6-real-data-baselines
```

Do not invoke disposal until the Owner approves an actual generated manifest.

### Task 4: Owner approval, one-time mock disposition and post-disposal verification

**Files:**
- Modify: `docs/reports/2026-08-26-phase-1f-b6-real-data-readiness.md`

**Interfaces:**
- Consumes the manifest file from Task 3 and explicit Owner approval.
- Produces a finalized audit receipt, zero mock operational counts and an updated report; lifecycle remains `OWNER_PILOT`.

- [ ] **Step 1: Generate and present the manifest without deleting**

```bash
CUTOVER_MANIFEST_DIR=/Users/admin/TueNhi-Backups \
pnpm cutover:mock-manifest -- --keep-store-settings --keep-sales-channels
```

Record only file name, SHA-256, counts and object counts in the report. Ask Owner to choose retain/replace for store settings and channels and approve the exact hash.

- [ ] **Step 2: Stop if approval is absent or the manifest has changed**

Do not interpret an earlier generic statement such as “xóa mock” as approval for a new manifest. Regenerate after any intervening write and obtain a new approval.

- [ ] **Step 3: Execute the exact approved disposition**

```bash
CUTOVER_MANIFEST_DIR=/Users/admin/TueNhi-Backups \
CUTOVER_MOCK_DISPOSITION=OWNER_APPROVED \
pnpm cutover:dispose-mock -- --manifest /Users/admin/TueNhi-Backups/<manifest>.json --confirm
```

Expected: one audit receipt, only listed DB records deleted, only listed Storage paths deleted, and no lifecycle change.

- [ ] **Step 4: Verify read-only after disposal**

```bash
node --env-file=.env scripts/cutover-verify.mjs
pnpm cutover:verify-real-data -- --expect-empty-operational-data
```

Expected: Owner profile retained; selected settings/channels follow approved disposition; categories, products, balances, movements, sales, returns, financial events, imports and legacy archive are empty; no `codex-phase*` data is introduced.

- [ ] **Step 5: Record receipt and commit documentation only**

Store the local receipt and manifest outside git. Commit only the report’s SHA-256, aggregate counts, UTC timestamps, and Owner approval reference:

```bash
git add docs/reports/2026-08-26-phase-1f-b6-real-data-readiness.md
git commit -m "docs: record approved mock disposition"
```

### Task 5: Owner enters real catalog and create baseline 1

**Files:**
- Modify: `docs/runbooks/phase-1f-b6-real-data-baselines.md`
- Modify: `docs/reports/2026-08-26-phase-1f-b6-real-data-readiness.md`

**Interfaces:**
- Consumes an empty operational database and the Owner Preview application.
- Produces catalog/image reconciliation and verified encrypted baseline 1 archives outside the repository.

- [ ] **Step 1: Enter real master data in application order**

Owner enters, through Preview only:

1. store configuration and sales channels (if replaced);
2. categories;
3. suppliers;
4. products, SKU/barcode, price and min stock;
5. customers;
6. product images.

No SQL, no partial financial import and no real opening inventory in this step.

- [ ] **Step 2: Perform read-only catalog/image reconciliation**

Run `cutover:verify-real-data -- --stage=catalog` and compare its SKU, barcode, category, supplier, customer and image count output with Owner’s source list. Open a sample of signed product image URLs as Owner. Resolve all validation errors in the app before continuing.

- [ ] **Step 3: Produce and verify baseline 1**

Use an interactive passphrase, never a CLI argument:

```bash
CUTOVER_BACKUP_DIR=/Users/admin/TueNhi-Backups \
pnpm cutover:backup

CUTOVER_IMAGE_EXPORT_DIR=/Users/admin/TueNhi-Backups \
pnpm cutover:export-images

CUTOVER_BACKUP_DIR=/Users/admin/TueNhi-Backups \
pnpm cutover:verify-backup -- --archive /Users/admin/TueNhi-Backups/<database-archive>.enc
```

Verify archive receipt checksums, `pg_restore --list`, storage manifests and sample image bytes. Copy encrypted archives, receipts and manifests to the Owner’s external drive, then repeat verification from that copy. Do not back up mock data and do not restore to Cloud.

- [ ] **Step 4: Record baseline 1 evidence**

Record archive file names, SHA-256 receipts, object/byte counts and verification timestamp in the report; do not commit file paths that reveal removable-drive labels or any archive contents.

### Task 6: Owner opens inventory, reconcile and create baseline 2

**Files:**
- Modify: `docs/runbooks/phase-1f-b6-real-data-baselines.md`
- Modify: `docs/reports/2026-08-26-phase-1f-b6-real-data-readiness.md`

**Interfaces:**
- Consumes verified catalog and baseline 1.
- Produces posted opening movements, zero sales financial events, verified baseline 2 and Owner sign-off before the first real sale.

- [ ] **Step 1: Create opening inventory/cost through the app**

Owner creates the opening document with positive integer quantities and canonical decimal unit costs, verifies every line, then submits/posts it. Do not use legacy suggestions containing fractional quantities and do not edit database rows directly.

- [ ] **Step 2: Reconcile before any sale**

Run:

```bash
pnpm cutover:verify-real-data -- --stage=opening
```

Expected invariants:

```text
SKU/barcode count = Owner source list
on-hand quantity per product = approved opening document
inventory valuation = sum(opening quantity × opening unit cost) from server DTO
opening movements = approved opening lines
sales financial events = 0
revenue report = 0
profit report = 0
legacy_sales contribution = 0
```

- [ ] **Step 3: Produce and verify baseline 2**

Repeat the baseline 1 backup/export/verify procedure after reconciliation and before the first real sale. Retain both baselines for at least 12 months unless Owner approves deletion later.

- [ ] **Step 4: Owner sign-off and B6 gate**

Owner signs the report for catalog, images, opening quantities, valuation and both backups. B6 ends with lifecycle still `OWNER_PILOT`, no staff accounts and no Production deployment.

- [ ] **Step 5: Final B6 evidence gate and commit report**

Run only allowed read-only checks:

```bash
pnpm check
pnpm test:e2e:ci
node --env-file=.env scripts/cutover-verify.mjs
pnpm exec supabase migration list --linked
pnpm exec supabase db lint --linked --level error
pnpm exec supabase db advisors --linked --type security --level error --fail-on error
pnpm exec supabase db advisors --linked --type performance --level error --fail-on error
git diff --check
```

Then commit the report only:

```bash
git add docs/reports/2026-08-26-phase-1f-b6-real-data-readiness.md
git commit -m "docs: record real data baselines"
```

## Acceptance criteria

- Mock operational data cannot be deleted by a browser, a direct authenticated RPC, an old cleanup runner, or a stale/modified manifest.
- B6 creates no staff and leaves lifecycle `OWNER_PILOT`.
- Every actual deletion is limited to an Owner-reviewed manifest, is audited, and has its DB/Storage result verified.
- Catalog and images are entered through the app; all quantity fields remain integer-only.
- Baseline 1 exists after catalog/images; baseline 2 exists after opening reconciliation; each is encrypted, checksum-verified locally and on external storage.
- Before the first real sale, all revenue/profit/financial event totals are zero and opening valuation matches the Owner-approved source.
- No mock or real data, secret, passphrase, archive or external-drive artifact is committed.

## Gate to B7

B6 does not merge `main`, deploy Production, change lifecycle to `PRODUCTION`, or create staff. B7 is a separate Owner-approved production-release phase: final Preview UAT on real data, merge/deploy to the existing Vercel Production project, exact production Auth URL smoke test, then a separate decision to retain Owner Pilot or transition lifecycle.
