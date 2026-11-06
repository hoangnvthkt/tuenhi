# Tuệ Nhi — hướng dẫn cho Claude

App POS + kho nội bộ cho **cửa hàng thuốc Tuệ Nhi** (một cửa hàng, một kho), lấy ý tưởng từ KiotViet. Chủ sản phẩm (chủ SP) gọi là "anh"; trao đổi bằng tiếng Việt, xưng "em".

## Đầu mỗi phiên

1. Đọc handoff mới nhất trong `docs/handoffs/` (hiện là `2026-11-07-project-handoff.md`). Handoff tháng 9 và roadmap cũ có nhiều giả định đã lỗi thời.
2. `git status --short --branch`, `git fetch`, so `HEAD` với `origin/main`. Không reset/clean/stash thay đổi local không phải của mình.
3. Đọc code, test và runbook của đúng phần sắp làm.

## Quyền đã giao (chủ SP, 07/11/2026)

Được tự **push, mở PR, merge, deploy (Vercel, Edge Functions) và áp migration** lên Supabase Cloud cho việc chủ SP đã giao. Vẫn hỏi trước khi:

- xóa, reset, cleanup hay sửa tay dữ liệu nghiệp vụ trên Cloud (hóa đơn, ledger, tồn, công nợ, Auth); bootstrap Owner, lifecycle mutation;
- chạy test Cloud có tạo/xóa dữ liệu (`test:cloud:*`, `check:full`, fixture `supabase/tests/isolated/*` trên Cloud);
- merge nhánh staff recovery hoặc bắt đầu một phase mới (P2.4…) chưa được giao.

## Cách làm việc

- **Nghĩ trước khi code:** nêu giả định; nhiều cách hiểu thì hỏi, không tự chọn. Cần chủ SP quyết nhiều điều → một lần hỏi có lựa chọn bấm được, phương án khuyên đứng đầu.
- **Đơn giản trước:** code tối thiểu đúng yêu cầu, không thêm tính năng/abstraction không được yêu cầu.
- **Sửa đúng chỗ:** không "cải thiện" code, format lân cận; giữ style hiện có; chỉ dọn thứ mình tạo ra.
- **Theo mục tiêu kiểm chứng được:** lỗi → test tái hiện rồi sửa cho pass; việc nhiều bước → plan ngắn kèm bước kiểm.
- Việc nhỏ/tuần tự làm trực tiếp. Subagent chỉ dùng khi rõ ràng nhanh hơn (rà soát độc lập, dò tìm rộng, việc song song không chạm cùng tệp).
- Giao diện: chỉ tiêu đề + số liệu + nút, không đoạn giải thích dài; giữ style hiện tại; walkthrough desktop + mobile trước khi báo xong. Trạng thái loading/empty/error/denied phải hiện đúng, không che bằng `0`.
- Cuối mỗi lượt báo việc còn treo; sổ việc nằm trong memory `owner-task-ledger`.

## Quy trình phát hành

1. Nhánh `claude/<việc>` từ `origin/main` mới nhất. Commit message tiếng Anh dạng conventional (`feat:`, `fix:`…), PR tiêu đề tiếng Việt.
2. Chạy local trước khi push: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (build gồm verifier budget). Thêm `pnpm templates:verify` / `fonts:verify` khi chạm tới chúng.
3. Push → mở PR → chờ CI (`gh pr checks <n> --watch`) → xanh thì **squash-merge** (repo không bật GitHub auto-merge) → xóa nhánh.
4. Migration: tạo bằng `supabase migration new`, additive, có test SQL cô lập local. Áp Cloud bằng `supabase db push --linked` (dry-run trước) **ngay trước hoặc cùng lúc** merge frontend cần nó; sau đó kiểm `supabase migration list --linked` và regenerate `src/shared/supabase/database.types.ts` nếu đổi contract.
5. Vercel tự build production từ `main`. Sau merge phải kiểm deployment **Ready** (không chỉ CI xanh) và workflow `Production deployment smoke`; lỗi build Vercel không làm đỏ CI.
6. Báo lại: PR, commit main, migration, trạng thái Vercel, phần chưa kiểm (thiết bị thật, máy in, UAT).

## Công cụ trên máy này

- `gh`: `/opt/homebrew/bin/gh` (không có trong PATH của Bash tool), đăng nhập `hoangnvthkt`.
- `pnpm`: không có trong PATH → dùng `corepack pnpm …` (bản 11.19.0 theo `packageManager`).
- Supabase CLI: `./node_modules/.bin/supabase`; project `ccfhkhtxoruyniwxowrz`. Nạp biến bằng `set -a && . ./.env && set +a` trong cùng lệnh; **không in giá trị `.env`**. Supabase MCP của phiên không có quyền vào project này.
- Vercel: `npx -y vercel@latest …` (đã đăng nhập `hoangnvthkt`), project `hoangnvthkts-projects/tuenhi`.
- `.workbook_build/` và `outputs/` là công việc khác dùng chung thư mục: không xóa, không commit; chúng làm `pnpm format:check` toàn repo báo lỗi ở máy này (CI không bị vì checkout sạch).

## Quy tắc nghiệp vụ cốt lõi

Chi tiết ở handoff mục 4. Tóm tắt không được phá:

- Tiền là chuỗi thập phân chuẩn + BigInt, không float. Ledger, tồn, công nợ chỉ đổi qua RPC transaction trong database (locking, expected version, idempotency); retry cùng idempotency key.
- Giá vốn/lợi nhuận/định giá tồn chỉ Owner, chặn ở server; không lưu vào localStorage/IndexedDB/SW cache; không có trong DTO in/PDF.
- Browser chỉ gọi schema `api`; `app_private` không expose. Giữ RLS, grants, `search_path = ''`.
- Cho bán âm kho; phần thiếu có COGS tạm 0, nhập bù phân bổ FIFO.
- Khách vãng lai không được ghi nợ; nhắc nợ quá 7 ngày tròn.
