# P2.0 — Single-project Controlled Development Implementation Plan

## Tóm tắt

Chuẩn hóa project Supabase hiện tại thành môi trường development/UAT có kiểm soát nhưng vẫn giữ lifecycle kỹ thuật `PRODUCTION`. P2.0 không thêm tính năng nghiệp vụ, migration hay dữ liệu; chỉ bổ sung guard fail-closed, release verifier chỉ đọc, SQL assertions và runbook.

Thực hiện trên branch `codex/phase-2-p2-0-controlled-development` từ local `main` chứa commit thiết kế `5034973`.

## Interfaces và contract mới

- Thêm `assertPreProductionAutomationAllowed(lifecycle)`:
  - chỉ chấp nhận `PRE_PRODUCTION`;
  - `OWNER_PILOT`/`PRODUCTION` ném `PRODUCTION_TEST_DATA_FORBIDDEN`.
- Thêm `assertControlledDevelopmentLifecycle(lifecycle)`:
  - yêu cầu `mode=PRODUCTION`;
  - policy chỉ nhận `OWNER_WAIVER` hoặc `LEAKED_PASSWORD_PROTECTED`;
  - không trả timestamp hoặc dữ liệu private.
- Thêm `assertLinkedProjectIdentity({ projectId, linkedRef, supabaseUrl })` để bảo đảm `.env`, URL và Supabase CLI đang trỏ cùng project.
- Thêm `parseLinkedMigrationList(output)` để fail-closed khi local/remote migration thiếu hoặc lệch.
- Thêm package scripts:
  - `p2:verify:cloud`: chạy gate Cloud chỉ đọc.
  - `p2:release:verify`: chạy `pnpm check` rồi `p2:verify:cloud`.
- Không thay đổi browser API, database RPC, Supabase types hoặc schema.

## Công việc triển khai

### Task 1: Khóa automation tạo/xóa dữ liệu

- Sửa `scripts/project-lifecycle.mjs` để các Cloud runner dùng chung `assertPreProductionAutomationAllowed`.
- Giữ `assertSyntheticTestsAllowed(admin)` làm adapter đọc lifecycle rồi gọi guard mới.
- Sửa `cutover-cleanup-tests.mjs` và `cutover-preflight.mjs` để kiểm tra lifecycle ngay đầu lệnh, trước khi liệt kê dữ liệu hoặc chạy advisor.
- Giữ nguyên server-side revoke của các cleanup RPC; không tạo migration để mở lại quyền.
- Thêm test tại `src/shared/lib/cutover/controlled-development-policy.test.mjs`:
  - `PRE_PRODUCTION` cho phép automation;
  - `OWNER_PILOT` và `PRODUCTION` đều bị chặn;
  - cleanup/preflight và toàn bộ `test:cloud:*` vẫn gọi guard;
  - error chỉ chứa mã an toàn, không chứa secret.

Commit: `test: harden production automation guards`

### Task 2: Tạo release verifier chỉ đọc

- Tạo `scripts/controlled-development-policy.mjs` chứa lifecycle validation, project identity validation và migration-list parser.
- Tạo `scripts/controlled-development-gate.mjs`, chạy bằng `node --env-file=.env`:
  1. So sánh `SUPABASE_PROJECT_ID`, hostname Supabase URL và `supabase/.temp/project-ref`.
  2. Đọc lifecycle và yêu cầu `PRODUCTION` cùng policy hợp lệ.
  3. Đọc application counts nhưng không đọc email, payload chứng từ hoặc private ledger.
  4. Chạy tuần tự:
     - `supabase migration list --linked`;
     - `supabase db lint --linked --fail-on error`;
     - security advisor với `--level warn --fail-on error`;
     - performance advisor với `--level warn --fail-on error`;
     - `pnpm cloud:verify:phase1f`.
  5. Parse migration list và fail nếu local/remote không khớp.
- Command allowlist không được chứa `db push`, `test:cloud:*`, `test:e2e` có credential, cleanup, lifecycle mutation hoặc bootstrap.
- Output chỉ gồm:
  - `environmentRole: CONTROLLED_DEVELOPMENT_UAT`;
  - lifecycle mode/policy;
  - số migration;
  - application counts;
  - trạng thái từng gate.
