# Phase 1F-B7/B8 — Production stabilization report

Ngày kiểm tra: 2026-08-28 (`Asia/Ho_Chi_Minh`)

## Trạng thái release

| Gate                             | Trạng thái    | Bằng chứng                                                                   |
| -------------------------------- | ------------- | ---------------------------------------------------------------------------- |
| Baseline quality                 | Đạt           | `pnpm check`: 75 files, 304 tests trước B8; build đạt                        |
| B8 quality                       | Đạt           | `pnpm check`: 84 files, 339 tests; production build verifier đạt             |
| Migration B8                     | Đã apply      | outcome RPC + volatility metadata fix; local/remote `46/46`                  |
| SQL security assertions          | Đạt           | grant, security definer, actor scope, exact allowlist, private-table denial  |
| DB lint                          | Đạt           | linked database: `No schema errors found`                                    |
| Security advisor                 | Đạt có waiver | không có error; còn warning leaked-password protection theo `OWNER_WAIVER`   |
| Performance advisor              | Đạt           | không có error/warning                                                       |
| Public Production smoke trước B8 | Đạt           | mobile + desktop trên `https://tuenhi.vercel.app`                            |
| Authenticated Owner smoke        | Đạt           | 5 route chỉ-đọc tải xong, không lỗi; không tạo giao dịch                     |
| Lifecycle `PRODUCTION`           | Đạt           | Chuyển lúc `2026-08-28T09:21:01.416658Z`; policy/counts không đổi            |
| Blocking Deployment Check        | Đã bật        | GitHub check `Vercel - tuenhi: production-smoke`, chỉ chặn Production        |
| B8 deployment URL smoke          | Đạt           | mobile + desktop, credential-free, trên deployment của `main`                |
| Gate promotion verification      | Đạt           | `60c8d3c` giữ `Staged` khi check chạy, chỉ thành `Current` sau khi check đạt |
| Public smoke sau promotion       | Đạt           | `2/2` mobile + desktop trên `https://tuenhi.vercel.app`                      |
| Owner smoke sau promotion        | Đạt           | 5 route chỉ đọc, đúng heading, không hiển thị lỗi an toàn                    |

## Baseline Cloud trước lifecycle transition

- Lifecycle trước chuyển đổi: `OWNER_PILOT`
- Lifecycle sau chuyển đổi: `PRODUCTION`
- Staff access policy: `OWNER_WAIVER`
- Auth hardening: chưa ghi nhận
- Business counts:
  - profiles/categories/suppliers/customers/products/product images/inventory
    balances: mỗi bảng `1`;
  - inventory movements, sales, returns, stock counts, import runs và legacy
    sales: `0`.
- Cloud runner đang khóa với `PRODUCTION_TEST_DATA_FORBIDDEN`.

Không tạo giao dịch thử, không nhập/backup/cutover dữ liệu và không chạy Cloud
runner sau Owner Pilot.

## B8 đã triển khai trong source

- `api.get_my_command_outcome` chỉ cho `authenticated`, exact allowlist bảy lệnh,
  actor isolation và không mở direct table grant.
- Shared financial executor lưu marker tối thiểu theo khóa riêng cho mỗi
  user/command/entity, khóa liên-tab bằng Web Locks, lookup theo lịch 0/1/3 giây,
  parse response cache qua schema gốc, retry đúng một lần bằng key cũ và giữ
  “Mã yêu cầu” nếu outcome vẫn unknown. Nếu marker không thể ghi và đọc lại,
  command không được gửi.
- Thanh toán có marker cũ được đối soát trước `saveDraft`; chứng từ chỉ upload
  khi executor thực sự phải gửi lại command.
- Tích hợp vào thanh toán, hủy hóa đơn, hoàn tất trả hàng, ghi/đảo phiếu nhập,
  ghi kiểm kho và mở sổ.
- App error boundary và router error page không render raw error.
- Production build verifier và Playwright credential-free smoke được gắn vào
  quality/release path; không thêm telemetry.
- Fresh build trên `main`: initial JavaScript gzip `195764` bytes, initial CSS
  gzip `7601` bytes, tổng deploy assets `3625895` bytes; XLSX/ExcelJS/PDF có
  chunk ổn định và không được preload trong app shell.

## Release gate đã cấu hình

- Source B8 đã fast-forward/push lên `main`.
- Workflow nhận `vercel.deployment.ready`, lọc đúng project `tuenhi`, môi trường
  Production và `main`; vẫn giữ `workflow_dispatch` để chạy thủ công.
- Vercel đã import check cố định `Vercel - tuenhi: production-smoke` và đặt hành
  vi Production, nên deployment mới chỉ được cập nhật domain sau khi smoke đạt.
- Deployment URL của B8 đã vượt qua smoke mobile và desktop sau khi tắt lớp
  Vercel Authentication; đăng nhập ứng dụng vẫn do Supabase Auth bảo vệ.
- Commit `60c8d3c` đã xác minh gate sau cấu hình: Vercel giữ deployment ở trạng
  thái `Staged / Running Checks`; workflow repository dispatch đạt `2/2` smoke,
  sau đó Vercel mới gán domain Production và chuyển deployment thành `Current`.
- Public smoke và Owner smoke chỉ đọc đều đã được chạy lại sau promotion; không
  tạo giao dịch hoặc thay đổi dữ liệu nghiệp vụ.

Không chạy Cloud runner hoặc E2E tạo dữ liệu sau khi lifecycle là `PRODUCTION`.
