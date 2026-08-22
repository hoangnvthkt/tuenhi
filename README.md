# Tuệ Nhi — Bán hàng & Kho

## Phạm vi sản phẩm

Tuệ Nhi là ứng dụng nội bộ cho một cửa hàng và một kho logic duy nhất. Giai đoạn nền tảng không theo dõi lô hàng hoặc hạn sử dụng.

## Yêu cầu

Cần Node.js 24.13.1 và pnpm 11.19.0.

## Lệnh frontend cục bộ

```bash
pnpm install
pnpm dev
pnpm check
pnpm check:full
```

`pnpm check:full` là quality gate frontend đầy đủ trong một lệnh. `pnpm test:e2e` chạy trên bản production đã build và cần bộ tài khoản kiểm thử Cloud tạm thời như phần dưới. Luôn nạp biến `VITE_*` trước `pnpm build` vì Vite ghi cấu hình public vào bundle tại thời điểm build.

## Biến môi trường

Chỉ hai biến an toàn cho browser bundle là `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`. Ba biến chỉ dành cho Supabase CLI là `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` và `SUPABASE_PROJECT_ID`; không đặt chúng trong frontend hoặc browser bundle.

## Quy trình cloud

Không dùng Supabase local hoặc Docker. Mọi lệnh migration chạy trên project Cloud đã link và phải nạp `.env` từ vị trí an toàn mà không in giá trị ra terminal:

```bash
set -a
source "$TUENHI_ENV_FILE"
set +a

pnpm exec supabase migration list --linked
pnpm exec supabase db advisors --linked --type security --level error --fail-on error
pnpm exec supabase db push --linked --dry-run
pnpm exec supabase db push --linked
pnpm cloud:verify:phase1a
pnpm supabase:types
```

Migration phải được tạo bằng `pnpm exec supabase migration new <tên>` và review trước khi push. Data API của ứng dụng chỉ expose schema `api`; `app_private` không được expose và không cấp direct table privilege cho browser roles.

## Kiểm thử bảo mật Phase 1A trên Cloud

Hai lệnh runtime dùng tài khoản Auth tạm, kiểm tra bằng JWT thật rồi tự xóa dữ liệu trong `finally`:

```bash
pnpm test:cloud:phase1a
pnpm test:e2e
```

Cấp tại runtime các biến `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `TEST_OWNER_EMAIL`, `TEST_OWNER_PASSWORD`, `TEST_EMPLOYEE_EMAIL`, `TEST_EMPLOYEE_PASSWORD`. Email test bắt buộc dùng miền `example.invalid` và tiền tố `codex-phase1a-`; mỗi lần chạy phải dùng giá trị riêng. Không lưu các biến này vào file trong repository, command history, log CI hoặc browser artifact. Playwright đã tắt trace, screenshot và video để tránh ghi credential test.

`test:cloud:phase1a` kiểm tra RLS, RPC, Edge Function, phân quyền owner/employee, hard gate đổi mật khẩu, last-owner protection và ranh giới `app_private`. `test:e2e` kiểm tra luồng đăng nhập/đổi mật khẩu/đăng xuất, route staff, giao diện desktop/mobile và trạng thái offline. Hàm dọn dữ liệu test chỉ cho service role gọi và chỉ chấp nhận profile có email test đúng tiền tố trên.

## Bootstrap chủ cửa hàng lần đầu

Chỉ chạy một lần sau khi migration Phase 1A đã được áp dụng. Cấp các biến runtime `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OWNER_PASSWORD`, `BOOTSTRAP_OWNER_DISPLAY_NAME`, sau đó chạy:

```bash
pnpm bootstrap:owner
```

Script không ghi hoặc in mật khẩu/secret. Owner đầu tiên phải đổi mật khẩu trong lần đăng nhập đầu tiên. Không đưa các biến bootstrap hoặc secret key vào biến `VITE_*` hay commit vào Git.

## Ranh giới PWA cache

Service worker chỉ precache app shell và static asset. Mọi phản hồi tài chính, API, Auth, Storage và báo cáo luôn đi qua network, không được runtime-cache.

## Quản trị nhân viên

Owner dùng màn `/staff` để tạo, khóa, mở lại tài khoản và đặt mật khẩu tạm. Các thao tác Auth Admin đi qua bốn Edge Function `create-employee`, `deactivate-employee`, `reactivate-employee`, `reset-employee-password`; UI không bao giờ nhận secret key. Nhân viên mới hoặc vừa được đặt lại mật khẩu phải đổi mật khẩu ở lần đăng nhập tiếp theo.

## Triển khai

Vercel được chủ động hoãn lại; Phase 1A không tạo hoặc liên kết dự án triển khai.

## Tài liệu đã phê duyệt

- [Đặc tả thiết kế](docs/superpowers/specs/2026-08-21-internal-single-store-pos-design.md)
- [Đặc tả Cloud và nhập liệu](docs/superpowers/specs/2026-08-22-cloud-platform-data-entry-design.md)
- [Kế hoạch Phase 0](docs/superpowers/plans/2026-08-21-phase-0-foundation.md)
- [Kế hoạch Phase 1A](docs/superpowers/plans/2026-08-22-phase-1a-cloud-identity-ux.md)
