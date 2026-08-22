# Tuệ Nhi Cloud Platform, Data Entry, Excel Import and Notifications Design

Date: 2026-08-22

Status: Draft for user review

Related design: `docs/superpowers/specs/2026-08-21-internal-single-store-pos-design.md`

## 1. Purpose

This document refines the cross-cutting platform decisions for the Tuệ Nhi internal pharmacy POS after Phase 0. It adds concrete requirements for:

- Supabase Cloud-only development and deployment.
- Authentication, profiles, roles, permissions, and active-account enforcement.
- Strict international decimal input and Vietnamese display formatting.
- Vietnamese user-facing errors, toast feedback, and a persistent notification center.
- Versioned Excel templates, column mapping, preview, row-level validation, and atomic imports.
- A trust-first product UI guided by the installed taste skill without applying landing-page patterns to dense POS screens.

This document supplements the original design. Where it is more specific, this document governs numeric input, feedback, notifications, Excel import, and Phase 1 sequencing. Financial posting, inventory costing, sales, returns, and reporting continue to follow the original design.

## 2. Confirmed project context

- Git remote: `https://github.com/hoangnvthkt/tuenhi.git`.
- Primary branch: `main`.
- Supabase project ref: `ccfhkhtxoruyniwxowrz`.
- Supabase project URL: `https://ccfhkhtxoruyniwxowrz.supabase.co`.
- Supabase region: `ap-southeast-1`.
- PostgreSQL major version: 17.
- Remote migration history was empty when this design was written.
- `.env` contains the two public browser variables and three CLI-only variables from `.env.example`.
- Vercel remains deferred.

The project never runs `supabase start`, `supabase db reset`, Docker, or another local Supabase stack. All database validation and integration testing use the linked Supabase Cloud project and isolated test data.

## 3. Delivery scope and sequencing

The platform work is divided into two independently testable increments.

### 3.1 Increment 1A: Cloud identity and shared UX contracts

- Migration workflow for the linked Cloud project.
- `api` and `app_private` schema boundaries.
- Profiles, permission definitions, role defaults, user overrides, and session context.
- Login, logout, initial-password change, account-active checks, and permission gates.
- Shared canonical decimal parser and `NumericField` behavior.
- Shared Vietnamese error mapping, toast provider, notification center, and correlation IDs.
- Negative RLS and grants tests with real Supabase Auth JWTs.

### 3.2 Increment 1B: Catalog and Excel import vertical slice

- Categories, products, current sale price, suppliers, customers, and zero-value inventory balances required by imported products.
- Versioned `.xlsx` templates for categories, products, suppliers, and customers.
- Upload, sheet selection, column mapping, preview, row/cell validation, atomic commit, and error workbook export.
- Import history and persistent user notifications.

Increment 1B brings the non-financial catalog portion of the original Phase 2 forward so the bulk-import requirement is usable early. It does not import opening stock, purchase cost, average cost, purchase receipts, stock movements, or any financial document. Those remain in the inventory and purchase phases after the cost engine exists.

## 4. Non-goals

- No Supabase local stack or Docker.
- No Vercel project or deployment.
- No service-role or secret key in the browser, repository, `.env.example`, source map, or client bundle.
- No email, SMS, web-push, or native-push notification channel in these increments.
- No offline queue and no automatic submission after reconnect.
- No partial financial import.
- No opening-stock, purchase-cost, sale, return, cancellation, or stock-count import.
- No formulas, macros, password-protected workbooks, external workbook links, or executable spreadsheet content.
- No direct browser insert/update/delete for multi-table commands.

## 5. Architectural decisions

### 5.1 Source of truth

PostgreSQL is authoritative for identity state, permissions, import validation, idempotency, notifications, and every committed business mutation. Browser validation improves feedback but never replaces database validation.

### 5.2 Data API boundary

Application objects are split between:

- `api`: the deliberately exposed Data API surface. It contains safe tables, security-invoker views, and security-invoker command wrappers.
- `app_private`: internal permission helpers, idempotency, import payloads, sensitive audit data, cost data, and security-definer command implementations.

