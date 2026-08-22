# Tuệ Nhi Phase 1B Catalog and Excel Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện lát cắt catalog chạy được trên Supabase Cloud gồm danh mục hàng hóa, giá bán hiện hành, tồn số lượng bằng 0, nhà cung cấp, khách hàng E.164, kênh bán, ảnh sản phẩm private, generic Excel import và kho tra cứu workbook bán hàng cũ.

**Architecture:** React SPA đọc catalog qua security-invoker read models/RPC và ghi qua command envelope; browser không ghi trực tiếp bảng nghiệp vụ. PostgreSQL giữ RLS, optimistic version, idempotency, audit, import state machine và atomic commit; browser chỉ parse/generate `.xlsx` trong memory, loại bỏ cột nhạy cảm trước transport và không upload workbook gốc. Realtime chỉ làm tín hiệu invalidate/refetch cho TanStack Query, không thay thế dữ liệu authoritative.

**Tech Stack:** React 19.2.8, React Router 8.3.0, TanStack Query 5.101.4, React Hook Form 7.85.0, Zod 4.4.3, Tailwind CSS 4.3.3, Supabase JS 2.112.3, Supabase CLI 2.115.0, PostgreSQL 17.6, SheetJS CE 0.20.3, ExcelJS 4.4.0, libphonenumber-js 1.13.11, Vitest 4.1.11 và Playwright 1.62.1.

**Spec:** `docs/superpowers/specs/2026-08-21-internal-single-store-pos-design.md` và `docs/superpowers/specs/2026-08-22-cloud-platform-data-entry-design.md`

## Global Constraints

- Thực thi inline bằng agent chính với `superpowers:executing-plans`; không dùng sub-agent cho đến khi chủ dự án yêu cầu.
- Làm việc trên nhánh `codex/phase-1a-cloud-identity` sau khi chủ dự án quyết định cách tích hợp; không tự merge hoặc push.
- Supabase project ref duy nhất là `ccfhkhtxoruyniwxowrz`; không chạy `supabase start`, `supabase db reset`, Docker hoặc local shadow database.
- Không tạo hoặc link Vercel; Vercel tiếp tục bị hoãn.
- Mọi migration được tạo bằng CLI pin trong project, review, dry-run rồi mới push Cloud.
- Chỉ `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY` được phép vào browser bundle; không commit secret, workbook người dùng, dữ liệu nhận diện hoặc test credential.
- Data API chỉ expose `api` và `graphql_public`; `app_private` không expose. Exposed table bật và force RLS; direct write của browser bị revoke.
- Security-definer function chỉ ở `app_private`, có `set search_path = ''`, schema-qualify mọi object và tự kiểm tra actor active, password gate, permission, idempotency.
- Không có cost/purchase/opening-stock movement trong Phase 1B. Import chỉ tạo zero quantity balance; giá vốn và tồn đầu kỳ từ workbook cũ chỉ là suggestion owner-only, không được ghi sổ.
- Số lượng dùng `numeric(18,3)`, tiền dùng `numeric(18,2)`; client gửi canonical decimal string và server parse lại.
- Điện thoại lưu E.164 `^\+[1-9][0-9]{7,14}$`; form, paste và Excel dùng chung một normalizer, mặc định quốc gia `VN`, không nhận extension hoặc Unicode digits.
- File generic chỉ nhận `.xlsx`, tối đa 5 MiB, 5.000 data rows, 50 columns, đúng các sheet `Hướng dẫn`, `Dữ liệu`, `__tuenhi_meta`; formula, macro, external link, password protection, merged data cell và sheet dữ liệu phụ đều bị chặn.
- Import commit là all-or-nothing, revalidate dưới lock, dùng key order ổn định và trả kết quả cũ khi retry cùng idempotency key.
- Workbook gốc và error workbook chỉ ở browser memory. Raw rows/errors server giữ 30 ngày; audit/notification không chứa raw row hoặc cột khách hàng nhạy cảm.
- UI là dense internal POS, không phải landing page: light theme, teal `#0f766e`, input/button 8 px, panel 12 px, touch target tối thiểu 44 px, số dùng tabular numerals, loading/empty/error/offline/permission/unknown-outcome đầy đủ.
- Mọi thông báo người dùng là tiếng Việt; raw database/dependency errors, stack trace, secret và cost không xuất hiện ở client.
- Mỗi hành vi mới theo red-green-refactor. Mỗi task kết thúc bằng gate liên quan và một commit nhỏ.

---

### Task 1: Spreadsheet Dependencies, Phone Normalization and Workbook Contracts

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/lib/phone/normalize-phone.test.ts`
- Create: `src/lib/phone/normalize-phone.ts`
- Create: `src/features/imports/contracts.ts`
- Create: `src/features/imports/header-normalization.test.ts`
- Create: `src/features/imports/header-normalization.ts`
- Create: `src/features/imports/template-contracts.ts`
- Create: `scripts/generate-import-templates.mjs`
- Create: `scripts/verify-import-templates.mjs`
- Create: `public/templates/import/categories-v1.xlsx`
- Create: `public/templates/import/products-v1.xlsx`
- Create: `public/templates/import/suppliers-v1.xlsx`
- Create: `public/templates/import/customers-v1.xlsx`
- Create: `public/templates/import/customers-v2.xlsx`

**Interfaces:**
- Consumes: canonical decimal helpers from `src/lib/numeric/canonical-number.ts`.
- Produces: `normalizePhone(raw, defaultCountry): PhoneNormalizationResult`, `normalizeImportHeader(raw): string`, `IMPORT_TARGETS`, `getTemplateContract(target, version)` and deterministic template assets.

- [ ] **Step 1: Install only the reviewed spreadsheet and phone dependencies**

Run:

```bash
pnpm add exceljs@4.4.0 libphonenumber-js@1.13.11 https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

