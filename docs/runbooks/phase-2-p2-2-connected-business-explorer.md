# P2.2 — Connected Business Explorer

Ngày hiệu lực: 2026-08-31

## Phạm vi release

P2.2 triển khai Context Hub liên thông **Sản phẩm ↔ Nhà cung cấp ↔ Phiếu nhập**
trên project `CONTROLLED_DEVELOPMENT_UAT`, trong khi lifecycle kỹ thuật vẫn là
`PRODUCTION`. Quan hệ, KPI và lịch sử được tính động chỉ từ phiếu nhập có trạng
thái hiện hành `POSTED`.

Migration `20260831125023_phase_2_p2_2_connected_business_explorer.sql` chỉ
thêm một partial index và năm read-model RPC cùng implementation tương ứng.
Migration không backfill, không sửa chứng từ, không thêm command và tương thích
với frontend cũ. Supabase types được regenerate sau khi migration Cloud được
apply.

## Contract vận hành và bảo mật

- Phiếu `DRAFT`, `AWAITING_COST`, `CANCELLED` và `REVERSED` không tạo quan hệ.
- Phiếu `POSTED` không có Nhà cung cấp vẫn nằm trong lịch sử sản phẩm, nhưng
  không tạo quan hệ và không tăng `supplierCount`.
- Quantity và money đi qua canonical decimal string; count là JSON integer.
- Cost được kiểm tra tại database. Khi thiếu `purchase.cost.read`, RPC trả các
  trường cost là `null`, không trả dữ liệu rồi ẩn ở frontend.
- Danh sách dùng keyset pagination 25 dòng, tối đa 100; không dùng `OFFSET`.
- API chỉ cấp `EXECUTE` cho `authenticated`; không có direct grant mới lên bảng
  cost trong `app_private`.
- Dữ liệu Context Hub không được persist vào localStorage, IndexedDB hoặc PWA
  runtime cache.

## Deeplink an toàn

- `/pos?focusProduct=<uuid>` chỉ focus sản phẩm và yêu cầu người dùng xác nhận
  thêm. Tab không giữ POS lease không được sửa giỏ.
- `/more/purchases/new?productId=<uuid>&supplierId=<uuid>` chỉ điền local form
  khi entity hợp lệ và người dùng chưa tự sửa giá trị.
- Không deeplink nào tự tạo draft, gọi save/post/reverse/cancel, tự thêm hàng,
  tự sinh idempotency key hoặc ghi database.
- UUID sai, entity không tồn tại/ngừng hoạt động hoặc thiếu quyền chỉ làm lỗi
  phần intent; form/giỏ hiện hành tiếp tục hoạt động và không lộ lỗi Supabase.

## Migration và xác minh đã thực hiện

Trước migration, `pnpm p2:release:verify` đạt với 46 migration và application
counts đã scrub: profiles/categories/suppliers/customers/products/product_images/
inventory_balances đều là 1; các nhóm chứng từ vận hành còn lại là 0.

Migration được kiểm tra theo thứ tự:

1. Xác nhận project identity, lifecycle `PRODUCTION` và policy
   `OWNER_WAIVER`.
2. `supabase migration list --linked` cho thấy đúng một migration local-only.
3. `supabase db push --linked --dry-run` chỉ liệt kê migration P2.2.
4. Apply migration additive đã duyệt lên project hiện tại.
5. Chạy SQL assertions P2.2 chỉ đọc và regenerate TypeScript types.

Review `EXPLAIN (FORMAT JSON)` được chạy cho đường truy vấn theo product và
supplier. Dataset hiện tại gần như trống nên planner chọn sequential scan với
estimated row bằng 1; đây là lựa chọn hợp lý cho bảng rất nhỏ. Partial index
`purchase_receipts_posted_supplier_received_idx` vẫn tồn tại đúng predicate và
không ép planner dùng index. Khi dữ liệu tăng, performance advisor và kế hoạch
truy vấn phải được rà lại trước khi thay đổi index.

## Release gate

Chạy tại branch release:

```bash
git diff --check
pnpm check
pnpm p2:verify:cloud
pnpm p2:release:verify
```

`p2:verify:cloud` phải xác nhận:

- `environmentRole: CONTROLLED_DEVELOPMENT_UAT`;
- lifecycle `PRODUCTION` và policy hợp lệ;
- local/remote migration khớp;
- DB lint, security/performance advisors, Phase 1F assertions và
  `p2.2Assertions` đều đạt;
- application counts sau migration không đổi so với baseline.

Không chạy `test:cloud:*`, Cloud E2E có credential, cleanup, bootstrap,
lifecycle mutation hoặc automation tạo/xóa dữ liệu. `db push` chỉ được dùng cho
migration additive đã review; migration P2.2 không được apply lại hoặc sửa sau
khi đã lên Cloud.

Sau khi fast-forward/push `main`, chờ check cố định
`Vercel - tuenhi: production-smoke` đạt trên deployment URL trước khi domain
Production được cập nhật.

## Owner UAT thủ công

Owner thực hiện trên desktop và mobile. Trước UAT chỉ đọc counts; mọi chứng từ
test Owner chủ động tạo phải được ghi nhận riêng.

1. Product → Supplier → Purchase Receipt và quay ngược lại bằng link.
2. Supplier → Product → Purchase Receipt và quay ngược lại bằng link.
3. Purchase Receipt → Product/Supplier từ header và từng dòng.
4. Đổi tab/filter, reload, back/forward; URL phải giữ đúng ngữ cảnh.
5. Dùng tài khoản không có `purchase.cost.read`: quantity/KPI phù hợp vẫn hiện,
   mọi cost phải ẩn vì response server trả `null`.
6. Mở deeplink POS: giỏ không đổi trước khi bấm thêm; tab chỉ đọc không thể
   thêm sản phẩm.
7. Mở deeplink phiếu nhập: form được điền local nhưng không có draft/save tự
   động.
8. Nếu chưa có lịch sử phù hợp, Owner tự lập và ghi sổ một phiếu test qua UI,
   ghi nhận thay đổi counts; không dùng Cloud runner.

## Rollback

- Frontend: dùng Vercel Instant Rollback về deployment Production tốt gần nhất,
  sau đó chạy lại public smoke.
- Database: giữ migration additive vì frontend cũ không phụ thuộc các RPC mới.
  Không chạy down migration, drop function/index hoặc sửa dữ liệu tại chỗ.
- Chứng từ: không xóa trực tiếp phiếu đã ghi sổ. Dùng command reverse/cancel hợp
  lệ khi cần hoặc giữ dữ liệu test đến P2.6.

Nếu RPC/read model có lỗi sau rollback frontend, dừng UAT ghi dữ liệu và điều
tra bằng query/assertion chỉ đọc. Không mở grant tạm lên `app_private`.