Before the frontend uses the Data API, the Cloud Data API settings must expose `api`. Application access to `public` is removed unless a Supabase-managed object explicitly requires it. No application table is considered safe merely because it has RLS; grants and RLS are both required.

### 5.3 Command boundary

- Browser code calls a named command wrapper.
- The wrapper is `security invoker` in `api`.
- Privileged logic is `security definer` in `app_private` with `search_path = ''`.
- Every object reference is schema-qualified.
- Actor identity always comes from `(select auth.uid())`.
- Commands check active profile, `must_change_password`, effective permission, state, and idempotency before mutation.
- Unknown exceptions are rethrown. Known business errors are mapped only after mutations are rolled back.
- External HTTP and slow file parsing never run inside a database transaction.

### 5.4 Realtime boundary

Realtime is an invalidation signal, never the source of truth. A notification event causes the client to invalidate and refetch the notification query. The event payload is not used as the final notification record or as a balance.

For the single-store scale, filtered Postgres Changes on the user's notification rows is acceptable. If throughput or channel-security needs increase, the implementation may move to private Broadcast without changing the query or notification DTO contracts.

## 6. Canonical numeric contract

### 6.1 Principles

- User input accepts only ASCII digits `0-9` and a period `.` as the decimal separator.
- User input never accepts a thousands separator.
- A comma is never interpreted as a decimal separator during entry or import.
- Signs `+` and `-`, exponent notation `e`/`E`, whitespace, non-breaking spaces, Unicode digits, currency symbols, and unit suffixes are rejected.
- Leading zeroes are rejected except for the value `0` and a decimal beginning with `0.`.
- Browser-to-server command payloads send canonical decimal strings, not JSON numbers.
- JavaScript never performs authoritative money, quantity, cost, discount, or reconciliation arithmetic with `number` or floating point.
- PostgreSQL `numeric` performs all official arithmetic.

### 6.2 Regex definitions

The implementation exports these exact grammars or behaviorally equivalent anchored regular expressions:

```text
INTEGER_FINAL       ^(?:0|[1-9][0-9]*)$
MONEY_EDITING       ^(?:|(?:0|[1-9][0-9]*)(?:\.[0-9]{0,2})?)$
MONEY_FINAL         ^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$
QUANTITY_EDITING    ^(?:|(?:0|[1-9][0-9]*)(?:\.[0-9]{0,3})?)$
QUANTITY_FINAL      ^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,3})?$
```

`EDITING` grammars allow an empty field and a trailing period while the user is typing. Submit, paste confirmation, import, and server validation use only `FINAL` grammars.

### 6.3 Precision and ranges

The existing database precision remains authoritative:

| Value                                   | PostgreSQL type | Maximum input scale |
| --------------------------------------- | --------------- | ------------------: |
| Money totals                            | `numeric(20,2)` |                   2 |
| Purchase/sale unit price                | `numeric(18,2)` |                   2 |
| Quantity                                | `numeric(18,3)` |                   3 |
| Average cost and internal cost snapshot | `numeric(20,6)` | 6, server-generated |

Users do not directly enter six-decimal average costs. Server functions calculate them. Each parser also applies the integer-digit limit implied by the destination database type before casting.

### 6.4 Input interaction

The shared `NumericField` follows these rules:

- Uses `type="text"` and `inputMode="decimal"`; it does not use `type="number"` because browser locale and exponent behavior are inconsistent.
- Labels remain above the input. Placeholder text never replaces a label.
- The controlled editing state rejects a keystroke or paste that cannot match the relevant editing grammar.
- An invalid paste leaves the previous value unchanged and shows an inline Vietnamese message.
- Final validation occurs on blur and submit.
- Empty optional values stay empty; they are not silently converted to zero.
- Formatting with thousands separators occurs only in read-only display, not inside the editing control.

### 6.5 Display formatting

Read-only money and quantity use `Intl.NumberFormat('vi-VN')`:

- Group separator: period.
- Display decimal separator: comma.
- Money displays zero to two decimal places according to context.
- Quantity displays zero to three decimal places and removes insignificant trailing zeroes.
- Canonical values remain unchanged underneath the display.

Example:

```text
Canonical input: 1234567.5
Vietnamese display: 1.234.567,5
```

