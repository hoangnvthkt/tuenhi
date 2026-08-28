# Runbook Phase 1F-B7/B8 — Production stabilization

## Phạm vi

Runbook này chỉ khép B7 và release B8: chuyển lifecycle sau authenticated
read-only smoke, outcome recovery cho bảy lệnh tài chính, build guard và blocking
Production smoke. Không quét mã vạch, nhập/backup dữ liệu, tạo dữ liệu test,
telemetry ngoài hoặc tính năng nghiệp vụ mới.

## Gate trước lifecycle `PRODUCTION`

1. Chạy `pnpm check` và `pnpm cloud:verify:phase1f` khi project còn cho phép.
2. Kiểm tra migration list, DB lint/advisor và `pnpm cutover:verify` ở chế độ chỉ
   đọc; ghi lại lifecycle, policy và toàn bộ business counts.
3. Owner đăng nhập `https://tuenhi.vercel.app` và chỉ đọc các route Tổng quan,
   Hàng hóa, Báo cáo, Định giá tồn và Nhân viên. Không tạo giao dịch thử.
4. Chỉ sau khi smoke đạt, chạy:

   ```bash
   CUTOVER_LIFECYCLE_ACTION=PRODUCTION pnpm cutover:lifecycle -- --confirm
   ```

5. Chạy lại `pnpm cutover:verify`: lifecycle phải là `PRODUCTION`, policy vẫn
   `OWNER_WAIVER`, business counts không đổi và Cloud runner tiếp tục bị khóa.

Sau bước 4 không chạy `test:cloud:*`, Cloud E2E tạo dữ liệu, preflight, cleanup
hoặc runner tổng hợp.

## Release B8

Thứ tự bắt buộc:

1. Apply additive migration outcome RPC; xác minh migration list, SQL assertions,
   lint/advisor và lookup một key không tồn tại trong phiên Owner.
2. Chạy `pnpm check` và `pnpm test:e2e:production` với deployment URL.
3. Workflow trên `main` phải phát đúng status
   `Vercel - tuenhi: production-smoke` cho event `vercel.deployment.ready` của
   `tuenhi`/`production`/`main`.
4. Trong Vercel Project Settings → Production → Deployment Checks, thêm status
   trên làm check bắt buộc. Giữ automatic aliasing bật.
5. Chỉ promote/cập nhật domain khi mobile và desktop smoke đều đạt. Sau promotion,
   Owner chạy lại authenticated read-only smoke.

Nếu build mới thất bại, không force-promote. Nếu lỗi chỉ phát hiện sau promotion,
dùng Vercel Instant Rollback về deployment Production tốt gần nhất, sau đó giữ
deployment lỗi ngoài domain để điều tra.

## Đối soát outcome unknown

Khi UI hiển thị “Mã yêu cầu”, không tạo lại chứng từ hoặc bấm lệnh bằng một key
mới. Ghi nhận user, command, entity và mã yêu cầu; tải lại ứng dụng để executor
tái dùng marker. Mỗi marker có khóa riêng theo user/command/entity và executor
dùng Web Locks để tránh hai tab ghi đè cùng giao dịch. `localStorage` chỉ chứa
user ID, command, entity ID, idempotency key và thời điểm, không chứa tiền, giá
vốn, khách hàng hay payload chứng từ. “Mã yêu cầu” là idempotency key; “Mã tra
cứu” là correlation ID của response và phải được ghi riêng.

## Quality và rollback compatibility

- `pnpm build` fail nếu initial JS gzip > 220 KiB, initial CSS gzip > 12 KiB,
  deploy assets > 4 MiB, thiếu PWA assets, phát hiện secret material hoặc preload
  XLSX/ExcelJS/PDF. Ba thư viện tài liệu có chunk name ổn định để eager import
  không thể ẩn dưới filename generic.
- Migration B8 chỉ thêm function/grant. Frontend cũ không gọi RPC mới nên vẫn
  tương thích khi rollback Vercel.
- Không thêm Sentry, Analytics, Supabase telemetry table hoặc runtime cache cho
  Auth/API/Storage/reporting.
