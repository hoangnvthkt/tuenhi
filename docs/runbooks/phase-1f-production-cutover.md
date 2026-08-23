# Runbook cutover Phase 1F-B

Chưa thực hiện tài liệu này nếu owner chưa mở Phase 1F-B.

1. Dừng toàn bộ runner tổng hợp và xác nhận cleanup không còn profile/dữ liệu `codex-phase*`.
2. Tạo backup database và xuất riêng danh sách/object bucket `product-images`; kiểm tra khả năng phục hồi trước khi nhập dữ liệu thật.
3. Bật leaked-password protection trong Supabase Auth, smoke test login, đổi mật khẩu ban đầu và reset mật khẩu.
4. Owner nhập danh mục thật, ảnh, mở sổ tồn/cost; sau đó mới nhập dữ liệu cũ vào kho archive chỉ đọc.
5. Đối soát balance, movement, financial events và báo cáo; owner ký checklist UAT.
6. Chỉ sau quyết định riêng về Vercel mới tạo Preview/Production deployment. Không đưa service-role/secret vào bundle hoặc environment client.