### 6.6 Numeric error codes and Vietnamese copy

| Code                          | Vietnamese user message                              |
| ----------------------------- | ---------------------------------------------------- |
| `NUMBER_FORMAT_INVALID`       | `Chỉ nhập chữ số và dấu chấm cho phần thập phân.`    |
| `NUMBER_SCALE_EXCEEDED`       | `Số chữ số sau dấu chấm vượt quá giới hạn cho phép.` |
| `NUMBER_RANGE_EXCEEDED`       | `Giá trị vượt quá giới hạn hệ thống cho phép.`       |
| `NUMBER_REQUIRED`             | `Vui lòng nhập giá trị.`                             |
| `NUMBER_MUST_BE_POSITIVE`     | `Giá trị phải lớn hơn 0.`                            |
| `NUMBER_MUST_BE_NON_NEGATIVE` | `Giá trị không được nhỏ hơn 0.`                      |

The client may add a field label before the message, for example `Số lượng: Chỉ nhập chữ số và dấu chấm cho phần thập phân.`

## 7. Vietnamese feedback and notification contract

### 7.1 Three feedback levels

1. Inline validation for a field, cell, or form section that the user can correct in place.
2. Toast feedback for a transient command result or connection state.
3. Persistent notification center for events the user may need to revisit.

A toast never replaces a row-level import error grid or a required inline form message.

### 7.2 User-facing language

- All visible titles, messages, helper text, validation text, empty states, loading text, and action labels are Vietnamese.
- Stable machine-readable error codes remain uppercase English identifiers.
- Raw SQL, PostgREST, Auth, Edge Function, stack trace, or dependency messages are never displayed directly.
- Unknown errors use the safe fallback `Không thể hoàn tất thao tác. Vui lòng thử lại.`
- A failed command shows its correlation ID as `Mã tra cứu: <uuid>` in expandable details or a copy action.
- Visible application copy uses ordinary Vietnamese punctuation and does not use an em dash as decoration.

### 7.3 Toast policy

- At most three toasts are visible simultaneously.
- Success toasts dismiss automatically after five seconds.
- Informational and warning toasts dismiss automatically after eight seconds unless an action is present.
- Error toasts remain until dismissed or retried.
- Duplicate events with the same `dedupeKey` update the existing toast instead of stacking.
- Success uses `aria-live="polite"`; error uses `aria-live="assertive"`.
- Every toast has a text label; color is never the only status signal.
- Offline mode shows the existing persistent status banner and blocks write commands.

### 7.4 Persistent notification record

`api.user_notifications` contains:

- `id uuid primary key`.
- `user_id uuid not null references api.profiles(id) on delete restrict`.
- `severity text not null check (severity in ('INFO','SUCCESS','WARNING','ERROR'))`.
- `category text not null`.
- `title text not null`.
- `message text not null`.
- `action_route text null` restricted to internal application routes.
- `entity_type text null` and `entity_id uuid null`.
- `dedupe_key text null`.
- `correlation_id uuid not null`.
- `read_at timestamptz null`.
- `created_at timestamptz not null default now()`.
- `expires_at timestamptz null`.

Constraints and indexes:

- Partial unique index on `(user_id, dedupe_key)` where `dedupe_key is not null and read_at is null`.
- Feed index on `(user_id, read_at, created_at desc, id desc)`.
- Foreign-key index on `user_id`.
- Notifications default to `expires_at = created_at + interval '365 days'`; the cleanup job removes expired rows without removing their audit events.
- `authenticated` receives `select` and the narrow mark-read command only; direct insert/update/delete is revoked.
- RLS allows a user to read only rows where `user_id = (select auth.uid())` and the profile is active.

### 7.5 Notification events in these increments

- Initial password changed successfully.
- Account role or active state changed.
- Permission overrides changed.
- Import validation completed with errors.
- Import committed successfully.
- Import failed after submission.
- A server command has an unknown network outcome and requires result lookup.

No notification contains cost or profit fields unless the receiving user is an active owner and the generating command is owner-only.

## 8. Excel template and import design

### 8.1 Supported format and limits