- Thêm `p2:verify:cloud` và `p2:release:verify` vào `package.json`.
- Unit test các trường hợp project mismatch, URL sai, migration local-only/remote-only, lifecycle/policy sai và subprocess thất bại.

Commit: `chore: add controlled development release gate`

### Task 3: Củng cố SQL assertions Production

- Mở rộng `supabase/tests/phase_1f_b_cutover_assertions.sql`.
- Khi lifecycle là `OWNER_PILOT` hoặc `PRODUCTION`, xác nhận `service_role` không còn `EXECUTE` trên cả private implementation và API wrapper của năm cleanup RPC Phase 1A/1B/1C/1E/1F.
- Tiếp tục xác nhận `anon`/`authenticated` không thể gọi lifecycle mutation hoặc cleanup.
- Assertion chỉ đọc metadata/privilege; không insert, update, delete hoặc gọi command nghiệp vụ.
- Không tạo migration và không regenerate TypeScript types.

Commit: `test: assert production cleanup remains revoked`

### Task 4: Runbook và README

- Tạo `docs/runbooks/phase-2-p2-0-controlled-development.md` với:
  - vai trò project hiện tại và lifecycle `PRODUCTION`;
  - bảng lệnh được phép/bị cấm;
  - quy trình migration additive cho các increment sau;
  - checklist trước/sau deployment;
  - quy tắc Owner nhập test thủ công;
  - cảnh báo chứng từ hoàn tất không được “clear” trực tiếp;
  - rollback frontend bằng Vercel, rollback database bằng expand/contract;
  - P2.6 tạo project Free thứ hai sạch, không copy dữ liệu test.
- Cập nhật README để các `test:cloud:*` cũ được ghi rõ là lịch sử PRE_PRODUCTION, không còn là hướng dẫn vận hành hiện tại.
- Thêm hướng dẫn chuẩn:
  - `pnpm p2:release:verify`;
  - deployment smoke trên URL Vercel;
  - Owner authenticated smoke chỉ đọc.
- Chuyển trạng thái Master Design thành “Owner đã duyệt”.
- Test contract tài liệu phải tìm thấy các cụm `CONTROLLED_DEVELOPMENT_UAT`, `PRODUCTION_TEST_DATA_FORBIDDEN`, `p2:release:verify`, project Free thứ hai và quy định không reset tại chỗ.

Commit: `docs: add p2 controlled development runbook`

## Test và nghiệm thu

- Targeted:
  - `pnpm exec vitest run src/shared/lib/cutover/controlled-development-policy.test.mjs`
  - `git diff --check`
- Quality:
  - `pnpm check`
- Cloud chỉ đọc:
  - `pnpm p2:verify:cloud`
  - lifecycle phải là `PRODUCTION`;
  - policy hiện tại dự kiến `OWNER_WAIVER`;
  - migration local/remote phải khớp;
  - lint/advisor/Phase 1F SQL assertions đạt;
  - application counts trước/sau không đổi.
- Release:
  - fast-forward vào `main` và push sau review;
  - Vercel check `Vercel - tuenhi: production-smoke` phải đạt;
  - public smoke đạt mobile/desktop;
  - Owner smoke chỉ đọc `/`, `/products`, `/reports`, `/more/inventory/valuation`, `/staff`.
- Tuyệt đối không chạy `test:cloud:*`, Cloud E2E có credential, cleanup, lifecycle command, bootstrap Owner hoặc `db push` trong P2.0.

## Global Constraints

- Project hiện tại tiếp tục dùng Supabase Free và dữ liệu chỉ là test thủ công.
- Lifecycle không được hạ từ `PRODUCTION`.
- `OWNER_WAIVER` vẫn được chấp nhận; nếu sau này bật leaked-password protection, verifier chấp nhận `LEAKED_PASSWORD_PROTECTED`.
- Không thêm Staging trong P2.0.
- Không thêm tính năng nghiệp vụ, migration, browser API, database RPC, Supabase types hoặc schema.
- Mọi Cloud gate mới trong P2.0 phải chỉ đọc; không chạy `test:cloud:*`, Cloud E2E có credential, cleanup, lifecycle mutation, bootstrap Owner hoặc `db push`.
- Local `main` bắt đầu tại `5034973`; khi tích hợp P2.0 sẽ push cả Master Design và implementation P2.0, nhưng phải dừng nếu `origin/main` phát sinh divergence.
