# Phase 2 Master Design — Controlled Development và Clean Go-live

Ngày: 2026-08-31

Trạng thái: Owner đã duyệt; P2.2 đã nghiệm thu, P2.3 đang triển khai

Liên quan:

- `docs/superpowers/specs/2026-08-21-internal-single-store-pos-design.md`
- `docs/reports/2026-08-28-phase-1f-b7-b8-production-stabilization.md`
- `docs/runbooks/phase-1f-b8-production-stabilization.md`

## 1. Bối cảnh và quyết định

Phase 1/MVP đã chạy trên Vercel và project Supabase Cloud Free hiện tại đã ở
lifecycle `PRODUCTION`. Owner xác nhận dữ liệu hiện có chỉ là dữ liệu test nhập
thủ công, chưa có dữ liệu vận hành thật và chưa cần tạo Staging.

Phase 2 dùng mô hình sau:

1. Tiếp tục phát triển và UAT trên project Supabase hiện tại.
2. Giữ lifecycle `PRODUCTION` để các Cloud runner, synthetic E2E và cleanup cũ
   tiếp tục bị khóa.
3. Owner chỉ nhập dữ liệu test thủ công qua giao diện; automation không tạo hoặc
   dọn dữ liệu trên Cloud.
4. Khi chuẩn bị vận hành thật, tạo project Supabase Free thứ hai hoàn toàn sạch,
   áp dụng toàn bộ migrations từ repository rồi chuyển Vercel Production sang
   project mới.
5. Không mặc định “clear toàn bộ” project hiện tại. Sau khi go-live và đối chiếu
   xong, project cũ trở thành môi trường test hoặc được pause.

Project hiện tại là môi trường **controlled development/UAT** về mục đích sử
dụng, dù lifecycle kỹ thuật vẫn là `PRODUCTION`. Không đổi lifecycle ngược lại
và không nới guard chỉ để chạy test tự động.

## 2. Mục tiêu Phase 2

- Tối ưu thao tác bán hàng, hóa đơn và các luồng hằng ngày mà không đổi công thức
  tài chính hiện hành.
- Hỗ trợ phát hiện hàng dưới ngưỡng tồn, truy vết biến động và chuẩn bị phiếu
  nhập nháp.
- Bổ sung lịch sử mua hàng của khách mà không thu thập dữ liệu nhạy cảm hoặc mở
  rộng sang công nợ/tích điểm.
- Nâng báo cáo từ đối soát đúng sang hỗ trợ quyết định theo kỳ, sản phẩm, nhóm,
  kênh và phương thức thanh toán.
- Tăng khả năng quản trị quyền, phiên đăng nhập và audit khi số nhân viên tăng.
- Tạo một Production sạch khi Owner bắt đầu dùng thật, không mang dữ liệu test
  hoặc cấu hình thử nghiệm sang môi trường mới.

## 3. Nguyên tắc kiến trúc

### 3.1 Database là nguồn quyết định

- Tồn kho, giá vốn, doanh thu, payment, return/cancel và audit tiếp tục được xử
  lý bằng transaction và authoritative ledgers trong PostgreSQL.
- Browser không ghi trực tiếp bảng nghiệp vụ; command đi qua RPC/Edge Function
  hiện hành với safe envelope, correlation ID, idempotency và expected version
  khi phù hợp.
- `security definer` chỉ nằm trong schema private, đặt `search_path = ''`; API
  wrapper exposed giữ quyền tối thiểu và không mở direct table grant.
- Mọi bảng trong schema exposed phải bật RLS. Quyền không dựa trên
  `user_metadata` do người dùng có thể sửa.

### 3.2 Thay đổi tương thích ngược

- Migrations Phase 2 mặc định là additive: thêm table/column/function/index hoặc
  version mới của read model trước khi xóa contract cũ.
- Database được triển khai trước, frontend tương thích cả contract cũ/mới được
  triển khai sau; cleanup schema chỉ ở release riêng khi không còn consumer cũ.
- Không đổi tên/xóa cột, rewrite ledger hoặc backfill tài chính trong cùng release
  với UI mới.
- Migration phải dừng transaction khi precondition không đạt; không tự sửa, làm
  tròn hoặc xóa dữ liệu test để “cho migration chạy”.

### 3.3 Ranh giới dữ liệu test

- Chỉ Owner tạo dữ liệu test bằng UI như một người dùng thật.
- Không chạy `test:cloud:*`, Cloud E2E tạo dữ liệu, `cutover:preflight`,
  `cutover:cleanup-tests` hoặc cleanup RPC cũ.
- Không nhập dữ liệu khách hàng thật, workbook thật, ảnh thật hoặc chứng từ thật
  vào project hiện tại trước go-live.
- Dữ liệu test không được copy sang Production sạch. Go-live chỉ chuyển schema,
  cấu hình đã duyệt và bootstrap Owner.

## 4. Chiến lược môi trường và phát hành

