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

`pnpm check:full` là quality gate đầy đủ trong một lệnh. `pnpm test:e2e` chạy trên bản production đã build; nếu chỉ chạy browser smoke test, dùng `pnpm build && pnpm test:e2e`.

## Biến môi trường

Chỉ hai biến an toàn cho browser bundle là `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`. Ba biến chỉ dành cho Supabase CLI là `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` và `SUPABASE_PROJECT_ID`; không đặt chúng trong frontend hoặc browser bundle.

## Quy trình cloud

Không dùng Supabase local hoặc Docker. Mọi lệnh migration chạy trên project Cloud đã link và phải nạp `.env` từ vị trí an toàn mà không in giá trị ra terminal:

```bash
set -a
source "$TUENHI_ENV_FILE"
set +a

pnpm exec supabase migration list --linked --password "$SUPABASE_DB_PASSWORD"
pnpm exec supabase db advisors --linked --type security --level error --fail-on error
pnpm exec supabase db push --linked --dry-run --password "$SUPABASE_DB_PASSWORD"
pnpm exec supabase db push --linked --password "$SUPABASE_DB_PASSWORD"
pnpm cloud:verify:phase1a
pnpm supabase:types
```

Migration phải được tạo bằng `pnpm exec supabase migration new <tên>` và review trước khi push. Data API của ứng dụng chỉ expose schema `api`; `app_private` không được expose và không cấp direct table privilege cho browser roles.

## Ranh giới PWA cache

Service worker chỉ precache app shell và static asset. Mọi phản hồi tài chính, API, Auth, Storage và báo cáo luôn đi qua network, không được runtime-cache.

## Triển khai

Vercel được chủ động hoãn lại; Phase 0 không tạo hoặc liên kết dự án triển khai.

## Tài liệu đã phê duyệt

- [Đặc tả thiết kế](docs/superpowers/specs/2026-08-21-internal-single-store-pos-design.md)
- [Đặc tả Cloud và nhập liệu](docs/superpowers/specs/2026-08-22-cloud-platform-data-entry-design.md)
- [Kế hoạch Phase 0](docs/superpowers/plans/2026-08-21-phase-0-foundation.md)
- [Kế hoạch Phase 1A](docs/superpowers/plans/2026-08-22-phase-1a-cloud-identity-ux.md)
