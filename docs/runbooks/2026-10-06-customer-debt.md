# Công nợ khách hàng

Ở quầy bán hàng, chọn khách có mã rồi chọn **Kết hợp / Ghi nợ**. Nhập tiền mặt
và chuyển khoản; số chưa trả trở thành nợ của khách. Ví dụ KH01 mua 100.000đ,
trả tiền mặt 30.000đ và chuyển khoản 50.000đ thì nợ 20.000đ. Ảnh chuyển khoản
vẫn tùy chọn. Không cho ghi nợ khách vãng lai hoặc khách chưa có mã.

Vào **Nhiều hơn → Khách hàng → chọn KH01 → Công nợ**:

- **Thu nợ**: nhập tiền mặt/chuyển khoản thực nhận. Thu đủ 20.000đ thì số dư
  bằng 0; thu một phần giảm nợ tương ứng. Không nhận vượt số dư.
- **Chỉnh số dư nợ**: nhập số dư mới và lý do bắt buộc, dùng cho nợ cũ hoặc
  điều chỉnh. Giảm nợ bằng thao tác này không ghi nhận tiền khách trả.
- Lịch sử giữ số tiền thay đổi, số dư sau thao tác, người thực hiện và lý do.
  Thu/điều chỉnh không xóa lịch sử cũ. Thu nợ phân bổ vào hóa đơn cũ trước;
  chỉnh giảm phân bổ vào nợ nhập thủ công trước, rồi hóa đơn cũ.

Quyền đọc/thu nợ mặc định chỉ Owner có; Owner có thể cấp riêng cho nhân viên
qua quyền `customer.debt.read` và `customer.debt.collect`. Chỉnh số dư là quyền
Owner. Hóa đơn cá nhân chỉ hiển thị nợ của hóa đơn đó, không lộ tổng nợ khách.

Trả hàng cấn trừ phần chưa trả hoặc đã chỉnh giảm của chính hóa đơn trước;
phần còn lại mới thực hoàn tiền. Hủy hóa đơn đủ điều kiện xóa phần nợ còn lại.
Hóa đơn/in nhiệt/PDF thể hiện tiền đã thu, nợ ban đầu, nợ còn lại và khoản cấn
trừ/điều chỉnh. Hóa đơn cũ giữ cách thanh toán đầy đủ, không tự tạo nợ hồi tố.
Tiền thu từ nợ nhập thủ công có trong lịch sử công nợ; không tạo doanh thu hóa
đơn mới. Khi mất mạng hoặc chưa rõ kết quả, đối soát yêu cầu cũ trước khi thu mới.

## Xác minh và phát hành

Migration `20261006111449_customer_debt.sql` thêm sổ private, FORCE RLS và RPC
có quyền, version, idempotency hash. Không backfill hay sửa hàng dữ liệu cũ.
Review, sao lưu định nghĩa/quyền các hàm bị thay, xác nhận project và dry run
chỉ có migration này. Apply DB trước frontend; regenerate API types; chạy
assertion chỉ đọc `supabase/tests/customer_debt_assertions.sql`, release gate
Cloud, CI và public production smoke. Không tạo giao dịch thử trên Cloud.

Fixture chỉ chạy PostgreSQL 17 rỗng, không TCP, schema hiện hành và migration,
không dùng Supabase local/Docker. Recreate schema USAGE nếu dump bỏ ACL;
giữ function grants của migration để kiểm thử invoker với role authenticated.

```sh
psql -X -h /tmp/tuenhi-customer-debt-.../socket -p 55469 -d customer_debt_test -v ON_ERROR_STOP=1 -f supabase/tests/isolated/customer_debt.sql
python3 supabase/tests/isolated/customer_debt_concurrency.py --socket /tmp/tuenhi-customer-debt-.../socket --port 55469
```

Fixture SQL rollback. Runner đồng thời yêu cầu database rỗng và giữ dữ liệu
synthetic trong database dùng một lần để kiểm tra; xóa database/cluster đó sau.
Kiểm tra KH01, nhiều khách, FIFO, nợ cũ, lý do, replay/payload khác, tiền sai,
version cũ, trả hàng/cấn trừ, hủy, authenticated quyền thật, thu đồng thời và
thu cùng lúc trả hàng. Test browser local chặn mọi HTTP ngoài localhost.

Tổng deploy assets tăng lên khoảng 4,20 MB khi thêm công nợ; allowance tổng
được tăng 32 KiB lên 4 MiB + 32 KiB. Giữ nguyên giới hạn tải đầu JavaScript
220 KiB gzip, CSS 12 KiB gzip, kiểm tra secret và PWA. Không đổi cấu hình
minifier hay bỏ tính năng để vượt gate. Test kiểm tra vẫn từ chối vượt allowance.

Nếu rollback frontend, giữ sổ và dữ liệu đã ghi; client cũ vẫn thanh toán đủ.
Không rollback migration bằng cách xóa bảng công nợ. Mọi sửa hàm sau phát hành
dùng migration mới, giữ lịch sử và đối soát số dư trước khi thay đổi.