### 4.1 Trong thời gian Phase 2

- Supabase: một project hiện tại cho development/UAT có kiểm soát.
- Vercel Preview và Production có thể cùng dùng public URL/publishable key hiện
  tại trong giai đoạn này; không đưa secret/service-role vào browser.
- Mỗi increment triển khai theo thứ tự: local tests → migration review → Cloud
  additive migration → SQL assertions/lint/advisor → frontend deployment →
  blocking public smoke → Owner UAT.
- Vercel Deployment Check `Vercel - tuenhi: production-smoke` tiếp tục bắt buộc
  trước khi domain được cập nhật.

### 4.2 Khi Owner bắt đầu dùng thật

P2.6 tạo project Supabase Free thứ hai làm Production sạch:

1. Tạo project mới và giữ project hiện tại nguyên trạng để đối chiếu.
2. Áp dụng toàn bộ migrations theo đúng lịch sử repository lên database rỗng.
3. Xác minh migration list, RLS/grants, function signatures, DB lint/advisor,
   Realtime publications, Storage buckets/policies và Cron jobs.
4. Cấu hình Auth URL/redirect, Edge Function secrets và public publishable key;
   không sao chép secret bằng file trong repository.
5. Bootstrap đúng một Owner bằng quy trình bảo mật hiện hành.
6. Chạy SQL assertions, credential-free deployment smoke và authenticated
   read-only smoke; không tạo giao dịch test trên Production sạch.
7. Cập nhật Vercel Production environment variables, deploy qua blocking check
   rồi xác nhận domain trỏ project mới.
8. Owner nhập dữ liệu thật trực tiếp. Project cũ chỉ được pause sau khi xác nhận
   Production mới ổn định và không còn cần đối chiếu.

Không sao chép database, Auth users, Storage objects, command deduplication,
audit hoặc dữ liệu test từ project cũ sang project mới.

## 5. Các increment Phase 2

### P2.0 — Single-project Controlled Development

- Ghi rõ vai trò UAT của project hiện tại trong README/runbook.
- Thêm release checklist cho migration additive, feature compatibility và
  manual Owner UAT.
- Xác minh các script tạo/dọn dữ liệu tiếp tục fail closed ở lifecycle
  `PRODUCTION`.
- Không tạo Staging, không đổi Supabase plan và không đổi dữ liệu.

### P2.1 — Daily Workflow Productivity

- Tối ưu POS theo hướng keyboard-first và giảm số thao tác lặp lại.
- Tăng tốc tìm sản phẩm theo tên/SKU/mã vạch, nhưng chưa dùng camera scanner.
- Củng cố phục hồi giỏ nháp và trạng thái pending command khi reload/tab khác.
- Rút gọn thao tác tra cứu, in/tải và đối soát hóa đơn mà không thay đổi nghiệp
  vụ payment, return hoặc cancel.

### P2.2 — Connected Business Explorer

Trạng thái: Owner nghiệm thu ngày 2026-09-03.

- Biến chi tiết Sản phẩm và Nhà cung cấp thành Context Hub có KPI, lịch sử và
  drill-through tới Phiếu nhập.
- Quan hệ Sản phẩm–Nhà cung cấp chỉ suy ra từ phiếu nhập `POSTED`; không tạo
  bảng liên kết hoặc Nhà cung cấp chính.
- Deeplink tới POS và phiếu nhập chỉ điền sẵn ngữ cảnh, không tự tạo hoặc ghi
  chứng từ.
- Inventory Replenishment được hoãn sang increment sẽ được ưu tiên lại sau;
  không đổi số các increment còn lại trong tài liệu này.

### P2.3 — Customer Purchase History

Trạng thái: Owner đã duyệt design/spec ngày 2026-09-03; đang triển khai.

- Hiển thị lịch sử sale/return của khách từ chứng từ vận hành authoritative.
- Tổng hợp số đơn, lần mua gần nhất, doanh thu thuần và sản phẩm thường mua theo
  quyền server-side.
- Không thêm CCCD, ngày sinh, mạng xã hội, điểm, công nợ hoặc tổng bán nhập tay.
- Khách lẻ `customer_id = null` không được hợp nhất thành hồ sơ giả.

### P2.4 — Management Insights

- So sánh kỳ hiện tại với kỳ trước theo múi giờ `Asia/Ho_Chi_Minh`.
- Xu hướng sản phẩm, nhóm, kênh và phương thức thanh toán từ financial-event
  ledger/snapshots hiện hành.
- Hàng bán chậm và biến động tồn chỉ là read model hỗ trợ quyết định, không phát
  sinh command tự động.
- Giá vốn, lợi nhuận và định giá tồn tiếp tục owner-only, không persist vào
  localStorage, IndexedDB hoặc PWA runtime cache.

### P2.5 — Security và Administration

