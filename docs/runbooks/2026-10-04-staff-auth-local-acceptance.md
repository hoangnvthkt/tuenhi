# Nghiệm thu nhân viên bằng Supabase local — 04/10/2026

Production vẫn giữ 15 mục audit đã phát hành ở commit e9d8bc2; 56 migration. PR #4 tiếp tục draft theo chỉ đạo mới nhất: Owner hiện chỉ dùng tài khoản admin, chưa có nhân viên thật để UAT. Không áp dụng migration R8 hoặc deploy Edge lên Cloud trong đợt này.

Đã chạy actual local Supabase Auth, Edge Functions và PostgreSQL từ 57 migration (gồm R8). Dữ liệu giả chỉ nằm trong local stack riêng. Runner không nạp `.env` ứng dụng; chỉ nhận status JSON local, URL loopback port55321, từ chối redirect, kiểm DB container/fixture trống trước tạo tài khoản.

Kết quả API integration:

- Owner tạo nhân viên kho: một Auth user và một profile.
- Lần đầu bắt đổi mật khẩu; đổi qua Edge rồi đăng nhập bằng mật khẩu mới.
- Quyền của kho đúng `catalog.read`, `inventory.read`; gọi catalog được, quản trị nhân viên bị từ chối.
- Khóa: đăng nhập mới thất bại, JWT đang giữ không đọc được session context hoặc catalog.
- Mở lại: đăng nhập được, role giữ nguyên, không tạo thêm Auth user.

Chạy guard: `node --test scripts/staff-auth-local-target.test.mjs`.

Chạy integration: đặt `TUENHI_LOCAL_STATUS_FILE` tới JSON trả từ CLI status của stack riêng và `TUENHI_LOCAL_DB_CONTAINER` tới container PostgreSQL local đã xác minh, rồi `node scripts/test-staff-auth-local.mjs`. Runner yêu cầu DB local mới/trống, giữ dữ liệu test để kiểm tra sau chạy; chỉ reset lại local stack riêng khi cần chạy lại. Không chạy runner với cấu hình ứng dụng production.

Chưa nghiệm thu UI tạo nhân viên đầu-cuối bằng browser, email/redirect Cloud, iPhone hoặc Auth production. Các ca lỗi phục hồi vẫn có handler/SQL tests từ PR #4; không coi API happy path thay cho fault injection hoặc UI UAT.

Các chỉ số trong tài liệu ngày03/10 nói 54 migration hoặc ba migration còn chờ là mốc cũ. Hiện chỉ migration R8 của PR #4 chưa phát hành; dry-run phải kiểm lại đúng tên migration trước release.
