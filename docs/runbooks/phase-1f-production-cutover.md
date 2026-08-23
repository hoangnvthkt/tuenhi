# Runbook cutover Phase 1F-B

Chưa thực hiện tài liệu này nếu owner chưa mở Phase 1F-B.

1. Dừng toàn bộ runner tổng hợp, chạy `pnpm cutover:preflight`, sau đó chạy `pnpm cutover:cleanup-tests` ở chế độ dry-run. Chỉ khi owner duyệt danh sách mới chạy lại cùng lệnh với `--confirm` và xác nhận không còn profile/dữ liệu `codex-phase*`.
2. Tạo backup database bằng `pnpm cutover:backup` vào thư mục tuyệt đối ngoài repository, sao chép encrypted archive sang ổ ngoài; export riêng `product-images` bằng `pnpm cutover:export-images` khi cần. Kiểm manifest, checksum và `pg_restore --list` trước khi nhập dữ liệu thật.
3. Bật leaked-password protection trong Supabase Auth, smoke test login, đổi mật khẩu ban đầu và reset mật khẩu.
4. Owner nhập danh mục thật, ảnh, mở sổ tồn/cost; sau đó mới nhập dữ liệu cũ vào kho archive chỉ đọc.
5. Đối soát balance, movement, financial events và báo cáo; owner ký checklist UAT.
6. Chỉ sau quyết định riêng về Vercel mới tạo Preview/Production deployment. Không đưa service-role/secret vào bundle hoặc environment client. Sau phê duyệt go-live, chạy `CUTOVER_LIFECYCLE_ACTION=OWNER_PILOT pnpm cutover:lifecycle -- --cutover-at <ISO> --confirm`; tuyệt đối không chạy lại runner tổng hợp.
7. Trong 7 ngày pilot owner, không tạo nhân viên. Khi owner đã bật leaked-password protection và hoàn tất smoke test Auth, chạy `CUTOVER_LIFECYCLE_ACTION=AUTH_HARDENED pnpm cutover:lifecycle -- --confirm`, rồi `CUTOVER_LIFECYCLE_ACTION=PRODUCTION pnpm cutover:lifecycle -- --confirm`.
