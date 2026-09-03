# P2.3 — Customer Purchase History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use
> `superpowers:executing-plans`. Thực hiện toàn bộ bằng một agent chính; không
> dùng subagent.

**Goal:** Mở rộng Connected Business Explorer thành Customer Context Hub liên
thông Khách hàng ↔ Hóa đơn ↔ Phiếu trả ↔ Sản phẩm, với KPI tài chính từ
operational financial-event ledger và POS customer prefill có kiểm soát.

**Architecture:** Bốn RPC read-model additive tổng hợp server-side theo quyền
`ALL/OWN/NONE`, keyset pagination và dữ liệu snapshot. Frontend mở rộng feature
`connected-explorer`, giữ URL làm nguồn trạng thái và tái sử dụng RPC
`get_sale_detail` cho deeplink ngược.

**Tech Stack:** PostgreSQL/Supabase RPC, TypeScript, React 19, React Router 8,
TanStack Query 5, Zod 4, Vitest.

**Spec:**
`docs/superpowers/specs/2026-09-03-phase-2-p2-3-customer-purchase-history-design.md`

## Ràng buộc chung

- Branch `codex/phase-2-p2-3-customer-purchase-history` chứa spec commit
  `2c701d1`, base P2.2 `474e6b6`; dừng khi working tree hoặc remote divergence.
- Project giữ `CONTROLLED_DEVELOPMENT_UAT`, lifecycle `PRODUCTION`, policy
  `OWNER_WAIVER`.
- Chỉ dùng operational sales/returns và
  `app_private.sales_financial_events`; không đọc `legacy_sales`.
- Không sửa command tài chính, backfill, tạo dữ liệu Cloud, dependency
  frontend, Realtime, telemetry hoặc Product → Customer explorer.
- Không chạy `test:cloud:*`, credentialed Cloud E2E, cleanup, bootstrap hoặc
  lifecycle mutation.
- Migration chỉ gồm bốn wrapper RPC, bốn private implementation, grant/revoke
  và một partial index.
- List dùng keyset pagination, mặc định 25, tối đa 100, lấy `limit + 1`; không
  dùng `OFFSET`.
- Không trả cost, COGS hoặc profit; frontend dùng strict schema.

## Database contract

```sql
api.get_customer_detail(uuid, date, date)
api.list_customer_sales(uuid, date, date, timestamptz, uuid, integer)
api.list_customer_returns(uuid, date, date, timestamptz, uuid, integer)
api.list_customer_products(uuid, text, date, date, text, timestamptz, uuid, integer)
```

- Mỗi wrapper có implementation cùng signature trong `app_private` với hậu tố
  `_impl`.
- Wrapper `stable`, `security invoker`, `search_path=''`; implementation
  `stable`, `security definer`, `search_path=''`.
- Chỉ `authenticated` được execute; `PUBLIC` và `anon` bị revoke.
- Customer profile yêu cầu `customer.read` hoặc `customer.manage`; transaction
  scope ưu tiên `sale.all.read`, sau đó `sale.own.read`, còn lại `NONE`.
- Date range theo `Asia/Ho_Chi_Minh`; một đầu được phép, hai đầu tối đa 366 ngày
  inclusive.
- Cursor thiếu thành phần, search quá 200, limit ngoài `1..100`, date/cursor sai
  trả `VALIDATION_FAILED`.

Index:

```sql
create index sales_customer_completed_idx
on api.sales (customer_id, completed_at desc, id desc)
where customer_id is not null and status <> 'DRAFT';
```

## Client contract

```ts
type CustomerSalesScope = 'ALL' | 'OWN' | 'NONE';
type CustomerSalesCursor = { completedAt: string; saleId: string };
type CustomerReturnsCursor = { completedAt: string; returnId: string };
type CustomerProductsCursor = {
  netPurchasedQty: string;
  lastPurchasedAt: string;
  productId: string;
};

interface CustomerExplorerApi {
  customerDetail(input: CustomerDetailInput): Promise<CustomerDetail>;
  customerSales(input: CustomerSalesInput): Promise<CustomerSalesPage>;
  customerReturns(input: CustomerReturnsInput): Promise<CustomerReturnsPage>;
  customerProducts(input: CustomerProductsInput): Promise<CustomerProductsPage>;
}
```

