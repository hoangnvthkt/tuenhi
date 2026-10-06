# Ảnh chứng từ chuyển khoản tùy chọn

Theo yêu cầu Owner, thanh toán hóa đơn và hoàn tiền trả hàng bằng chuyển khoản
được xác nhận khi không đính kèm ảnh. Vẫn cho phép tải/chụp ảnh tùy chọn; ảnh
được kiểm tra định dạng, dung lượng, quyền sở hữu và đường dẫn giao dịch như trước.

Migration `20261006105559_optional_transfer_proofs.sql` chỉ thay hai hàm private
bao quanh command hiện có. Không backfill, không thay bảng hay sửa dữ liệu cũ.
Không thay quyền hoàn tất, version, idempotency, số tiền, tồn kho hoặc sổ tài chính.
Ảnh chỉ được gắn sau command thành công; replay không xóa hoặc thay ảnh đã gắn.

## Xác minh

Chạy quality gate frontend theo README. Fixture hành vi chỉ dùng PostgreSQL
cục bộ rỗng, schema hiện hành và migration mới, qua Unix socket. Fixture từ chối
Cloud/TCP và database khác, dùng dữ liệu synthetic và rollback:

```sh
psql -X -h /absolute/local/socket -p 55459 -d payment_proof_test -v ON_ERROR_STOP=1 -f supabase/tests/isolated/optional_transfer_proofs.sql
```

Kiểm tra các trường hợp có/không có ảnh, ảnh không thuộc giao dịch/người dùng,
chứng từ không hợp lệ cho tiền mặt, replay không mất ảnh/không lặp tác động sổ.
`supabase/tests/optional_transfer_proofs_assertions.sql` là assertion cấu trúc
chỉ đọc cho release gate, không thay fixture hành vi.

## Phát hành

Review migration trước khi apply; xác nhận đúng project và dry run chỉ liệt kê
migration này. Sao lưu định nghĩa/quyền của hai hàm trước thay đổi. Áp dụng
migration trước khi merge/phát hành frontend để máy chủ chấp nhận ảnh tùy chọn.
Chạy assertion chỉ đọc, release gate Cloud, kiểm tra CI/public production smoke.
Không tạo giao dịch thử trên production. Client cũ vẫn dùng được.

Nếu cần quay lại, dùng migration mới phục hồi hai định nghĩa hàm trước đó và
rollback frontend; giữ toàn bộ dữ liệu và ảnh đã gắn.
