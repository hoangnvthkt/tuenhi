# P2.1 — Daily Workflow Productivity

Ngày hiệu lực: 2026-08-31

## Phạm vi release

P2.1 chỉ thay đổi frontend trên project `CONTROLLED_DEVELOPMENT_UAT`, trong khi
lifecycle kỹ thuật vẫn là `PRODUCTION`. Release dùng các RPC hiện có, không có
migration, không regenerate Supabase types, không thêm dependency và không thay
đổi command thanh toán, hủy hoặc trả hàng.

Các thay đổi vận hành gồm snapshot giỏ POS V2, lease một tab chỉnh sửa, tìm sản
phẩm bằng bàn phím, coordinator tra outcome pending command chỉ đọc, bộ lọc hóa
đơn trong URL và action in/PDF/đơn mới. Camera barcode tiếp tục hoãn; máy quét
USB/Bluetooth được hỗ trợ như bàn phím.

## Lệnh release

Trước release:

```bash
git diff --check
pnpm check
pnpm p2:release:verify
```

`p2:release:verify` phải xác nhận lifecycle `PRODUCTION`, policy hợp lệ,
migration local/remote khớp và các Cloud gate chỉ đọc đạt. Ghi lại application
counts từ output đã scrub trước Owner UAT.

Không chạy `db push`, `test:cloud:*`, Cloud E2E có credential, cleanup,
bootstrap Owner, lifecycle mutation hoặc bất kỳ automation tạo/xóa dữ liệu nào.

Sau khi push `main`, chờ check cố định
`Vercel - tuenhi: production-smoke` đạt trên deployment URL trước khi domain
Production được cập nhật. Nếu check không đạt, không promotion deployment.

## Owner UAT thủ công

Owner tự nhập dữ liệu test qua UI và ghi nhận riêng các chứng từ được tạo trong
UAT. Counts trước UAT phải giữ nguyên so với gate release.

1. Mở POS, tìm và thêm hàng lần lượt bằng tên, SKU và barcode. Xác nhận mũi tên,
   `Enter`, `/` hoặc `F2`, `Escape` và `Ctrl/Cmd+Enter` hoạt động đúng; không dùng
   camera barcode.
2. Tạo giỏ mới, reload và xác nhận giỏ được phục hồi. Với draft server, xác nhận
   bản server thắng khi version local đã cũ.
3. Mở cùng giỏ ở hai tab: tab thứ hai phải chỉ đọc. Chọn **Tiếp tục ở tab này**,
   sau đó xác nhận tab cũ không còn ghi được.
4. Thanh toán một đơn test tiền mặt. Ứng dụng phải mở chi tiết hóa đơn nhưng
   không tự bật hộp thoại in.
5. Trên chi tiết hóa đơn, kiểm tra phần đối soát, chủ động mở print preview, tải
   PDF một lần và chọn **Đơn mới**.
6. Nếu có banner pending command, kiểm tra **Mã yêu cầu** tách biệt mã tra cứu và
   bấm **Đối soát lại**. Không tạo yêu cầu mới và không tự gửi lại command.
7. Trên danh sách hóa đơn, đặt `q` và `status`, reload/back để xác nhận URL giữ
   điều kiện; nhập đúng một mã hóa đơn và nhấn `Enter` để mở.

Chứng từ tài chính đã hoàn tất không được xóa row, sửa ledger hoặc “clear” trực
tiếp. Owner dùng command cancel/return/reverse hợp lệ khi cần, hoặc giữ dữ liệu
test đến P2.6.

## Rollback

- Frontend: dùng Vercel Instant Rollback về deployment Production tốt gần nhất.
- Database: không có thay đổi database trong P2.1 nên không có database rollback.
- Pending command: giữ nguyên marker và idempotency key khi outcome chưa rõ;
  chỉ tra cứu lại hoặc chủ động chạy lại action từ đúng chứng từ.
- Giỏ nhiều tab: không merge và không ghi đè âm thầm; takeover là hành động rõ
  ràng của người dùng.

Sau rollback, chạy lại public smoke. Owner chỉ thực hiện smoke đăng nhập đọc và
không tạo thêm giao dịch cho tới khi deployment ổn định.
