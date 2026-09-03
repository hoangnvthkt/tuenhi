# P2.3 — Customer Purchase History Runbook

Ngày bắt đầu: 2026-09-03

Trạng thái: Implementation hoàn tất trên `CONTROLLED_DEVELOPMENT_UAT`; chờ Owner UAT

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

## Sau migration database

Migration `20260903021635_phase_2_p2_3_customer_purchase_history.sql` được
dry-run với đúng một migration, không seed/role/Vault, sau đó apply thành công.

- migrations local/remote: `48`
- lifecycle: `PRODUCTION`
- policy: `OWNER_WAIVER`
- application counts: không đổi so với baseline
- DB lint, security advisor, performance advisor, Phase 1F và P2.2 assertions:
  đạt
- P2.3 assertions: đạt; các nhánh cần dữ liệu sale/return hoặc actor scope khác
  được thiết kế fail/skip bằng `NOTICE`, không tạo dữ liệu kiểm thử

Review `EXPLAIN (FORMAT JSON)` cho customer sales, financial-event summary và
product cohort cho thấy planner dùng sequential scan/hash join trên dataset hiện
có `0` sale và `0` return. Đây là lựa chọn hợp lý với bảng rỗng; không ép planner
dùng `sales_customer_completed_idx`. Partial index đã tồn tại để hỗ trợ keyset
query khi dữ liệu vận hành tăng.

Gate sau implementation bắt buộc chạy theo thứ tự:

```bash
git diff --check
pnpm check
pnpm p2:verify:cloud
pnpm p2:release:verify
```

`p2:verify:cloud` bao gồm migration parity, DB lint, security/performance
advisor, Phase 1F, P2.2 và P2.3 assertions. Các bước đều chỉ đọc; application
counts sau gate phải giữ nguyên baseline, ngoại trừ giao dịch test do Owner tự
tạo và ghi nhận riêng trong UAT.

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

## Owner UAT

Sau khi code review đạt và Owner cho phép fast-forward/push riêng:

1. Chờ check `Vercel - tuenhi: production-smoke` đạt trên deployment URL.
2. Kiểm tra drill-through Customer → Sale → Return/Product và chiều ngược lại.
3. So sánh KPI lifetime với một kỳ có sale, return và cancel.
4. Dùng tài khoản `sale.own.read` để xác nhận nhãn **Giao dịch của tôi** và
   không thấy giao dịch actor khác.
5. Dùng tài khoản không có sales read để xác nhận chỉ tải hồ sơ, không phát
   sinh ba list RPC.
6. Kiểm tra POS customer prefill ở ba trạng thái giỏ trống/cùng khách/khách
   khác, cùng reload/back/forward trên desktop và mobile.
7. Nếu thiếu dataset, Owner tự tạo giao dịch test qua UI và ghi nhận thay đổi
   counts riêng; agent không chạy automation tạo dữ liệu.

Không fast-forward vào `main`, push hoặc promote trước xác nhận riêng của Owner.
