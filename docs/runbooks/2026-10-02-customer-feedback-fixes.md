# Phản ánh khách hàng 02/10/2026 — triển khai và UAT

Trạng thái: đã triển khai trên nhánh `codex/tuenhi-feedback-fixes`; chưa apply
migration, deploy Edge Function hoặc frontend lên Cloud trong task này.

## Hành vi bàn giao

| Phản ánh                                  | Cách xử lý                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chưa chốt đơn hoặc hết tồn không in được  | POS có **In tạm tính**, lưu nháp rồi mở chứng từ “PHIẾU TẠM TÍNH — CHƯA THANH TOÁN”. Không thu tiền, không trừ tồn, không cấp số hóa đơn chính thức. Điều kiện tồn của thanh toán giữ nguyên. PDF có font tiếng Việt và đợi tải xong trước khi báo thành công.                                                                                                          |
| Không sửa/chọn được nhà cung cấp khi nhập | Tìm kiếm có phân trang, giữ NCC đã chọn, báo lỗi và thử lại; người có quyền có thể thêm/sửa NCC ngay trong phiếu.                                                                                                                                                                                                                                                       |
| Nhân viên kho chỉ cần xem tồn             | Vai trò **Kho — Chỉ xem** (`WAREHOUSE_VIEWER`) chỉ có quyền đọc danh mục/tồn. Server chặn quyền ghi, doanh thu, giá bán và giá vốn, kể cả có GRANT cũ. Chuyển sang vai trò này xóa overrides cũ; đăng nhập vào Hàng hóa.                                                                                                                                                |
| Không hủy/sửa được phiếu nhập             | Hủy được nháp/chờ giá mà giữ lịch sử gửi. Phải lưu thay đổi trước Ghi sổ; tải lại cả nội dung và giá sau thao tác. Phiếu đã ghi sổ dùng đảo phiếu có lý do, sau đó chủ động lập phiếu thay thế. Nếu hàng đã có biến động tiếp theo, giữ chặn đảo và giải thích nguyên nhân. Ngày nhận dùng đúng giờ địa phương.                                                         |
| Hàng dưới 50 hộp cần báo người dùng       | Cảnh báo trong chuông thông báo cho tài khoản đang hoạt động, đã đổi mật khẩu và có quyền đọc tồn. Ngưỡng được cấu hình theo đơn vị sản phẩm; Hộp/Hop để 0 dùng mặc định 50, đơn vị khác để 0 tắt cảnh báo. Tồn 50 chưa báo; 49 và 0 có báo. Một cảnh báo mỗi người cho mỗi đợt xuống thấp; đọc thông báo không làm gửi lại. Tăng lên ngưỡng rồi giảm tiếp tạo đợt mới. |

`minStockQty` luôn là giá trị cấu hình dùng khi sửa sản phẩm.
`effectiveMinStockQty` là ngưỡng server tính để hiển thị/lọc; không ghi ngược
ngưỡng mặc định vào cấu hình khi sửa tên hoặc đổi đơn vị. Không tự quy đổi
Thùng ↔ Hộp. Chưa triển khai SMS, Zalo, email hoặc thông báo đẩy ngoài app.

## Thứ tự release sau khi Owner duyệt migration

1. Review ba migration bên dưới, backup theo quy trình hiện hành, đối chiếu
   project và danh sách migration. Dry-run phải chỉ có đúng ba migration này.
2. Apply theo thứ tự timestamp:
   - `20261002091314_sales_provisional_print.sql`: thêm RPC đọc phiếu tạm.
   - `20261002091429_warehouse_viewer_access.sql`: thêm vai trò/quyền, che giá.
   - `20261002091513_purchase_cancel_and_low_stock_alerts.sql`: sửa CHECK trạng
     thái hủy, tạo trạng thái đợt cảnh báo/trigger, đồng bộ bộ lọc và seed cảnh báo.
3. Migration cuối sẽ tạo cảnh báo cho hàng **đang** dưới ngưỡng, gồm tồn 0. Nó
   chỉ thêm trạng thái cảnh báo và notification, không thay đổi tồn/giá/giao dịch.
   Kiểm tra số hàng/người nhận dự kiến để Owner biết lượng thông báo ban đầu.
4. Deploy Edge Function `create-employee` (validator mới chấp nhận vai trò kho
   chỉ xem). Các parser reset/reactivate/deactivate không đổi hành vi.
5. Deploy frontend từ cùng commit; cập nhật PWA để nhận UI và hai font Roboto.
   Chỉ tạo/chuyển tài khoản sang vai trò mới sau bước này.
6. Chạy `pnpm p2:release:verify` và public production smoke theo README. Gate
   mới gồm `pnpm cloud:verify:feedback`, chỉ đọc schema/quyền, không tạo dữ liệu.
   Nếu token quản trị vẫn trả 401, phải khôi phục quyền hoặc dùng kết nối Postgres
   được phép để chạy cùng assertion read-only; không coi kiểm tra bị chặn là đạt.