- File extension: `.xlsx` only.
- Maximum file size: 5 MiB.
- Maximum data rows per workbook: 5,000.
- Maximum columns per data sheet: 50.
- One required data sheet named `Dữ liệu`.
- One instruction sheet named `Hướng dẫn`.
- One hidden metadata sheet named `__tuenhi_meta` containing `template_type`, `template_version`, and generator version.
- Password-protected files, macros, formula cells, external links, merged data cells, and additional data sheets are rejected.

SKU, barcode, phone, and document numbers are text cells. They are never treated as numeric values because leading zeroes must be preserved.

### 8.2 Versioned templates

Templates are generated from code and committed under:

```text
public/templates/import/categories-v1.xlsx
public/templates/import/products-v1.xlsx
public/templates/import/suppliers-v1.xlsx
public/templates/import/customers-v1.xlsx
```

Each template includes:

- A Vietnamese instruction sheet with required/optional columns, examples, limits, and the canonical decimal rule.
- Frozen header rows and filters on the data sheet.
- Data validation where Excel can express it safely.
- Text formatting on SKU, barcode, phone, and external reference columns.
- No real business, employee, customer, supplier, credential, or project data.

Templates are generated by a deterministic script. A test opens every generated workbook, verifies sheet names, metadata, header keys, column order, and cell formats, then compares the workbook contract rather than binary bytes.

### 8.3 Import targets in Increment 1B

#### Categories

Required columns:

- `Tên nhóm hàng`

Optional columns:

- `Hoạt động`

Duplicate normalized names are errors.

#### Products

Required columns:

- `SKU`
- `Tên sản phẩm`
- `Đơn vị tính`

Optional columns:

- `Mã vạch`
- `Nhóm hàng`
- `Mô tả`
- `Ngưỡng tồn tối thiểu`
- `Giá bán hiện hành`
- `Hoạt động`

`SKU` is required and unique. `Mã vạch` is unique when present. `Nhóm hàng` must match an existing active normalized category; the importer does not auto-create a misspelled category. A non-empty sale price requires `pricing.sale.manage`, which remains owner-only.

The actor must hold the target-specific permission: `catalog.basic.manage` for categories and products, `supplier.manage` for suppliers, and `customer.manage` for customers. Server validation checks permissions again during both validation and commit.

#### Suppliers

Required columns:

- `Tên nhà cung cấp`

Optional columns:

- `Mã nhà cung cấp`
- `Số điện thoại`
- `Email`
- `Địa chỉ`
- `Ghi chú`
- `Hoạt động`

#### Customers

Required columns:

- `Tên khách hàng`

Optional columns:

- `Mã khách hàng`
- `Số điện thoại`
- `Email`
- `Địa chỉ`
- `Ghi chú`
- `Hoạt động`

The default walk-in customer remains `customer_id = null`; it is not imported as a customer row.

### 8.4 Header normalization and mapping

Header comparison performs Unicode NFC normalization, trims surrounding whitespace, collapses repeated internal spaces, and compares case-insensitively. It never removes Vietnamese diacritics from stored values.

The mapping workflow:

1. User selects a workbook.
2. Client verifies workbook format, limits, and metadata.
3. Client reads the data headers and proposes mappings using exact headers and a controlled Vietnamese alias dictionary.
4. User resolves unmapped or duplicate columns.
5. Required target columns must each map to exactly one source column.
6. Unmapped source columns are ignored only after explicit confirmation.
7. The mapping is frozen into the import run before validation.

A workbook from an official current template skips manual mapping only when its metadata and header contract match exactly.

### 8.5 Validation pipeline

Validation occurs twice:

1. Client validation produces immediate preview and correction feedback.
2. Server validation repeats every authoritative rule before commit.

Server validation order:

1. File and template contract.
2. Header and mapping contract.
3. Required cell presence.
4. Text length, email, phone, boolean, and canonical decimal syntax.
5. Numeric scale and range.
6. Duplicate keys within the workbook.
7. Conflicts against current database rows.
8. Actor state and permissions.
9. Import mode and idempotency.

All numeric values are canonical strings in the server payload. Excel numeric cells are converted to a plain decimal string and rejected if they require exponent notation or exceed the destination scale.

