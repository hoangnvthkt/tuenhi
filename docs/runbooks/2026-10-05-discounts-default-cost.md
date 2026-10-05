# Giảm giá POS và giá vốn mặc định

## Phạm vi

- Sửa giới hạn ô Giảm dòng/Giảm toàn đơn đúng `numeric(20,2)`; “Giảm dòng” là số tiền giảm cho **cả dòng**, không nhân thêm theo số lượng.
- Ví dụ: 1 × 55.000đ − 1.000đ = 54.000đ; 2 × 55.000đ − 1.000đ − 500đ toàn đơn = 108.500đ.
- Thêm Giá vốn mặc định khi tạo/sửa sản phẩm, hiển thị trong chi tiết. Tùy chọn, lớn hơn 0, tối đa 2 chữ số thập phân; xóa giá bằng cách để trống.
- Điền sẵn đơn giá khi chọn sản phẩm hoặc mở Nhập hàng từ sản phẩm. Người dùng có thể sửa theo phiếu; chọn lại cùng sản phẩm giữ giá đã sửa; đổi sản phẩm lấy giá của sản phẩm mới (hoặc để trống). Không thay đổi giá trong phiếu cũ hay ghi đè giá nhập Excel.
- Giá mặc định tách riêng khỏi bình quân giá vốn, tồn kho và báo cáo tài chính. Số lượng nhập sau, theo xác nhận của người dùng.

## Dữ liệu và quyền

Hai migration: `20261005034613_product_default_cost` và `20261005035448_sale_discount_validation`.

Giá mặc định nằm trong `app_private`, RLS bật/force, không cấp quyền trực tiếp cho anon/authenticated. DTO danh mục/chi tiết chỉ trả giá cho `purchase.cost.read`; quyền này hiện chỉ dành cho chủ cửa hàng. Thay đổi giá cần thêm `purchase.cost.enter` và quyền sửa sản phẩm. Cập nhật sản phẩm/giá mặc định dùng chung transaction, version và idempotency key. Client cũ không gửi trường mới sẽ giữ nguyên giá. Nhật ký chỉ lưu việc đổi/có giá, không đưa giá vốn vào nhật ký chung.

Giảm giá không hợp lệ trả business error; lỗi sau khi bắt đầu ghi phải rollback toàn bộ command. Đã bổ sung xử lý cho lỗi giảm giá vượt dòng, vượt đơn và không có quyền giảm giá.

## Kiểm thử

Chạy frontend bằng `pnpm check`; browser cục bộ bằng `node node_modules/@playwright/test/cli.js test --config playwright.pos-local.config.ts`.

Kiểm thử SQL **chỉ** chạy trên PostgreSQL cục bộ, database rỗng tên `default_cost_test`, schema hiện hành và migrations mới đã áp dụng; không sao chép rows production. Fixture dùng synthetic users/products và rollback toàn bộ. Runner từ chối tên database khác:

```sh
psql -X -h /absolute/local/socket -p 55449 -d default_cost_test -v ON_ERROR_STOP=1 -f supabase/tests/isolated/product-default-cost.sql
```

`supabase/tests/product_default_cost_assertions.sql` là kiểm tra cấu trúc chỉ đọc dành cho release gate; không thay thế fixture hành vi cục bộ.

## Phát hành

Sao lưu được mã hóa trước migration, xác nhận đúng project và chỉ có hai migration này pending. Áp dụng database trước frontend; hai thay đổi tương thích client cũ. Kiểm tra số lượng/digest dữ liệu nghiệp vụ trước/sau, assertions chỉ đọc, CI và public production smoke sau triển khai. Không đưa PR nhân viên #4 vào đợt này.

Nếu cần quay lại giao diện trước, rollback Vercel deployment; giữ migration cộng thêm và giá đã nhập, không xóa dữ liệu giá vốn. Mọi thay đổi tiếp theo dùng migration mới.

Giới hạn: browser tự động là Chromium; chưa nghiệm thu iPhone/PWA/máy in thật. Không tạo giao dịch thử trong production.
