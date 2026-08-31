# P2.2 — Connected Business Explorer Implementation Plan

Ngày: 2026-08-31

Trạng thái: Owner đã duyệt

## Mục tiêu

Triển khai Context Hub liên thông Sản phẩm ↔ Nhà cung cấp ↔ Phiếu nhập. Quan hệ,
KPI và lịch sử chỉ suy ra từ phiếu nhập `POSTED`; không thêm quan hệ khai báo,
BI chart, telemetry hoặc command ghi mới.

P2.2 được thực hiện bởi một agent Codex chính trên branch
`codex/phase-2-p2-2-connected-business-explorer`, sau khi P2.1 `5965e38` đã
fast-forward vào local và remote `main`.

## Database contract

- Migration additive tạo một partial index cho phiếu `POSTED` theo Nhà cung cấp
  và năm read-model RPC: product context, product suppliers, supplier detail,
  supplier products và posted purchase history.
- API wrappers dùng `security invoker`; implementations nằm trong
  `app_private`, dùng `security definer`, `stable` và `search_path=''`.
- Chỉ `authenticated` được execute. Product/supplier/purchase permissions được
  kiểm tra server-side; cost luôn `null` khi thiếu `purchase.cost.read`.
- List dùng keyset pagination 25 dòng, tối đa 100. Count là JSON integer; quantity
  và money là canonical decimal string.
- Không DML, backfill, trigger, table mới hoặc sửa function hiện hành.

## Frontend

- Module `connected-explorer` cung cấp strict Zod DTO, API client, query keys,
  URL parser và component Context Hub dùng chung.
- `/products/:productId` có tab overview/suppliers/purchases, KPI, history và
  deeplink bán/nhập theo quyền.
- Thêm `/more/suppliers/:supplierId` và route edit; hồ sơ Nhà cung cấp có tab
  overview/products/purchases và drill-through tới sản phẩm/phiếu nhập.
- Chi tiết phiếu nhập có link ngược tới Nhà cung cấp và sản phẩm.
- `focusProduct` tại POS và `productId`/`supplierId` tại phiếu nhập mới chỉ điền
  ngữ cảnh local; không tự thêm giỏ, tạo draft hoặc gọi mutation.
- URL là nguồn chuẩn cho tab/filter; section liên thông lỗi độc lập; response
  chứa cost không được persist vào browser storage hoặc PWA cache.

## Verification và release

- Tests bao phủ strict DTO, URL, permission/cost boundary, pagination, partial
  errors và deeplink không tự ghi.
- Cloud assertion P2.2 chỉ đọc metadata và dữ liệu hiện có; không tạo user hoặc
  chứng từ test.
- Release gate chạy `pnpm check`, migration list, lint/advisors, Phase 1F và
  P2.2 assertions. Application counts trước/sau migration phải không đổi.
- Migration được dry-run rồi apply lên `CONTROLLED_DEVELOPMENT_UAT`; frontend cũ
  vẫn tương thích. Rollback frontend dùng Vercel; database contract additive
  được giữ lại.
- Owner UAT thủ công drill-through hai chiều và deeplink, ghi nhận riêng mọi
  chứng từ test do Owner chủ động tạo.