- Rà phiên đăng nhập, quy trình reset/revoke và ảnh hưởng của JWT chưa refresh.
- Thêm audit viewer/export có filter server-side, pagination và quyền Owner.
- Rà lại quyền nhân viên theo least privilege và cảnh báo tài khoản lâu không
  hoạt động.
- `OWNER_WAIVER` tiếp tục được ghi rõ khi dùng Supabase Free; không tuyên bố
  leaked-password protection nếu tính năng chưa được bật thật.

### P2.6 — Clean Production Go-live

- Tạo project Free thứ hai sạch theo quy trình ở mục 4.2.
- Rehearse migration trên database rỗng và lập manifest cấu hình môi trường.
- Chuyển Vercel Production qua deployment gate, chạy smoke và Owner UAT chỉ đọc.
- Không “reset in place” project cũ trong luồng mặc định.

Mỗi increment có spec và implementation plan riêng. Không triển khai toàn bộ
Phase 2 bằng một branch hoặc một migration lớn.

## 6. Testing và release gate

### 6.1 Trước migration Cloud

- TDD cho business rule, DTO/parser và UI state.
- `pnpm check`, production-build verifier và `git diff --check` phải đạt.
- Migration được tạo bằng Supabase CLI, review SQL và kiểm tra precondition chỉ
  đọc đối với dữ liệu hiện có.
- Khi thay đổi RLS/function/storage, bổ sung SQL assertions cho grants, actor
  isolation, private boundary và negative access.

### 6.2 Sau migration Cloud

- Migration history local/remote phải khớp.
- Chạy SQL assertions chỉ đọc, DB lint và advisor.
- Chỉ manual Owner UAT bằng dữ liệu test do Owner nhập; automation không tạo dữ
  liệu Cloud.
- Public production smoke chạy trên deployment URL mobile/desktop trước
  promotion; authenticated smoke sau promotion chỉ đọc trừ khi Owner đang UAT
  chính luồng mới.

### 6.3 Rollback

- Frontend rollback dùng Vercel Instant Rollback về deployment tương thích gần
  nhất.
- Database rollback dựa trên expand/contract: release cũ vẫn chạy được với
  schema additive; không dùng down migration phá dữ liệu tài chính.
- Nếu migration fail, dừng release và giữ frontend cũ. Không chỉnh SQL trực tiếp
  để bỏ qua assertion hoặc permission failure.

## 7. Error handling và outcome unknown

- Các command tài chính tiếp tục dùng shared financial-command executor và cùng
  idempotency key khi retry.
- Request ID và correlation ID là hai mã riêng; UI không đánh đồng.
- Render/lazy-route errors chỉ hiển thị thông báo tiếng Việt an toàn, không lộ
  raw Supabase/Postgres error hoặc dữ liệu nội bộ.
- Không thêm Sentry, Analytics hoặc external telemetry. Điều tra dùng Vercel,
  Supabase logs, audit và correlation ID hiện có.

## 8. Không thuộc Phase 2

- Quét mã vạch bằng camera.
- Đa cửa hàng, đa kho hoặc luân chuyển kho.
- Công nợ, bán thiếu, trả góp hoặc công nợ nhà cung cấp.
- Lô, hạn dùng, serial, IMEI hoặc vị trí kệ.
- Tích điểm, voucher, hoa hồng hoặc khuyến mãi phức tạp.
- Hóa đơn điện tử, thuế hoặc kế toán đầy đủ.
- Hoàn tất giao dịch khi offline.
- Website bán hàng, tài khoản khách hàng, giao vận hoặc đồng bộ sàn.
- Tự động nhập, backup, xóa hoặc chuyển dữ liệu vận hành của Owner.

## 9. Tiêu chí hoàn thành Phase 2

Phase 2 chỉ được đóng khi:

1. Mỗi increment được nghiệm thu độc lập và không phá invariant Phase 1.
2. Toàn bộ migrations dựng được một database sạch từ đầu và history khớp.
3. RLS/grants/private functions qua SQL assertions và negative tests.
4. Tồn, ledger, payment, return/cancel và báo cáo tiếp tục reconciliation đúng.
5. Public smoke và Owner UAT mobile/desktop đạt cho từng release.
6. Project Production sạch được bootstrap, cấu hình và chuyển domain thành công.
7. Không có dữ liệu test, Auth user test hoặc Storage object test trong project
   Production sạch.
8. Project cũ được ghi rõ trạng thái test/paused; không bị nhầm là nguồn dữ liệu
   vận hành.

## 10. Tài liệu Supabase cần kiểm tra lại trước khi triển khai

Supabase thay đổi thường xuyên. Trước từng increment phải kiểm tra tài liệu chính
thức hiện hành cho phần được dùng, đặc biệt:

- Free Plan project limits và project pausing.
- Database migrations/deployment workflow.
- Row Level Security và Data API grants.
- Auth session/revocation semantics.
- Storage access control và private buckets.
- Realtime publications và Edge Function secrets.