Expected: lockfile pins ExcelJS 4.4.0, libphonenumber-js 1.13.11 and SheetJS 0.20.3; no CDN runtime script is added to `index.html`.

- [ ] **Step 2: Write failing phone normalization tests**

Cover exact cases:

```ts
expect(normalizePhone('0912345678', 'VN')).toEqual({
  ok: true,
  e164: '+84912345678',
});
expect(normalizePhone('+84912345678', 'VN')).toEqual({
  ok: true,
  e164: '+84912345678',
});
for (const raw of ['0912 345 678', '0912-345-678', '０９１２３４５６７８', '+84+912345678', '0912345678x12']) {
  expect(normalizePhone(raw, 'VN')).toEqual({
    ok: false,
    code: 'PHONE_FORMAT_INVALID',
    message: 'Số điện thoại chưa đúng định dạng quốc tế.',
  });
}
```

Run: `pnpm test -- src/lib/phone/normalize-phone.test.ts`

Expected: FAIL because `normalizePhone` does not exist.

- [ ] **Step 3: Implement strict input screening plus E.164 conversion**

`normalizePhone` must return success for blank optional values as `{ ok: true, e164: null }`, reject characters outside ASCII digits and one leading plus before calling libphonenumber, call the library with `extract: false`, require `isValid()`, reject `ext`, and return `phone.number` only when it matches the database regex.

Run: `pnpm test -- src/lib/phone/normalize-phone.test.ts`

Expected: PASS.

- [ ] **Step 4: Write failing Unicode header and alias tests**

Assert NFC normalization, trim, repeated-space collapse and case-insensitive comparison without stripping Vietnamese accents:

```ts
expect(normalizeImportHeader('  Tên   sản phẩm ')).toBe('tên sản phẩm');
expect(normalizeImportHeader('Tên sản phẩm')).not.toBe(
  normalizeImportHeader('Ten san pham'),
);
expect(proposeHeaderMapping('SĐT', 'CUSTOMERS', 2)).toBe('phone');
```

Run: `pnpm test -- src/features/imports/header-normalization.test.ts`

Expected: FAIL before the module exists, then PASS after implementing a controlled alias dictionary per target/version.

- [ ] **Step 5: Define exact template contracts**

Use these stable target codes and versions:

```ts
export type ImportTarget = 'CATEGORIES' | 'PRODUCTS' | 'SUPPLIERS' | 'CUSTOMERS';
export type ImportMode = 'CREATE_ONLY' | 'UPDATE_EXISTING';
export const CURRENT_TEMPLATE_VERSION = {
  CATEGORIES: 1,
  PRODUCTS: 1,
  SUPPLIERS: 1,
  CUSTOMERS: 2,
} as const;
```

Contracts must contain ordered Vietnamese headers, stable field keys, required/optional flags, text/boolean/quantity/money/phone/email types, max lengths and sensitive customer aliases that are always mapped to `IGNORED_SENSITIVE`.

- [ ] **Step 6: Generate and contract-test all five workbooks**

Use ExcelJS in the Node script to create only the three required sheets, freeze/filter the header, format SKU/barcode/phone/code columns as text, set `__tuenhi_meta` to `veryHidden`, and add safe list/decimal validations. Use SheetJS in `verify-import-templates.mjs` to verify sheet names, metadata, header order, `!autofilter`, cell number formats and absence of formulas/external links/VBA.

Add scripts:

```json
{
  "templates:generate": "node scripts/generate-import-templates.mjs",
  "templates:verify": "node scripts/verify-import-templates.mjs"
}
```

Run:

```bash
pnpm templates:generate
pnpm templates:verify
pnpm check
```