- `netSpend` dùng signed canonical decimal; các quantity/amount/cursor còn lại
  dùng non-negative canonical decimal.
- Query keys bắt đầu bằng `connected-explorer` và chứa entity/filter/limit/cursor.
- `parseCustomerContextUrl()` canonicalize `overview/sales/returns/products`,
  `from/to` và `q` chỉ dành cho products.

## Trình tự triển khai

### Task 1 — Tài liệu và baseline

- Lưu plan, duyệt spec/Master Design, tạo runbook P2.3.
- Chạy `pnpm p2:release:verify` và ghi lifecycle/policy/migration count/counts đã
  scrub.
- Commit `docs: approve p2.3 customer purchase history`.

### Task 2 — Database read model additive

- Viết assertion SQL trước, xác nhận fail vì functions chưa tồn tại.
- Tạo migration qua `pnpm supabase migration new
  phase_2_p2_3_customer_purchase_history`.
- Implement customer detail, sales, completed returns và product cohort read
  models với stable keyset order và permission checks trước entity lookup.
- Dry-run bằng `pnpm supabase db push --linked --dry-run --skip-vault`, review,
  apply bằng `pnpm supabase db push --linked --skip-vault`, rồi chạy
  `pnpm supabase:types`.
- Chạy assertions, EXPLAIN read-only, so sánh counts và commit
  `feat: add customer purchase history read models`.

### Task 3 — Client contract và URL model

- TDD strict envelopes, signed/non-negative decimal, safe errors và cursors.
- TDD lifetime/one-sided/invalid date, overlong query và canonical replace.
- Implement `createCustomerExplorerApi`, customer query keys và URL parser.
- Commit `feat: add customer explorer client contracts`.

### Task 4 — Customer Context Hub

- TDD `ALL/OWN/NONE`, partial activity errors, URL filters, pagination,
  permission-gated actions/links và edit flow.
- Thêm detail/edit routes; link Customer list tới hub; tái sử dụng
  `CustomerForm`.
- Overview tải profile/KPI và merge tối đa năm activity; list tabs dùng
  `useInfiniteQuery` 25 dòng.
- Commit `feat: build customer context hub`.

### Task 5 — Deeplink ngược Sale/Return

- TDD link permissions và lookup failure isolation.
- Sale Detail gọi thêm một `get_sale_detail` để map customer/product; Return
  Detail dùng product sẵn có và gọi một lookup sale khi cần customer.
- Không N+1, không đổi invoice/return DTO hoặc command.
- Commit `feat: connect customer sale and return navigation`.

### Task 6 — POS customer prefill

- TDD invalid/missing/inactive, empty/same/different selection, async edit,
  readonly lease và customer ngoài 100 options.
- Exact lookup, append option, selection revision guard, explicit confirm khi
  thay customer và navigation `replace` khi xử lý xong.
- Không auto-save/draft/financial command/idempotency key.
- Commit `feat: add controlled customer prefill to pos`.

### Task 7 — Gate, tài liệu và nghiệm thu kỹ thuật

- Thêm `cloud:verify:p2.3` và gate `p2.3Assertions` sau P2.2; giữ command
  allowlist read-only.
- Hoàn thiện runbook, README, Master Design và EXPLAIN/count record.
- Chạy targeted tests, `git diff --check`, `pnpm check`,
  `pnpm p2:verify:cloud`, `pnpm p2:release:verify`.
- Commits `test: gate p2.3 customer explorer release` và
  `docs: add p2.3 customer explorer runbook`.

## Release và Owner UAT

- Chỉ fast-forward vào `main` sau code review và xác nhận riêng của Owner; dừng
  nếu `origin/main` divergence.
- Chờ `Vercel - tuenhi: production-smoke` đạt trước promotion.
- Owner UAT Customer → Sale → Return/Product và điều hướng ngược, lifetime/date
  KPI, `OWN` scope, profile-only và POS prefill empty/same/different.
- Nếu thiếu dataset, Owner tự tạo giao dịch test qua UI; agent không chạy Cloud
  automation tạo dữ liệu.
- Rollback frontend bằng Vercel; giữ migration additive, không drop function,
  index hoặc sửa ledger tại chỗ.
