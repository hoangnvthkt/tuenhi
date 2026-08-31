# P2.1 — Daily Workflow Productivity Implementation Plan

Ngày: 2026-08-31

Trạng thái: Đang triển khai theo xác nhận của Owner

## Mục tiêu và contract

- Thêm `PosCartIdentity`, `PosCartSnapshotV2` và `PosEditorLeaseV1` để phục hồi
  giỏ và khóa một tab chỉnh sửa.
- Thêm recovery state cho pending financial commands; chỉ lookup outcome, không
  tự gửi command.
- Giữ nguyên RPC/schema/types Supabase và các quy tắc payment/return/cancel.

## Hạng mục

1. Version hóa snapshot giỏ, migrate payload cũ, xác thực server version và
   triển khai lease/takeover giữa tab.
2. Debounce product lookup, combobox keyboard-first và shortcut checkout an
   toàn với IME/form fields.
3. Đặt pending-command recovery coordinator trong authenticated app shell,
   hiển thị banner bền vững và route tới đúng chứng từ.
4. Đồng bộ bộ lọc hóa đơn vào URL, mở exact invoice bằng Enter, bổ sung action
   bar in/PDF/đơn mới và payment reconciliation summary.
5. Chạy targeted tests, `pnpm check`, `pnpm p2:release:verify`, public production
   smoke và Owner UAT theo runbook.

## Nghiệm thu

- Không có ghi đè giỏ âm thầm giữa hai tab; takeover làm tab cũ mất quyền ghi.
- Exact SKU/barcode và keyboard navigation thêm đúng sản phẩm; PDF vẫn lazy.
- `RESOLVED` hợp lệ xóa marker, `NOT_FOUND`/offline/malformed giữ marker và mã
  yêu cầu; coordinator không gọi command ghi.
- Search/status hóa đơn sống qua reload; in chỉ chạy khi người dùng bấm.
- Không chạy `db push`, `test:cloud:*`, cleanup, bootstrap, lifecycle mutation
  hoặc Cloud E2E có credential.

## Triển khai

Thực hiện trên branch `codex/phase-2-p2-1-daily-workflow-productivity` bằng một
agent chính, sau khi P2.0 đã fast-forward vào local `main`. Chỉ fast-forward và
push `main` sau review, full verification và xác nhận không có divergence mới
từ `origin/main`.
