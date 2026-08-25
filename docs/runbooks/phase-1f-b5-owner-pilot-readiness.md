# Runbook Phase 1F-B5 — Ổn định Owner Pilot và Production Readiness

## Mục đích và ranh giới

Runbook này dùng để nghiệm thu Preview khi project Cloud đã ở `OWNER_PILOT`.
Dữ liệu hiện tại là mock để Owner tiếp tục thử nghiệm; không được xem là dữ liệu
sẵn sàng Production.

Trong B5, không chạy `cutover:preflight`, `cutover:cleanup-tests`, Cloud
runner, E2E Cloud runner, backup, restore hoặc lệnh chuyển lifecycle. Không tạo
tài khoản nhân viên thật. Không merge `main` hay deploy Production.

Chỉ các kiểm tra sau đây được phép với Cloud: `pnpm cutover:verify`,
`supabase migration list`, `supabase db lint` và advisor ở chế độ đọc.

## Kiểm thử Owner trên Preview

Ghi ngày giờ, commit Preview và kết quả từng dòng trong báo cáo readiness.
Mọi nghiệp vụ ghi dữ liệu ở đây chỉ dùng dữ liệu mock đang có; không chạy script
tự tạo dữ liệu hoặc dọn dữ liệu sau khi thử.

| Nhóm         | Kịch bản phải xác nhận                                               | Kết quả mong đợi                                                         |
| ------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Auth         | Đăng nhập, đăng xuất, đổi mật khẩu, quên/reset mật khẩu              | Hoàn thành; thông báo tiếng Việt rõ ràng                                 |
| Danh mục     | Kênh bán, khách hàng, nhà cung cấp, sản phẩm, ảnh, giá, ngưỡng tồn   | Lưu và hiển thị đúng; lỗi validation không mất dữ liệu đã nhập           |
| Tồn kho      | Mở sổ, mua hàng, kiểm kho, valuation                                 | Quantity, movement và giá trị tồn khớp chứng từ                          |
| POS          | Chọn điểm bán, thêm hàng, hoàn tất bán và xem hóa đơn                | Điểm bán không nhấp nháy; hóa đơn và tồn kho được cập nhật một lần       |
| Chuyển khoản | Bán/chuyển khoản và hoàn tiền/chuyển khoản                           | Bắt buộc ảnh JPEG/PNG/WebP ≤ 5 MiB; chụp/tải ảnh, signed URL riêng tư    |
| Ngoại lệ bán | Hủy hóa đơn và trả hàng                                              | Chứng từ, hoàn tồn và event tài chính ghi nhận tại ngày sự kiện          |
| Báo cáo      | Dashboard, `/reports`, XLSX và event ledger                          | Số server trả về là authoritative; export không chứa dữ liệu ngoài quyền |
| Ứng dụng     | Desktop/mobile, refresh/deep-link, offline/loading/error, PWA assets | Route không 404; trạng thái tiếng Việt; asset PWA tải trực tiếp          |

## Bảng đối soát ledger trên dữ liệu mock

Chọn một hóa đơn mock có sale, cancel hoặc return liên quan và ghi giá trị trước/
sau theo khoảng ngày chứa các sự kiện. Không tính lại tiền bằng `parseFloat`;
dùng canonical decimal do Dashboard/Reports và XLSX trả về.

| Event              | Doanh thu thuần              | Giá vốn thuần           | Lợi nhuận gộp          | Tồn kho                    |
| ------------------ | ---------------------------- | ----------------------- | ---------------------- | -------------------------- |
| `SALE_COMPLETED`   | Tăng theo doanh thu sau giảm | Tăng theo COGS snapshot | `netRevenue - netCogs` | Giảm theo số lượng bán     |
| `SALE_CANCELLED`   | Giảm tại ngày hủy            | Giảm tại ngày hủy       | Đảo ảnh hưởng sale     | Hoàn lại theo chứng từ     |
| `RETURN_COMPLETED` | Giảm tại ngày trả            | Giảm theo COGS trả      | Đảo phần trả           | Hoàn lại theo số lượng trả |

Xác nhận riêng rằng tổng Dashboard/Reports bằng tổng event ledger trong cùng
khoảng ngày, sale chỉ đếm `SALE_COMPLETED`, AOV chỉ dùng sale hoàn tất và
`legacy_sales` không xuất hiện ở Dashboard, revenue report, profit report hoặc
XLSX.

## Kiểm tra kỹ thuật chỉ đọc

1. Chạy `pnpm check` và `pnpm test:e2e:ci` tại worktree B5.
2. Kiểm tra `vercel.json`: SPA fallback chuyển route ứng dụng về `index.html`;
   xác nhận `/manifest.webmanifest`, `/sw.js` và PWA icon trả về trực tiếp.
3. Kiểm build không chứa chuỗi credential server (`SUPABASE_SECRET_KEY`,
   `SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`, `service_role`). Browser
   bundle chỉ được lấy URL và publishable key Supabase.
4. Chạy `pnpm cutover:verify`, migration list local/remote, DB lint và advisor
   ở chế độ đọc. Xác nhận lifecycle `OWNER_PILOT`, policy `OWNER_WAIVER`, audit
   vẫn có và số liệu mock chưa bị thay đổi bởi script.
5. Xác nhận owner-cost query có `enabled` theo quyền và `gcTime: 0`; luồng nhân
   viên không fetch, render hoặc cache DTO cost/profit.

## Điều kiện kết thúc B5

Chỉ đánh dấu readiness kỹ thuật khi toàn bộ gate local/đọc-only xanh và Owner
ký UAT các luồng trên. Báo cáo phải ghi rõ dữ liệu mock còn tồn tại. B5 không
cho phép chuyển Production.

Trước go-live cần một phase cutover riêng, được Owner duyệt: quyết định cách xử
lý mock, làm sạch có kiểm soát nếu được cho phép, nhập dữ liệu thật, baseline
backup, đối soát mở sổ và phê duyệt Production.
