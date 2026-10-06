# Công nợ khách hàng và thanh toán kết hợp

## Yêu cầu và tiêu chí

Owner yêu cầu nợ theo mã khách, thanh toán một đơn bằng cả tiền mặt/chuyển khoản
và để lại phần chưa trả; sau đó ghi nhận khách trả nợ. Owner xác nhận cần thêm
nhập nợ cũ/chỉnh số dư thủ công, có lý do.

KH01: đơn 100.000đ, chuyển khoản 50.000đ, tiền mặt 30.000đ tạo nợ 20.000đ.
Thu nợ 20.000đ làm số dư KH01 bằng 0. Không xóa hóa đơn hay lịch sử thu tiền.
Mua thêm tích lũy đúng khách; khách khác không bị ảnh hưởng.

## Quy tắc nghiệp vụ

- Liên kết bằng customer UUID ổn định, hiển thị/tìm theo mã. Cho nợ cần khách
  đang hoạt động và có mã; khách lẻ vẫn được thanh toán kết hợp nếu trả đủ.
- POS thêm lựa chọn “Kết hợp / Ghi nợ”, nhập tiền mặt và chuyển khoản. Tự tính
  đã trả và còn nợ; không nhận số âm, sai định dạng, quá tổng đơn hoặc quá 2
  chữ số thập phân. Ảnh chuyển khoản tùy chọn như luồng hiện có.
- Thu nợ nhập tiền mặt/chuyển khoản, không quá số dư hiện tại. Phân bổ vào
  hóa đơn còn nợ theo thứ tự cũ nhất, rồi nợ nhập/chỉnh thủ công.
- Chỉnh số dư nhập số nợ mới không âm và lý do bắt buộc. Tăng tạo khoản nợ
  thủ công; giảm phân bổ vào nợ thủ công trước, rồi hóa đơn cũ nhất. Điều chỉnh
  không được tính là tiền đã thu.
- Trả hàng cấn trừ phần chưa thanh toán/đã giảm nợ của hóa đơn trước; chỉ phần
  còn lại là tiền thực hoàn. Hủy đơn xóa phần nợ còn lại của đơn bằng bút toán
  đối ứng, vẫn đảo thanh toán/stock/revenue theo command hiện có.
- Hóa đơn/phiếu in hiển thị tiền mặt, chuyển khoản, đã thu, nợ ban đầu, còn nợ
  và phần chỉnh/cấn trừ nếu có. Báo cáo doanh thu vẫn ghi doanh thu hàng bán;
  thu nợ không tạo doanh thu mới. Phân loại phương thức nhận biết kết hợp/nợ.
- Mặc định chủ cửa hàng xem/thu/chỉnh toàn bộ nợ; dùng permission riêng để
  cấp thêm xem/thu cho nhân viên nếu cần. Chỉnh số dư chỉ chủ cửa hàng.

## Dữ liệu và command

Bảng private RLS force: customer_debt_accounts (số dư/version/nợ thủ công),
sale_payment_allocations (tiền thực thu, nợ hóa đơn, điều chỉnh và cấn trừ),
customer_debt_entries (lịch sử bất biến, lý do, actor, delta/số dư sau),
customer_debt_allocations (phân bổ thu/chỉnh theo hóa đơn).

Giữ api.payments một hàng/hóa đơn để tương thích mọi join hiện có. Amount là
thực thu; method cũ là phương thức chính để client cũ không lỗi. DTO mới thêm
phân rã đúng tiền mặt/chuyển khoản/nợ; phân loại báo cáo đọc phân rã này.

RPC complete_sale_with_allocations gọi command hoàn tất cũ trong cùng
transaction, sau đó ghi phân rã và nợ. Cache/idempotency dùng sale.complete,
replay không ghi lại hoặc sửa số tiền. Lệch payload cùng key bị từ chối.
RPC get_customer_debt và list_customer_debt_entries chỉ đọc theo quyền;
collect_customer_debt và adjust_customer_debt dùng expectedVersion/key,
khóa theo customer rồi theo hóa đơn, audit và cache nguyên tử.

Giữ api RPC security invoker, triển khai private security definer search_path
rỗng. Table không cấp direct privileges cho browser. Thêm hai tên command vào
pending-command và outcome resolver; khi chưa rõ kết quả phải đối soát bằng
key cũ trước khi nhận khoản thu/chỉnh mới.

## Kiểm chứng và phát hành

Không tạo dữ liệu thử trên Cloud. Fixture synthetic trên PostgreSQL Unix
socket cô lập, rollback; kiểm tra ví dụ KH01, nhiều đơn/khách, chỉnh có lý do,
trả hàng/hủy, replay, tranh chấp version, quyền, input bất thường và rollback.
Frontend kiểm thử UI/API/hook/numeric và full quality gate; review độc lập
trước merge. Backup/schema review, dry-run đúng migration, apply DB trước
frontend, assertions/read-only Cloud gate, CI và public smoke.