### 8.6 Validation error DTO

Every error has:

```json
{
  "rowNumber": 12,
  "sourceColumn": "Giá bán hiện hành",
  "targetField": "salePrice",
  "code": "NUMBER_FORMAT_INVALID",
  "message": "Chỉ nhập chữ số và dấu chấm cho phần thập phân.",
  "rawValue": "12,500"
}
```

`rawValue` is returned only to the actor who uploaded the workbook and only while the import run is retained. It is redacted from audit events and notifications.

Required import error codes include:

- `WORKBOOK_FORMAT_INVALID`
- `WORKBOOK_TOO_LARGE`
- `ROW_LIMIT_EXCEEDED`
- `SHEET_REQUIRED`
- `FORMULA_NOT_ALLOWED`
- `TEMPLATE_VERSION_UNSUPPORTED`
- `HEADER_REQUIRED`
- `HEADER_DUPLICATE`
- `COLUMN_MAPPING_REQUIRED`
- `COLUMN_MAPPING_DUPLICATE`
- `VALUE_REQUIRED`
- `VALUE_TOO_LONG`
- `NUMBER_FORMAT_INVALID`
- `NUMBER_SCALE_EXCEEDED`
- `NUMBER_RANGE_EXCEEDED`
- `EMAIL_FORMAT_INVALID`
- `PHONE_FORMAT_INVALID`
- `DUPLICATE_IN_FILE`
- `DUPLICATE_IN_DATABASE`
- `REFERENCE_NOT_FOUND`
- `PERMISSION_DENIED`
- `IMPORT_VALIDATION_FAILED`
- `IMPORT_ALREADY_COMMITTED`

Every code maps to a specific Vietnamese message. Unknown server details use the generic safe fallback.

### 8.7 Import commit policy

- Default mode is `CREATE_ONLY`.
- Owner may explicitly select `UPDATE_EXISTING` for a supported target.
- The workbook cannot mix create/update modes by row.
- Import commit is all-or-nothing. One blocking row prevents all writes.
- Preview does not reserve keys or products.
- Commit revalidates current database state after acquiring locks.
- Rows lock or update in deterministic normalized-key order.
- The commit uses one idempotency key and returns the original result on retry.
- Categories, products, suppliers, customers, sale-price history, notification, audit, and import status update in the same database transaction where applicable.
- Parsing and workbook generation remain outside the transaction.

### 8.8 Error workbook

The user can download an `.xlsx` error report containing:

- Original data sheet values.
- `Trạng thái` column.
- `Lỗi` column with Vietnamese messages.
- `Mã lỗi` column.
- Separate `Tổng hợp lỗi` sheet grouped by error code and column.

The workbook is generated in browser memory and downloaded directly. It is not uploaded to Storage in these increments.

### 8.9 Import retention

- Import-run header and final counts are retained for audit.
- Raw row values and row-level errors are retained for 30 days, then deleted by a scheduled Cloud job.
- Committed business records are never deleted when raw import rows expire.
- Import notifications use the 365-day notification retention policy in section 7.4.

## 9. Identity and authorization model

### 9.1 Roles

The original three role templates remain unchanged:

- `SALES_WAREHOUSE`
- `BUSINESS`
- `OWNER`

Effective permissions remain:

```text
role defaults + individual grants - individual revokes
```

Owner-only permissions cannot be granted to employees. Owners do not receive overrides and always retain all owner permissions while active.

### 9.2 Profile hard gates

Every protected read, RLS policy, and command requires:

- A matching `api.profiles` row.
- `is_active = true`.
- `must_change_password = false`, except for session context and the initial-password flow.

These checks are database-authoritative and do not depend on stale JWT role claims.

### 9.3 Last-owner serialization

Staff mutations lock a singleton store/settings row before changing owner role or active state. They then lock the target profile and recheck the active-owner count. The system never allows the last active owner to be deactivated or demoted.

### 9.4 Account-management saga

Creating an Auth user and creating the database profile cannot be one cross-system transaction. The secure sequence is:

1. Owner calls an authenticated Edge Function.
2. Function checks the caller through a database staff command.
3. Function creates the Auth user with an initial temporary password.
4. Function finalizes the profile idempotently.
5. A user without a finalized active profile has no Data API access.
6. If finalization fails, the owner retries finalization; no broad permission is granted as compensation.

Deactivation updates the database profile first so RLS/RPC blocks immediately, then revokes sessions as a best-effort Auth Admin operation.

## 10. Database objects introduced by this design

### 10.1 `api` schema

- `profiles`
- `user_notifications`
- `import_runs`
- `categories`
- `products`
- `suppliers`
- `customers`
- `inventory_balances`
- Security-invoker read views for current product catalog, import summaries, and notification feed.
- Security-invoker wrappers for the commands in section 11.

Every exposed table enables and forces RLS. Direct write grants are revoked unless a narrow user-owned update is explicitly required.

### 10.2 `app_private` schema

- `permission_definitions`
- `role_default_permissions`
- `user_permission_overrides`
- `command_deduplication`
- `import_run_rows`
- `import_run_mappings`
- `product_sale_prices`
- `inventory_cost_balances`
- Sensitive audit payloads and helper functions.
- Security-definer command implementations.

No `anon` or `authenticated` role receives direct table access to this schema.

### 10.3 Import run shape

`api.import_runs` includes:

- `id uuid primary key`.
- `actor_id uuid not null references api.profiles(id)`.
- `target_type text not null`.
- `template_version integer null`.
- `file_name text not null` stored as sanitized display text.
- `file_sha256 text not null`.
- `mode text not null check (mode in ('CREATE_ONLY','UPDATE_EXISTING'))`.
- `status text not null check (status in ('UPLOADED','MAPPED','VALIDATED','COMMITTED','FAILED','EXPIRED'))`.
- `total_rows integer not null default 0`.
- `valid_rows integer not null default 0`.
- `invalid_rows integer not null default 0`.
- `created_at`, `validated_at`, `committed_at`, and `expires_at` as `timestamptz`.
- `correlation_id uuid not null`.
- `idempotency_key uuid not null`.

Indexes:

- `(actor_id, created_at desc, id desc)`.
- `(status, expires_at)` for cleanup.
- Unique `(actor_id, target_type, idempotency_key)`.

Every foreign-key column receives a supporting index.

## 11. Public interfaces

### 11.1 Session and staff

- `get_my_session_context()`
- `change_initial_password()` through the Edge Function and database finalizer.
- `list_staff(p_cursor, p_limit)`
- `finalize_staff_profile(...)`
- `set_staff_active(p_user_id, p_active, p_reason, p_idempotency_key)`
- `set_staff_role(p_user_id, p_role, p_reason, p_idempotency_key)`
- `set_staff_permission_override(...)`
- `get_effective_permissions(p_user_id)`

### 11.2 Notifications

- `get_my_notifications(p_unread_only, p_cursor, p_limit)`
- `mark_notification_read(p_notification_id)`
- `mark_all_notifications_read()`

### 11.3 Imports

- `create_import_run(p_target_type, p_template_version, p_file_name, p_file_sha256, p_mode, p_idempotency_key)`
- `save_import_mapping(p_import_run_id, p_mapping)`
- `validate_import_rows(p_import_run_id, p_rows)`
- `get_import_validation_result(p_import_run_id, p_cursor, p_limit)`
- `commit_import(p_import_run_id, p_idempotency_key)`
- `get_import_result(p_import_run_id)`

Validation may accept rows in bounded chunks for transport, but commit remains one atomic database command for the complete validated run. Chunk order and row numbers are stable.

### 11.4 Command envelope

All commands keep the existing envelope:

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "correlationId": "uuid"
}
```

or:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "IMPORT_VALIDATION_FAILED",
    "message": "Tệp còn dữ liệu chưa hợp lệ. Vui lòng kiểm tra danh sách lỗi.",
    "details": {
      "invalidRows": 3
    }
  },
  "correlationId": "uuid"
}
```

Details contain only whitelisted fields. They never contain SQL text, stack traces, secrets, cost fields for unauthorized users, or a complete raw row.

## 12. RLS, grants, and indexes

