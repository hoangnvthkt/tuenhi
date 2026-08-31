# P2.1 — Daily Workflow Productivity Design

Ngày: 2026-08-31

Trạng thái: Owner đã duyệt

## Mục tiêu

P2.1 giảm thao tác lặp trong POS, phục hồi giỏ an toàn khi reload hoặc mở nhiều
tab, tự tra kết quả lệnh tài chính còn chờ và rút gọn việc tìm/in/tải hóa đơn.
Increment này dùng các RPC hiện có và không đổi quy tắc payment, cancel hoặc
return.

## Quyết định UX và an toàn

- Mỗi giỏ chỉ có một tab được chỉnh sửa. Tab khác chỉ đọc cho tới khi Owner chủ
  động chọn **Tiếp tục ở tab này**.
- POS dùng bộ phím tắt gọn: `/` hoặc `F2` focus tìm kiếm, mũi tên chọn kết quả,
  `Enter` thêm hàng, `Escape` xóa/đóng và `Ctrl/Cmd+Enter` mở hoặc xác nhận
  checkout.
- SKU/barcode khớp chính xác được ưu tiên; máy quét USB/Bluetooth hoạt động như
  bàn phím. Camera barcode tiếp tục hoãn.
- Pending financial command được tra tự động bằng RPC chỉ đọc khi đăng nhập,
  online hoặc nhận thay đổi storage. Ứng dụng không tự gửi lại command.
- Sau thanh toán, ứng dụng mở chi tiết hóa đơn và để người dùng chủ động in, tải
  PDF hoặc tạo đơn mới; không tự bật print dialog.

## Kiến trúc

- Snapshot giỏ V2 được phân vùng theo user và định danh giỏ, có revision,
  server version, thời điểm và tab ghi cuối. Payload được kiểm tra bằng Zod.
- Lease tab dùng `sessionStorage` cho tab ID và `localStorage` cho quyền sở hữu,
  heartbeat 10 giây, TTL 60 giây. Mọi lần ghi giỏ đều kiểm tra lại lease.
- Draft local chỉ được phục hồi khi version server khớp; server là nguồn quyết
  định khi version lệch.
- Recovery coordinator lọc marker theo user hiện tại, xác thực cached response
  là success envelope trước khi xóa và giữ request ID tách biệt correlation ID.
- Tìm sản phẩm và hóa đơn debounce ở client nhưng tiếp tục gọi read RPC hiện
  hành. `pdfmake` tiếp tục được lazy-load từ trang hóa đơn.

## Ranh giới

Không có migration, codegen Supabase, dependency mới, telemetry, offline
financial completion, fuzzy search, camera scanner hoặc Cloud synthetic test.
Owner chỉ UAT thủ công bằng dữ liệu test trên project
`CONTROLLED_DEVELOPMENT_UAT` có lifecycle kỹ thuật `PRODUCTION`.