7. Owner làm UAT thủ công trên dữ liệu được phép; không chạy fixture tự động lên
   Cloud. Xác nhận in bằng máy/printer trình duyệt thực tế trước phát hành rộng.

Các assertion mới ở `supabase/tests/*_assertions.sql` đều dùng transaction
read-only. `supabase/tests/isolated/` chỉ dành cho PostgreSQL tạm trên máy local.

## Checklist UAT

- POS: sản phẩm tồn 0 → In tạm tính → thấy nhãn chưa thanh toán, đúng khách/dòng
  hàng/chiết khấu; PDF nhiều trang giữ dấu tiếng Việt. Tồn, thanh toán, doanh thu,
  số hóa đơn chính thức không đổi. Đổi khách bị khóa trong lúc lưu/in. In lại được.
- Nhà cung cấp: tìm một NCC ngoài trang đầu; chọn, sửa tên, lưu; quay lại phiếu
  vẫn giữ các dòng hàng và NCC. Lỗi mạng có nút thử lại, không hiện “không có” giả.
- Phiếu nhập: đổi số lượng/NCC/ngày nhận → Ghi sổ bị khóa đến khi lưu. Hủy nháp
  và chờ giá được; phiếu đã gửi vẫn giữ mốc gửi. Đảo phiếu đã ghi sổ yêu cầu lý do;
  nếu có biến động kế tiếp, thông báo hướng xử lý và không đổi tồn.
- Phiếu thay thế: sau đảo, bấm Lập phiếu thay thế để điền bản nháp; chưa bấm lưu
  thì không tạo phiếu hoặc ghi sổ. Kiểm tra giờ nhận theo múi giờ thiết bị.
- Vai trò kho: Owner tạo hoặc chuyển một tài khoản thử được Owner quản lý; chỉ
  thấy hàng và tồn, không giá/doanh thu/thao tác ghi. URL trực tiếp và RPC ghi bị
  từ chối. Owner hiện tại giữ nguyên quyền. Quyền GRANT/REVOKE cũ được xóa khi đổi.
- Ngưỡng tồn: 50 → 49 tạo cảnh báo; đọc rồi giảm 48 → 0 không lặp; lên 50 rồi giảm
  lại tạo cảnh báo mới. Đổi ngưỡng đánh giá lại tồn; Hộp có ngưỡng cấu hình 0 vẫn
  giữ 0 sau sửa tên và khi đổi sang Thùng dùng ngưỡng hiệu lực 0.

## Bằng chứng kiểm tra trước release

- Đã đọc schema Cloud hiện hành bằng schema-only dump; không sao chép dữ liệu
  khách hàng, không DML/DDL Cloud.
- Replay cả ba migration theo thứ tự trên PostgreSQL 17 tạm, chỉ mở Unix socket;
  schema gốc cộng dữ liệu quyền chuẩn từ migration repo, không có dữ liệu Cloud.
- Fixture kiểm phạm vi OWN/ALL/NONE, in tồn 0 không biến động tài chính, viewer
  allowlist/override/giá, hủy chờ giá/idempotency, ngưỡng 50/49/0, rollback và hai
  giao dịch giảm tồn đồng thời. Mọi fixture chỉ chạy ở DB local có tên cố định.
- Đã kiểm seed với một sản phẩm tồn 0 có trước migration: một thông báo, tồn
  không thay đổi. Các assertion read-only của cả ba migration đã đạt local.
- Review độc lập đã phát hiện và sửa hai vấn đề: giữ ngưỡng cấu hình khi sửa
  sản phẩm; khóa thay khách khi đang lưu/in. Có regression cho cả hai.
- `pnpm check`: đạt 109 file / 509 test; format, lint, TypeScript, template và
  font integrity đều đạt. Production build: initial JS gzip 215290 bytes, CSS
  gzip 8710 bytes, tổng deploy assets 4127643 bytes (giới hạn 4194304).
- `pnpm test:e2e:ci`: 2/2 kiểm tra login shell và PWA manifest đạt trên mobile
  và desktop Chromium. Kết quả CI remote ghi trong PR; không suy ra Cloud đã đạt
  chỉ từ local tests.

## Khi có lỗi sau triển khai

Ưu tiên forward fix nhỏ, giữ lịch sử chứng từ và phân quyền. Không xóa
notification hoặc bảng episode để “reset” vì sẽ gửi lặp. Nếu cần dừng phát sinh
cảnh báo, đề xuất migration mới chỉ tắt ba trigger `inventory_low_stock_insert`,
`inventory_low_stock_update`, `product_low_stock_update`; phải review/duyệt trước.

Không khôi phục CHECK cũ sau khi đã hủy phiếu có `submitted_at`, vì dữ liệu hợp lệ
mới sẽ vi phạm CHECK cũ. Không downgrade viewer sang quyền rộng để rollback.
Không rollback frontend cũ khi còn tài khoản viewer đang hoạt động mà chưa có
phương án truy cập phù hợp được Owner duyệt. RPC in tạm có thể giữ lại khi rollback
UI; nó chỉ đọc và vẫn kiểm quyền. Không dùng rollback để chỉnh/xóa giao dịch.
