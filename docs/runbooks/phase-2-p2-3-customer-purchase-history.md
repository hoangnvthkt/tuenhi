# P2.3 — Customer Purchase History Runbook

Ngày bắt đầu: 2026-09-03

Trạng thái: Đang triển khai trên `CONTROLLED_DEVELOPMENT_UAT`

## Baseline trước migration

`pnpm p2:release:verify` đạt trước khi tạo migration P2.3:

- lifecycle: `PRODUCTION`
- policy: `OWNER_WAIVER`
- migrations local/remote: `47`
- local quality: `95` test files, `424` tests
- production build: initial JS gzip `198774` bytes, initial CSS gzip `7712`
  bytes, tổng deploy assets `3679467` bytes

Application counts đã scrub:

| Entity             | Count |
| ------------------ | ----: |
| profiles           |     1 |
| categories         |     1 |
| suppliers          |     1 |
| customers          |     1 |
| products           |     1 |
| product_images     |     1 |
| inventory_balances |     1 |
| stock_movements    |     0 |
| sales              |     0 |
| sale_returns       |     0 |
| stock_counts       |     0 |
| import_runs        |     0 |
| legacy_sales       |     0 |

Gate Cloud chỉ đọc đạt: project identity, lifecycle, migration list, DB lint,
security advisor, performance advisor, Phase 1F assertions và P2.2 assertions.

## Nguyên tắc dữ liệu

- Customer Context Hub chỉ dùng `api.sales`, `api.sale_lines`, các return đã
  `COMPLETED` và `app_private.sales_financial_events`.
- `legacy_sales` không tham gia KPI hoặc lịch sử P2.3.
- Sale có `customer_id = null` là khách lẻ và không được gộp thành hồ sơ giả.
- Giá vốn, COGS và lợi nhuận không được trả qua read model P2.3.
- Scope `ALL/OWN/NONE` được quyết định trong database, không suy ra ở browser.

## Lệnh vận hành

Được phép trong increment này:

- `pnpm p2:release:verify`
- `pnpm supabase migration list --linked`
- `pnpm supabase db push --linked --dry-run --skip-vault`
- `pnpm supabase db push --linked --skip-vault` cho duy nhất migration additive
  đã review
- `pnpm supabase:types`
- `pnpm cloud:verify:p2.3`

Bị cấm:

- `test:cloud:*` và Cloud E2E có credential
- cleanup, bootstrap hoặc lifecycle mutation
- backfill, reset, down migration hoặc drop function/index P2.3
- tự tạo customer, sale hoặc return test bằng automation

## Rollback

- Frontend: dùng Vercel Instant Rollback về deployment Production tốt gần nhất.
- Database: giữ migration additive để frontend cũ tiếp tục tương thích; sửa lỗi
  bằng migration expand/contract tiếp theo.
- Không sửa trực tiếp financial-event ledger hoặc mở grant tạm vào private
  tables.