Expected: five files pass contract verification and the full existing gate remains green.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml scripts public/templates src/lib/phone src/features/imports
git commit -m "feat: define catalog import contracts"
```

### Task 2: Catalog Schema, RLS, Commands and Cloud Types

**Files:**
- Create: `supabase/migrations/*_phase_1b_catalog.sql` using the CLI-generated filename
- Create: `supabase/tests/phase_1b_catalog_assertions.sql`
- Modify: `package.json`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: Phase 1A `app_private.has_active_profile`, `app_private.has_permission`, audit, notification and command-envelope helpers.
- Produces: catalog/category/customer/supplier/channel tables, zero balances, current-price private table, `api.product_catalog_read`, catalog save/list/detail commands and sales-channel commands.

- [ ] **Step 1: Create the migration with the pinned CLI**

Run: `pnpm exec supabase migration new phase_1b_catalog`

Expected: exactly one timestamped empty migration appears; do not rename it.

- [ ] **Step 2: Write Cloud schema assertions before DDL**

The transaction test must fail unless all tables/views/functions exist, every `api` table has enabled+forced RLS, every foreign key is indexed, `anon` has no usage, `authenticated` has no direct write, and cost fields do not appear in `api.product_catalog_read`.

Include exact privilege assertions for:

```sql
if has_table_privilege('authenticated', 'api.products', 'insert,update,delete') then
  raise exception 'browser must not write products directly';
end if;
if has_schema_privilege('authenticated', 'app_private', 'usage') is false then
  raise exception 'authenticated needs named helper execution, not table access';
end if;
if has_table_privilege('authenticated', 'app_private.product_sale_prices', 'select') then
  raise exception 'sale price history must stay private';
end if;
```

Run against linked Cloud and verify RED with `api.categories missing`.

- [ ] **Step 3: Create catalog tables and indexes**

Implement the approved columns and constraints for `api.categories`, `api.products`, `api.product_images`, `api.suppliers`, `api.customers`, `api.sales_channels`, `api.inventory_balances` and `app_private.product_sale_prices`.

Required details:

- Unique normalized category name and SKU; partial unique barcode when present.
- Customer/supplier code unique only when non-empty; customer phone E.164 check.
- `products.version bigint default 1`, supplier/customer version columns and update timestamps for optimistic conflict detection.
- One current sale price via partial unique `where valid_to is null`.
- One primary image via partial unique `(product_id) where is_primary` and command-enforced maximum five images.
- Index every foreign key plus `(is_active, name_normalized, id)`, `(category_id, is_active, name_normalized, id)` and `(actor_id/created_at)` access paths used by RLS/read models.
- Seed `IN_STORE`, `REMOTE_PROVINCE`, `ONLINE`, `WHOLESALE` idempotently with stable codes.

- [ ] **Step 4: Add least-privilege RLS and security-invoker read models**

Policies use `(select app_private.has_permission('catalog.read'))` or the target read permission. Grant `authenticated` only the SELECT required for security-invoker views; do not add direct insert/update/delete policies.

`api.product_catalog_read` exposes product/category/image/current price/current quantity but never cost. Read interfaces use keyset cursors and return command envelopes:

```text
get_product_catalog(p_search, p_category_id, p_stock_state, p_include_inactive,
                    p_cursor_name, p_cursor_id, p_limit)
get_product_detail(p_product_id)
get_product_sale_price_history(p_product_id, p_cursor_valid_from,
                               p_cursor_id, p_limit)
list_categories(p_include_inactive)
list_suppliers(p_search, p_cursor_name, p_cursor_id, p_limit)
list_customers(p_search, p_cursor_name, p_cursor_id, p_limit)
list_sales_channels(p_include_inactive)
```

Exact SKU/barcode match runs before normalized-name search. Do not enable `unaccent` or `pg_trgm` in this phase.

- [ ] **Step 5: Add idempotent catalog commands**

Expose security-invoker wrappers backed by private implementations:

```text
save_category(p_category_id uuid, p_name text, p_is_active boolean,
              p_idempotency_key uuid)
save_product(p_product_id uuid, p_expected_version bigint, p_product jsonb,
             p_idempotency_key uuid)
set_product_sale_price(p_product_id uuid, p_sale_price text,
                       p_change_reason text, p_idempotency_key uuid)
save_supplier(p_supplier_id uuid, p_expected_version bigint, p_supplier jsonb,
              p_idempotency_key uuid)
save_customer(p_customer_id uuid, p_expected_version bigint, p_customer jsonb,
              p_idempotency_key uuid)
save_sales_channel(p_channel_id uuid, p_code text, p_name text,
                   p_sort_order integer, p_is_active boolean,
                   p_idempotency_key uuid)
attach_product_image(p_product_id uuid, p_object_path text, p_sort_order integer,
                     p_is_primary boolean, p_idempotency_key uuid)
remove_product_image(p_product_image_id uuid, p_idempotency_key uuid)
```

Every new product creates `api.inventory_balances(on_hand_qty = 0)` in the same transaction. `set_product_sale_price` requires `pricing.sale.manage`; catalog commands require their approved permissions. Normalize and validate server-side, write sanitized audit records and emit persistent notifications only for material bulk/config changes.

Return `VERSION_CONFLICT` with current version, `DUPLICATE_IN_DATABASE`, `REFERENCE_NOT_FOUND`, `PERMISSION_DENIED` or Vietnamese validation codes without SQL details.

- [ ] **Step 6: Run SQL gate, review and apply to Cloud**

```bash
set -a
source /Users/admin/tuenhi/.env
set +a
pnpm exec supabase db lint --linked --level error
pnpm exec supabase db push --linked --dry-run
pnpm exec supabase db push --linked
pnpm exec supabase db query --linked --file supabase/tests/phase_1b_catalog_assertions.sql
pnpm exec supabase db advisors --linked --type security --level error --fail-on error
pnpm exec supabase db advisors --linked --type performance --level error --fail-on error
pnpm supabase:types
pnpm exec prettier --write src/lib/supabase/database.types.ts
```

Expected: one local/remote migration match, assertions pass and advisors have no ERROR.

- [ ] **Step 7: Commit**

```bash
git add supabase package.json src/lib/supabase/database.types.ts
git commit -m "feat: add secure catalog data model"
```

### Task 3: Product Catalog, Category and Sale Price UI

**Files:**
- Create: `src/features/catalog/catalog-types.ts`
- Create: `src/features/catalog/catalog-api.ts`
- Create: `src/features/catalog/catalog-validation.test.ts`
- Create: `src/features/catalog/catalog-validation.ts`
- Create: `src/features/catalog/ProductListPage.test.tsx`
- Create: `src/features/catalog/ProductListPage.tsx`
- Create: `src/features/catalog/ProductDetailPage.test.tsx`
- Create: `src/features/catalog/ProductDetailPage.tsx`
- Create: `src/features/catalog/ProductForm.test.tsx`
- Create: `src/features/catalog/ProductForm.tsx`
- Create: `src/features/catalog/CategoryManager.test.tsx`
- Create: `src/features/catalog/CategoryManager.tsx`
- Modify: `src/app/app-routes.tsx`
- Modify: `src/app/layout/navigation-items.ts`
- Modify: `src/styles/index.css`

**Interfaces:**
- Consumes: Task 2 catalog RPCs, session permissions, `NumericField`, toast and QueryClient.
- Produces: `/products`, `/products/new`, `/products/:productId`, `/products/:productId/edit`, accessible catalog forms and query keys under `catalogKeys`.

- [ ] **Step 1: Define typed DTO validation at the API boundary**

Create Zod schemas for command envelopes, cursor results and these form values:

```ts
export type ProductFormValues = {
  sku: string;
  barcode: string;
  name: string;
  categoryId: string;
  unitName: string;
  description: string;
  minStockQty: string;
  salePrice: string;
  isActive: boolean;
};
```

Tests must reject Unicode digits, comma/grouping, malformed quantities, overlong text and a sale price submission without owner permission.

- [ ] **Step 2: Write list-page component tests**

Cover skeleton dimensions, empty action, error/retry with correlation ID, exact SKU search, name search, category/stock filters, keyset next page, inactive label, low/out-of-stock labels and permission-gated create button. Do not use fake catalog rows in production components.

Run: `pnpm test -- src/features/catalog/ProductListPage.test.tsx`

Expected: RED before component implementation.

- [ ] **Step 3: Implement product list and responsive density**

Desktop uses a compact table-like grid; mobile uses grouped product rows. Both show image placeholder, product name, SKU, current sale price, on-hand quantity and text+color stock status. Use tabular numbers and `vi-VN` display formatting; preserve scroll position in query state.

- [ ] **Step 4: Write and implement product/category forms**

Tests cover create, edit with `expectedVersion`, duplicate SKU/barcode, inactive category, owner-only price mutation, `VERSION_CONFLICT`, offline-disabled writes and idempotency reuse while an outcome is unknown.

Product save and price change are two commands: save product first, then call price command only when the owner supplied/changed price. On partial network uncertainty, refetch product detail before presenting a retry.

Category manager supports create/rename/deactivate but no hard delete. A category referenced by active products can be deactivated only after server validation returns the approved Vietnamese message.

- [ ] **Step 5: Implement product detail**

Show public catalog fields, current quantity and current sale price. Only owner sees sale-price history action; no cost placeholder or hidden cost DOM is rendered. Movement history remains deferred until movement ledger exists.

- [ ] **Step 6: Run UI gate and commit**

```bash
pnpm test -- src/features/catalog
pnpm check
git add src/features/catalog src/app src/styles/index.css
git commit -m "feat: add product catalog workflows"
```

### Task 4: Supplier, Customer and Sales Channel Administration

**Files:**
- Create: `src/features/directories/directory-api.ts`
- Create: `src/features/directories/directory-validation.test.ts`
- Create: `src/features/directories/directory-validation.ts`
- Create: `src/features/directories/SupplierPage.test.tsx`
- Create: `src/features/directories/SupplierPage.tsx`
- Create: `src/features/directories/CustomerPage.test.tsx`
- Create: `src/features/directories/CustomerPage.tsx`
- Create: `src/features/settings/SalesChannelPage.test.tsx`
- Create: `src/features/settings/SalesChannelPage.tsx`
- Create: `src/app/pages/MorePage.test.tsx`
- Create: `src/app/pages/MorePage.tsx`
- Modify: `src/app/app-routes.tsx`

**Interfaces:**
- Consumes: Task 2 supplier/customer/channel commands and Task 1 phone normalizer.
- Produces: `/more/suppliers`, `/more/customers`, `/more/sales-channels` and directory query keys.

- [ ] **Step 1: Write validation tests for supplier/customer/channel forms**

Cover required names, optional code/email, strict phone input, `BUSINESS` requiring company, `INDIVIDUAL` clearing unsupported company requirement, immutable sales-channel code and code regex `^[A-Z][A-Z0-9_]{1,31}$`.

- [ ] **Step 2: Implement supplier and customer list/form states**

Both pages use keyset search and responsive grouped rows. Customer form contains only approved fields; CCCD, birthday, gender, Facebook, points and debt never appear in schema, DOM, API payload or analytics. Display phone is formatted for reading while form/save uses E.164.

- [ ] **Step 3: Implement owner-only sales-channel settings**

Seed rows are visible in configured order. Create accepts code once; edit sends the stored code unchanged. Deactivation requires confirmation and immediately invalidates active-channel queries; no hard-delete action exists.

- [ ] **Step 4: Add More-page navigation and permission states**

Render only links the session may use: `supplier.read/manage`, `customer.read/manage`, `settings.manage`. Direct URLs still use `RequireSession` permission gates.

- [ ] **Step 5: Run gate and commit**

```bash
pnpm test -- src/features/directories src/features/settings
pnpm check
git add src/features/directories src/features/settings src/app
git commit -m "feat: add catalog directories and channels"
```

### Task 5: Private Product Images and Realtime Invalidation

**Files:**
- Create: `supabase/migrations/*_phase_1b_product_images_realtime.sql`
- Create: `supabase/tests/phase_1b_storage_realtime_assertions.sql`
- Create: `src/features/catalog/product-image-api.test.ts`
- Create: `src/features/catalog/product-image-api.ts`
- Create: `src/features/catalog/ProductImageManager.test.tsx`
- Create: `src/features/catalog/ProductImageManager.tsx`
- Create: `src/features/catalog/use-catalog-realtime.test.tsx`
- Create: `src/features/catalog/use-catalog-realtime.ts`
- Modify: `src/features/catalog/ProductDetailPage.tsx`

**Interfaces:**
- Consumes: private Supabase Storage bucket, image metadata commands and TanStack Query.
- Produces: upload/remove/primary-image UI and Realtime-to-invalidation adapter.

- [ ] **Step 1: Write failing Cloud assertions**

Assert `product-images` exists and is private with 5 MiB object limit and only `image/jpeg`, `image/png`, `image/webp`; `anon` has no object access; authenticated select/insert/delete policies require the matching catalog permissions and path `products/{uuid}/{uuid}.{ext}`. Assert catalog tables are in `supabase_realtime` publication exactly once.

- [ ] **Step 2: Implement migration and Storage RLS**

Do not use upsert. INSERT requires `catalog.basic.manage`; SELECT requires `catalog.read`; DELETE requires manage permission. Update is not granted. Object names are generated UUIDs and never trust the uploaded filename.

Add `api.products`, `api.product_images` and `api.inventory_balances` to the publication without recreating or dropping the existing publication.

- [ ] **Step 3: Implement and test image upload saga**

Client validates MIME/size, uploads with `upsert: false`, then calls `attach_product_image`. If metadata fails, delete the newly uploaded object and show a Vietnamese error. Removing does the reverse safely: server detaches metadata after authorization, then client deletes the object; a failed object delete creates a retryable cleanup warning without resurrecting metadata.

- [ ] **Step 4: Implement Realtime invalidation only**

Subscribe after authenticated session is ready. Payload handlers never merge counts or product fields; they call `queryClient.invalidateQueries` for affected catalog/detail keys. Unsubscribe on logout/unmount and refetch after reconnect.

- [ ] **Step 5: Apply/verify Cloud and commit**

```bash
pnpm exec supabase db push --linked --dry-run
pnpm exec supabase db push --linked
pnpm exec supabase db query --linked --file supabase/tests/phase_1b_storage_realtime_assertions.sql
pnpm test -- src/features/catalog
pnpm check
git add supabase src/features/catalog
git commit -m "feat: add private product images and realtime refresh"
```

### Task 6: Generic Import State Machine and Atomic Catalog Commit

**Files:**
- Create: `supabase/migrations/*_phase_1b_generic_imports.sql`
- Create: `supabase/tests/phase_1b_import_assertions.sql`
- Modify: `package.json`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: Task 2 catalog commands/data, Task 1 target contracts and Phase 1A command/audit/notification helpers.
- Produces: import-run schema, 30-day cleanup, validate/result/commit RPCs and atomic import semantics.

- [ ] **Step 1: Generate migration and write RED assertions**

Require `api.import_runs`, `app_private.import_run_mappings`, `app_private.import_run_rows`, `app_private.import_run_errors`, all indexes, RLS/grants, functions below and a scheduled cleanup job. Assert authenticated users cannot select private rows or write `api.import_runs` directly.

- [ ] **Step 2: Implement import state schema**

Use the approved import-run columns/statuses. Private row records contain stable `row_number`, sanitized `row_payload`, validation status and expiry. Mappings contain only source header to target-field/ignore decisions. Error rows contain the approved DTO fields; audit and notification tables receive only counts/codes.

The cleanup function deletes raw rows/mappings/errors at expiry and marks header `EXPIRED`; schedule it daily with Supabase Cron. The job runs a database function and performs no HTTP request.

- [ ] **Step 3: Implement public wrappers and private validation**

Use these exact interfaces:

```text
create_import_run(p_target_type text, p_template_version integer,
                  p_file_name text, p_file_sha256 text, p_mode text,
                  p_idempotency_key uuid)
save_import_mapping(p_import_run_id uuid, p_mapping jsonb)
validate_import_rows(p_import_run_id uuid, p_chunk_index integer,
                     p_rows jsonb, p_is_last_chunk boolean)
get_import_validation_result(p_import_run_id uuid,
                             p_cursor_row_number integer, p_limit integer)
commit_import(p_import_run_id uuid, p_idempotency_key uuid)
get_import_result(p_import_run_id uuid)
list_import_runs(p_target_type text, p_status text,
                 p_cursor_created_at timestamptz, p_cursor_id uuid,
                 p_limit integer)
```

Each chunk has at most 250 rows and total is capped at 5.000. Server repeats required/value length/email/phone/boolean/canonical number/range/duplicate/reference/permission checks. It rejects unknown target fields so client cannot smuggle sensitive values.

- [ ] **Step 4: Define deterministic update keys and commit locks**

- Categories match normalized name; UPDATE may only change `is_active` because the template has no stable category code.
- Products match normalized SKU.
- Suppliers/customers in UPDATE mode require their code; a blank code is `VALUE_REQUIRED`.
- `UPDATE_EXISTING` requires an owner profile in addition to the target permission; non-owner users may use only `CREATE_ONLY`.
- CREATE mode never silently updates a match.
- Product category references lock by normalized category name first; target business rows lock by normalized key ascending.
- Commit revalidates under lock, writes all rows, current product prices, zero balances, one audit event, one notification and final counts in one transaction.
- Any error leaves zero catalog/price/balance/notification/audit partial writes and keeps the run `VALIDATED` with fresh conflict errors.

- [ ] **Step 5: Add concurrency and privilege Cloud tests**

Use real Auth JWTs to prove employee target permissions, owner-only price import, same-SKU deterministic winner, idempotent retry, cross-user import isolation, sensitive-field rejection and atomic rollback.

- [ ] **Step 6: Apply, regenerate types and commit**

```bash
pnpm exec supabase db lint --linked --level error
pnpm exec supabase db push --linked --dry-run
pnpm exec supabase db push --linked
pnpm exec supabase db query --linked --file supabase/tests/phase_1b_import_assertions.sql
pnpm supabase:types
pnpm exec prettier --write src/lib/supabase/database.types.ts
pnpm exec supabase db advisors --linked --type security --level error --fail-on error
pnpm exec supabase db advisors --linked --type performance --level error --fail-on error
git add supabase package.json src/lib/supabase/database.types.ts
git commit -m "feat: add atomic catalog import engine"
```

### Task 7: Browser Workbook Parser, Mapping and Error Export

**Files:**
- Create: `src/features/imports/workbook-parser.test.ts`
- Create: `src/features/imports/workbook-parser.ts`
- Create: `src/features/imports/mapping.test.ts`
- Create: `src/features/imports/mapping.ts`
- Create: `src/features/imports/client-validation.test.ts`
- Create: `src/features/imports/client-validation.ts`
- Create: `src/features/imports/error-workbook.test.ts`
- Create: `src/features/imports/error-workbook.ts`
- Create: `src/features/imports/import-api.ts`

**Interfaces:**
- Consumes: SheetJS, Task 1 contracts/normalizers and Task 6 RPCs.
- Produces: `inspectWorkbook(file)`, `proposeMapping`, `validateClientRows`, `buildErrorWorkbook` and transport-safe row chunks.

- [ ] **Step 1: Write hostile workbook fixtures and failing parser tests**

Generate synthetic buffers in tests for: wrong extension/signature, >5 MiB, extra/missing sheet, hidden metadata mismatch, >50 columns, >5.000 rows, formula, VBA marker, external link part, password/parse error and merged data cell. Never use or commit the user workbook for generic tests.

- [ ] **Step 2: Implement fail-closed in-memory inspection**

Read `File.arrayBuffer()`, compute Web Crypto SHA-256 and parse with:

```ts
XLSX.read(arrayBuffer, {
  type: 'array',
  dense: true,
  cellFormula: true,
  cellDates: true,
  bookVBA: true,
  bookFiles: true,
});
```

Inspect `vbaraw`, workbook file paths, formula fields and merge ranges before converting rows. Never execute or recalculate formulas. Release file references when leaving the page.

- [ ] **Step 3: Implement mapping and client validation**

Official matching metadata/header contract skips manual mapping. Other valid `.xlsx` files get exact+controlled alias proposals. Required targets map exactly once; unknown/duplicate columns block continuation until explicitly ignored/resolved.

Sensitive customer aliases are rendered as `Không nhập vì ngoài phạm vi hoặc nhạy cảm`; their cells are deleted before the row DTO is created, logged or sent.

Client validation returns stable DTOs with original Excel row numbers, raw value only in page memory/actor RPC payload and exact Vietnamese messages.

- [ ] **Step 4: Implement error workbook export**

Use ExcelJS in browser memory to create `Dữ liệu lỗi` with original allowed values plus `Trạng thái`, `Lỗi`, `Mã lỗi`, and a `Tổng hợp lỗi` sheet. Never restore excluded sensitive columns. Download with an object URL and revoke it immediately after click.

- [ ] **Step 5: Run focused tests and commit**

```bash
pnpm test -- src/features/imports
pnpm check
git add src/features/imports
git commit -m "feat: validate catalog workbooks in browser"
```

### Task 8: Four-Stage Generic Import UI

**Files:**
- Create: `src/features/imports/ImportPage.test.tsx`
- Create: `src/features/imports/ImportPage.tsx`
- Create: `src/features/imports/FileStage.tsx`
- Create: `src/features/imports/MappingStage.tsx`
- Create: `src/features/imports/ValidationStage.tsx`
- Create: `src/features/imports/CommitStage.tsx`
- Create: `src/features/imports/ImportHistoryPage.test.tsx`
- Create: `src/features/imports/ImportHistoryPage.tsx`
- Modify: `src/app/app-routes.tsx`
- Modify: `src/app/pages/MorePage.tsx`

**Interfaces:**
- Consumes: Tasks 6-7 import API/parser and session permissions.
- Produces: `/imports`, `/imports/:importRunId`, template downloads and generic import workflow.

- [ ] **Step 1: Write component tests for the complete state machine**

Cover target/template selection, file reject, exact-template fast path, manual mapping, explicit ignore confirmation, row/cell navigation, error filters, error workbook download, atomic commit, history/result reload, offline block, retry with same idempotency key and no automatic submit after reconnect.

- [ ] **Step 2: Implement four action-labelled stages**

Use only these labels: `Chọn tệp`, `Ghép cột`, `Kiểm tra dữ liệu`, `Xác nhận nhập`. Do not prefix generic step numbers. Desktop uses mapping/preview table with sticky summary; mobile shows one error row at a time and a persistent summary/action bar.

- [ ] **Step 3: Implement bounded transport and resume behavior**

Create run after client inspection, freeze mapping, send sanitized chunks of 250 rows sequentially, then page server errors by row-number cursor. Reloading can inspect history/results but requires reselecting the original local workbook before changing mapping; the server never reconstructs or serves raw workbook bytes.

- [ ] **Step 4: Add import notifications and permission navigation**

Success/failure notifications link to the run result. Categories/products, suppliers and customers appear only when actor has the target permission; price column is ignored/blocked for non-owner with an explicit Vietnamese explanation.

- [ ] **Step 5: Run UI gate and commit**

```bash
pnpm test -- src/features/imports
pnpm check
git add src/features/imports src/app
git commit -m "feat: add guided catalog imports"
```

### Task 9: Supported Legacy Q237 Adapter and Read-Only Archive

**Files:**
- Create: `supabase/migrations/*_phase_1b_legacy_archive.sql`
- Create: `supabase/tests/phase_1b_legacy_assertions.sql`
- Create: `src/features/imports/legacy/legacy-q237-contract.ts`
- Create: `src/features/imports/legacy/legacy-q237-fixture.ts`
- Create: `src/features/imports/legacy/legacy-q237-parser.test.ts`
- Create: `src/features/imports/legacy/legacy-q237-parser.ts`
- Create: `src/features/imports/legacy/LegacyMappingPanel.test.tsx`
- Create: `src/features/imports/legacy/LegacyMappingPanel.tsx`
- Create: `src/features/legacy-sales/legacy-sales-api.ts`
- Create: `src/features/legacy-sales/LegacySalesPage.test.tsx`
- Create: `src/features/legacy-sales/LegacySalesPage.tsx`
- Create: `src/features/legacy-sales/LegacySaleDetailPage.test.tsx`
- Create: `src/features/legacy-sales/LegacySaleDetailPage.tsx`
- Modify: `src/features/imports/ImportPage.tsx`
- Modify: `src/app/app-routes.tsx`
- Modify: `src/app/pages/MorePage.tsx`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: adapter ID `LEGACY_Q237_V1`, generic catalog candidate pipeline and owner-only `legacy.sale.import`.
- Produces: legacy parser/mapping, deferred opening suggestions, archive tables/commands and `/legacy-sales` read-only UI.

- [ ] **Step 1: Build a sanitized synthetic legacy fixture**

Generate the exact required sheet/header fingerprints and formula/cached-value shapes in test code using invented `.invalid` phone/email identifiers. Do not copy workbook formulas, real names, phones, addresses, tax codes, sale values or branding into source control.

- [ ] **Step 2: Test and implement the fixed adapter**

Cover allowlisted formula positions without evaluation, missing cache warnings, ignored helper columns `P:R`, carry-forward blank invoice number, adjacent repeats, disjoint duplicate invoice number, group conflict, invalid date, source-label-only confirmation and channel/payment/customer controlled proposals.

Eligible product/customer candidates go through Task 7 normal validators. Excluded customer columns are removed before creating any server row DTO. Price cost/opening quantity become separate suggestions with no posting action.

- [ ] **Step 3: Write RED Cloud archive assertions and implement schema**

Create `api.legacy_sales`, `api.legacy_sale_lines` and `app_private.legacy_opening_balance_suggestions` with required provenance/quality/source-row fields and indexed foreign keys. No FK to operational sales/payment/movement tables is allowed.

Expose:

```text
validate_legacy_sales_import(p_import_run_id uuid)
commit_legacy_sales_import(p_import_run_id uuid, p_idempotency_key uuid)
get_legacy_sales(p_filters jsonb, p_cursor_sold_on date,
                 p_cursor_id uuid, p_limit integer)
get_legacy_sale(p_legacy_sale_id uuid)
```

Commit requires owner-only `legacy.sale.import`; reads require `legacy.sale.read`. Result DTO always contains `isOperational: false`, quality, warnings and provenance. Archive commit creates zero operational sales/payments/movements/revenue/cost/returns/cancellations and never changes inventory balances.

- [ ] **Step 4: Implement mapping and confirmation UI**

Add explicit staff/channel/product/customer resolution with exact proposals and required owner confirmation. Confirmation separates catalog candidates, deferred opening suggestions and archive invoice counts. Every screen shows `Chỉ để tra cứu`.

- [ ] **Step 5: Implement archive search/detail**

Use keyset pagination and filters. Detail shows source labels, source rows, quality warnings and cached provenance. It renders no return, cancel, payment, inventory, profit or official-report action, including hidden/disabled DOM.

- [ ] **Step 6: Apply Cloud, generate types, test and commit**

```bash
pnpm exec supabase db push --linked --dry-run
pnpm exec supabase db push --linked
pnpm exec supabase db query --linked --file supabase/tests/phase_1b_legacy_assertions.sql
pnpm supabase:types
pnpm exec prettier --write src/lib/supabase/database.types.ts
pnpm test -- src/features/imports/legacy src/features/legacy-sales
pnpm check
git add supabase src/features/imports src/features/legacy-sales src/app src/lib/supabase/database.types.ts
git commit -m "feat: archive supported legacy sales workbook"
```

### Task 10: Real-JWT Security, Browser Acceptance and Phase Gate

**Files:**
- Create: `scripts/phase-1b-cloud-security.mjs`
- Create: `e2e/catalog-import.spec.ts`
- Create: `e2e/legacy-archive.spec.ts`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: all Phase 1B Cloud objects, runtime-only test identities and synthetic workbook generators.
- Produces: `pnpm test:cloud:phase1b`, auditable acceptance evidence and operator instructions.

- [ ] **Step 1: Write fail-closed real-JWT runner**

Require runtime URL/publishable/secret key plus unique owner, catalog employee and business employee credentials on `example.invalid`. Admin API is setup/cleanup only; every authorization assertion uses a publishable-key client signed in as the tested role. Cleanup deletes only IDs created by the run and fails the gate if any remains.

- [ ] **Step 2: Cover security and transaction cases**

Assert:

- anon/no-profile/inactive/password-change-required denial;
- employee cannot read price history, private import rows, opening suggestions or archive without permission;
- direct table writes and `app_private` Data API access fail;
- target-specific import permissions and owner-only sale price/legacy commit hold;
- same-SKU concurrency has one deterministic winner;
- failed import has zero partial business/audit/notification writes;
- idempotent retry returns original IDs/counts;
- product create always creates exactly one zero balance;
- product image Storage policies isolate read/write/delete correctly;
- legacy commit does not change operational table counts or inventory quantities.

- [ ] **Step 3: Add desktop/mobile Playwright acceptance**

Use synthetic workbooks generated in test setup, never the user workbook. Cover manual product/customer/channel flows, private image upload, all five template downloads, mapping/preview/error navigation/error workbook/success commit, customer v1/v2, offline commit block, Realtime refetch, legacy separation/banner and absence of operational actions. Keep trace/screenshot/video off for credential steps and never attach raw workbook data to reports.

- [ ] **Step 4: Document operations and retention**

README must explain template regeneration, Cloud-only migration flow, private bucket, Realtime publication, import runtime tests, 30-day raw retention, legacy archive boundary, no opening balance posting, no workbook upload and Vercel deferral.

- [ ] **Step 5: Run the complete Phase 1B gate**

```bash
set -a
source /Users/admin/tuenhi/.env
source "$PHASE1B_TEST_ENV_FILE"
set +a
pnpm templates:verify
pnpm cloud:verify:phase1a
pnpm exec supabase db query --linked --file supabase/tests/phase_1b_catalog_assertions.sql
pnpm exec supabase db query --linked --file supabase/tests/phase_1b_storage_realtime_assertions.sql
pnpm exec supabase db query --linked --file supabase/tests/phase_1b_import_assertions.sql
pnpm exec supabase db query --linked --file supabase/tests/phase_1b_legacy_assertions.sql
pnpm test:cloud:phase1a
pnpm test:cloud:phase1b
pnpm check:full
pnpm exec supabase db lint --linked --level error
pnpm exec supabase db advisors --linked --type security --level error --fail-on error
pnpm exec supabase db advisors --linked --type performance --level error --fail-on error
pnpm exec supabase migration list --linked
git diff --check
```

Expected: all template/unit/component/Cloud/E2E tests pass, advisors contain no ERROR, migration histories match and test cleanup reports zero leftover Auth/profile/import/archive rows.

- [ ] **Step 6: Final secret, workbook and visible-copy scan**

```bash
git status --short
git diff --check
git ls-files | rg '(^|/)\.env$|(^|/)\.env\.(local|production|development|test)$' && exit 1 || true
git ls-files '*.xlsx' | rg -v '^public/templates/import/(categories-v1|products-v1|suppliers-v1|customers-v1|customers-v2)\.xlsx$' && exit 1 || true
rg -n 'service_role|SUPABASE_SECRET_KEY|TEST_.*PASSWORD|BOOTSTRAP_OWNER_PASSWORD' src public dist && exit 1 || true
rg -n '(identityNumber|dateOfBirth|gender|facebook|points|debt|historicalTotal)\s*:' src/features/imports --glob '!**/*.test.*' && exit 1 || true
```

Review every new Vietnamese label/error for plain meaning, focus/contrast/touch targets and loading/empty/error/offline states.

- [ ] **Step 7: Commit verification assets**

```bash
git add scripts e2e package.json README.md
git commit -m "test: verify phase 1b catalog imports"
```

## Execution Checkpoints

- Checkpoint 1 after Tasks 1-4: template contracts, catalog schema and manual catalog/directory/channel workflows pass before Storage/import work begins.
- Checkpoint 2 after Tasks 5-8: private images, Realtime, generic atomic imports and four-stage UI pass before enabling the fixed legacy adapter.
- Checkpoint 3 after Tasks 9-10: legacy archive isolation, real-JWT security, desktop/mobile acceptance and full Cloud gate pass.

At every checkpoint, stop on migration/advisor/RLS/atomicity failure. Do not fix a gate by exposing `app_private`, granting broad direct writes, moving secret keys to browser code, skipping server revalidation or treating legacy/opening suggestions as operational records.

## Deferred to Later Product Phases

- Opening stock posting, stock movements, stock counts and inventory cost balances.
- Purchase receipts, purchase cost entry, moving weighted-average costing and valuation.
- Operational sales/POS, discounts, payment, invoice K80/PDF, returns and cancellation.
- Profit/reporting and Vercel deployment.

## Official References Checked for This Plan

- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control) and [private bucket fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals).
- [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) and [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).
- [Supabase Cron](https://supabase.com/docs/guides/cron) using `pg_cron` for bounded scheduled cleanup.
- [SheetJS browser parsing options](https://docs.sheetjs.com/docs/api/parse-options/) and [formula exposure](https://docs.sheetjs.com/docs/csf/features/formulae/) with dense sheets, workbook files and VBA metadata.
- [ExcelJS 4.4.0](https://www.npmjs.com/package/exceljs) for styled/versioned workbook generation and data validation.
- [libphonenumber-js](https://github.com/catamphetamine/libphonenumber-js) strict parsing with E.164 output and `extract: false`.