- `anon` receives no application schema usage, table access, or command execution.
- `authenticated` receives schema usage and only named select/execute grants.
- Default table, function, and sequence privileges are revoked before application objects are created.
- Every exposed table enables and forces RLS.
- RLS helpers use `(select auth.uid())` and indexed actor/user columns.
- Complex permission checks use stable private helpers and indexed lookups.
- UPDATE access includes an appropriate SELECT policy.
- Views use `security_invoker = true`.
- Security-definer functions remain outside exposed schemas with `search_path = ''`.
- Foreign keys use `on delete restrict` or `no action` for historical/business data; no financial history cascades.
- Import commit locks conflicting keys in a consistent ascending order and keeps the transaction short.
- `file_name`, cell values, and mapped headers are data only. They are never interpolated into SQL identifiers or executable statements.

## 13. UI and interaction direction

### 13.1 Design read

Reading this as: an internal, trust-first pharmacy POS for daily staff use, with restrained motion and medium information density, implemented with the existing Tailwind v4 foundation.

Design dials:

- `DESIGN_VARIANCE: 3`
- `MOTION_INTENSITY: 2`
- `VISUAL_DENSITY: 5`

The taste skill is used for typography, spacing, hierarchy, state design, contrast, and anti-slop checks. Its landing-page hero, portfolio, decorative media, and marketing block rules do not apply to POS tables or import forms.

### 13.2 Visual system

- Existing teal `#0f766e` remains the only accent.
- Light theme is the initial application theme; no section-level theme inversion.
- One documented radius system: inputs 8 px, buttons 8 px, panels 12 px.
- Shadows appear only when elevation communicates a real overlay or sticky layer.
- Numbers use tabular numerals.
- No decorative gradients, glows, status dots, fake business data, or hand-drawn UI icons.
- Icons, when introduced, come from one approved icon family.

### 13.3 Required states

Every query and mutation surface provides:

- Loading state that matches final layout dimensions.
- Empty state with a concrete next action.
- Inline validation state.
- Permission-denied state.
- Offline state for write operations.
- Retryable command-error state with correlation ID.
- Unknown-outcome state that checks idempotency result before allowing a new submission.

### 13.4 Import workflow UI

The import screen is a focused four-stage form workflow:

1. Chọn tệp
2. Ghép cột
3. Kiểm tra dữ liệu
4. Xác nhận nhập

The stage names themselves are the labels; the UI does not add generic labels such as `Bước 1`.

Desktop uses a wide mapping/preview table with a sticky summary. Mobile shows one row error at a time with filters by error type and a persistent summary/action bar. A user can always return to mapping without re-uploading the file while the page remains open.

## 14. Audit and observability

Audit events record:

- Actor ID.
- Action code.
- Entity type and ID.
- Import run ID when applicable.
- Correlation ID.
- Idempotency key.
- Sanitized before/after metadata.
- Occurrence time.

Audit payloads never store passwords, access tokens, publishable keys, signed URLs, complete workbook rows, or raw cost values in a surface readable by employees.

Import metrics include validation duration, commit duration, row counts, error-code counts, and final status. They do not include raw cell values.

## 15. Cloud migration workflow

The CLI is invoked through the pinned package:

```bash
pnpm exec supabase ...
```

The current CLI requires the database password to be passed explicitly for linked migration commands in this workspace:

```bash
set -a
source .env
set +a
pnpm exec supabase migration list --linked --password "$SUPABASE_DB_PASSWORD"
```

Rules:

- Create migration filenames only with `pnpm exec supabase migration new <name>`.
- Never hand-invent migration timestamps.
- Never make application schema changes through the Cloud SQL/Table editor after migration tracking begins.
- Review generated SQL before applying.
- Run linked migration history and database advisors before push.
- Push one reviewed migration sequence at a time.
- Record applied migration IDs and verification evidence.
- Seed only permission definitions, role defaults, singleton settings, and other non-secret configuration.
- Owner bootstrap is a separate authenticated procedure; no owner password or email is committed to Git.

Because no local database is used, SQL tests execute against the linked Cloud project using isolated test identities and deterministic cleanup. Destructive test commands are prohibited against real business rows.

## 16. Testing requirements

### 16.1 Numeric unit tests

Required accepted examples:

- `0`
- `1`
- `0.1`
- `1.25` for money
- `1.234` for quantity
- Editing values `""`, `0.`, and `12.`

Required rejected examples:

- `.5`
- `01`
- `1,5`
- `1,000`
- `1 000`
- `+1`
- `-1`
- `1e3`
- `1E3`
- `1.234` for money
- `1.2345` for quantity
- Arabic-Indic, full-width, or other Unicode digits
- Values exceeding the destination integer-digit range

Tests cover keystroke state, paste, blur, submit, server parsing, and `vi-VN` display formatting.

### 16.2 Excel unit and component tests

- Generated template contract for all four target types.
- Exact and alias header mapping.
- Duplicate and missing mappings.
- Formula and protected-workbook rejection.
- Text preservation for SKU/barcode/phone leading zeroes.
- Canonical decimal conversion and invalid numeric cells.
- Duplicate-in-file detection.
- Error aggregation by row and column.
- Mobile and desktop import states.
- Vietnamese visible copy and accessible live regions.

### 16.3 Cloud integration tests

- Publishable key plus real JWT for each role.
- Anonymous user denied every application object.
- Inactive and `must_change_password` users denied protected reads/writes.
- Effective permission formula including grant and revoke.
- Owner-only permission cannot be granted to an employee.
- Concurrent attempts cannot remove the last active owner.
- Employee JWT cannot read cost tables, functions, fields, import payloads, or owner-only errors.
- Duplicate import idempotency key returns the original result.
- Concurrent import of the same SKU has one deterministic winner and one Vietnamese conflict result.
- A failed import leaves no catalog, price, balance, notification, or audit partial write.
- Mark-read only changes the actor's own notification.

### 16.4 Browser tests

- Login and initial-password gate.
- Permission-based navigation.
- Toast success, error, duplicate suppression, and correlation details.
- Notification unread/read behavior.
- Official template download.
- Import mapping, preview, invalid cell navigation, error workbook download, and successful commit.
- Offline mode prevents import commit and never auto-submits after reconnect.
- Mobile and desktop viewports.

## 17. Acceptance criteria

1. The linked Supabase Cloud project has an auditable migration history starting from the first reviewed migration.
2. No local Supabase or Docker command is required by development, test, or deployment instructions.
3. `anon` cannot access application data or functions.
4. An authenticated user without an active completed profile cannot access protected data.
5. The three roles and effective-permission formula match the original design.
6. The last active owner cannot be deactivated or demoted under concurrency.
7. Browser and server reject every forbidden numeric representation defined in section 6.
8. Official arithmetic uses PostgreSQL `numeric`; client payloads carry decimal strings.
9. Read-only values display with `vi-VN` grouping and decimal separators without changing canonical values.
10. Every user-facing error, toast, import error, notification, loading state, and empty state is Vietnamese.
11. Raw database/dependency errors and secrets never appear in the UI.
12. Four versioned Excel templates are generated and contract-tested.
13. Import mapping identifies missing, duplicate, unknown, and conflicting columns before commit.
14. Row/cell errors include stable codes, Vietnamese messages, and original row numbers.
15. Import is atomic and idempotent; an invalid row produces zero business writes.
16. Imported products create both required zero balances; sale price history is owner-only.
17. Opening stock and cost cannot be imported before the inventory cost engine phase.
18. Toasts are accessible and persistent notifications are isolated by RLS.
19. Realtime only invalidates/refetches and never becomes the authoritative record.
20. UI passes the defined trust-first design, responsive, contrast, focus, loading, empty, error, and offline checks.
21. Security, unit, integration, and browser tests pass against Supabase Cloud with no production credential committed.

## 18. Operational notes

- The database password remains CLI-only and must never appear in command output, logs, screenshots, or committed scripts.
- CLI commands that need a database password pass it through an environment-variable reference, never a literal.
- The current cosmetic pnpm warning about the legacy `package.json` field does not change the effective `pnpm-workspace.yaml` build allowlist.
- Vercel environment and deployment decisions remain deferred until the user explicitly starts the deployment phase.
- This project is implemented by the primary agent only. No sub-agent is used unless the user explicitly requests it later.
