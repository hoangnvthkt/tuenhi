# Runbook Phase 1F-B3 — Owner pilot và baseline backup

Chỉ thực hiện khi Owner đã duyệt UAT Preview. Không nhập workbook cũ, không tạo nhân viên, không merge `main` hoặc deploy Production trong runbook này.

1. Khi lifecycle vẫn là `PRE_PRODUCTION`, dừng toàn bộ runner tổng hợp và chạy `pnpm cutover:preflight`. Nếu có dữ liệu `codex-phase*`, chạy `pnpm cutover:cleanup-tests` ở dry-run; Owner duyệt danh sách chính xác trước khi chạy lại với `--confirm`. Xác nhận Cloud có đúng một Owner, không có dữ liệu vận hành/test và không có chứng từ chờ.
2. Ghi thời điểm chốt theo `Asia/Ho_Chi_Minh`, đổi sang ISO UTC, rồi chạy `CUTOVER_LIFECYCLE_ACTION=OWNER_PILOT pnpm cutover:lifecycle -- --cutover-at <ISO-UTC> --confirm`. Xác nhận bằng `pnpm cutover:verify`. Đây là điểm khóa runner: không chạy lại preflight, cleanup hoặc Cloud runner sau đó.
3. Owner smoke test Preview: đăng nhập, đổi/reset mật khẩu, logout/login và thử tạo nhân viên. Tạo nhân viên phải bị chặn với `PRODUCTION_AUTH_HARDENING_REQUIRED`.
4. Owner nhập trực tiếp: cài đặt/kênh bán → nhóm hàng → nhà cung cấp → sản phẩm, giá và ngưỡng tồn → khách hàng → ảnh. Đối soát SKU, barcode, số ảnh và dữ liệu hiển thị.
5. Tạo baseline 1 bằng `pnpm cutover:backup` và export độc lập ảnh bằng `pnpm cutover:export-images`. `CUTOVER_BACKUP_DIR` và `CUTOVER_IMAGE_EXPORT_DIR` phải là thư mục tuyệt đối ngoài repository. Passphrase chỉ được nhập tại terminal tương tác, không truyền qua chat, biến môi trường, CLI argument hay log.
6. Mỗi lệnh tạo archive AES-256, receipt SHA-256 và manifest nằm trong archive; plaintext staging được xóa cả khi lỗi. Với từng archive trên máy và bản sao ở ổ ngoài, chạy `pnpm cutover:verify-backup -- --archive <file.enc> --receipt <file.receipt.json> --confirm`. Lệnh kiểm receipt, giải mã tạm, manifest/SHA-256 từng ảnh và `pg_restore --list` nếu có dump, rồi xóa dữ liệu giải mã.
7. Owner tạo và ghi sổ mở sổ tồn/giá vốn qua ứng dụng. Đối soát SKU, quantity, inventory valuation và opening movements. Trước bán thật, financial events, revenue và profit report phải bằng 0.
8. Tạo và xác minh baseline 2 trên máy cùng ổ ngoài. Owner ký xác nhận đối soát trước giao dịch bán đầu tiên.

Trong pilot tối đa 7 ngày chỉ Owner dùng ứng dụng. Nếu có lỗi trước giao dịch bán đầu tiên, dừng thao tác và chỉ restore baseline sau phê duyệt Owner; sau giao dịch đầu tiên chỉ dùng command nghiệp vụ để điều chỉnh. Auth hardening, tạo nhân viên, merge `main` và deploy Production cần phê duyệt/phase riêng.
