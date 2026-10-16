# Tuệ Nhi — Daily Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Nếu người dùng chọn thực thi qua subagent, dùng superpowers:subagent-driven-development. Các bước dùng checkbox để theo dõi.

**Goal:** Sửa A09–A13 và A16–A17 để tìm đủ dữ liệu, giữ thao tác đang làm và giải thích lỗi rõ ràng.

**Architecture:** Chuẩn hóa chọn danh mục và cursor trên API hiện có; bản sales/returns mới dùng endpoint v2 để không phá client cũ. Form vẫn lưu có chủ đích; không thêm framework form/modal mới mặc định.

**Tech Stack:** React 19, TypeScript, TanStack Query, Supabase/PostgreSQL, Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-10-03-tuenhi-audit-remediation-design.md](/Users/admin/tuenhi/docs/superpowers/specs/2026-10-03-tuenhi-audit-remediation-design.md). Trạng thái cập nhật 03/10/2026: Đã triển khai và review A09–A13, A16–A17; 120 file / 577 test tại nội dung commit 7269265 (merge ancestry 4afad47 không thay đổi nội dung). [PR #3](https://github.com/hoangnvthkt/tuenhi/pull/3). Chưa phát hành production.

## Global Constraints

- Một cửa hàng, một kho logic; giữ React/TypeScript, TanStack Query và Supabase hiện có; không thêm dependency mặc định.
- Không tạo/xóa giao dịch thử trên Supabase production; fixture chỉ chạy ở PostgreSQL cô lập hoặc môi trường test riêng đã kiểm tra danh tính.
- Giữ nguyên phân quyền server, idempotency, version check, chứng từ chuyển khoản và ledger; tiền dùng chuỗi canonical/BigInt, không cộng tiền bằng float.
- Migration mới additive, sinh bằng Supabase CLI sau khi đọc `--help`; không sửa migration đã áp dụng, không tự sửa sổ tiền/tồn lịch sử.
- Giữ nháp/in tạm không tác động tiền/tồn; không lưu mật khẩu, ảnh chứng từ hoặc dữ liệu riêng tư mới vào localStorage.
- Mỗi task: test thất bại trước → sửa tối thiểu → test đạt → review diff → commit chỉ các file thuộc task.
- Hoàn tất gói: `pnpm check`, SQL fixture cần thiết, `pnpm p2:verify:cloud` chỉ đọc, public production smoke khi phát hành; không dùng `pnpm check:full` trên project hiện tại.

## Review Focus

- Bản ghi thứ101 hoặc đã ngừng hoạt động vẫn là lựa chọn trong chứng từ → task 1.
- Hai bản ghi cùng timestamp, thay filter trong lúc page trước chưa về → task 2.
- Client cũ có parser z.null cho nextCursor → task 2.
- Realtime version mới tới khi form dirty → task 3.
- Tab/Shift+Tab/Escape và fetch thất bại trong modal/cấu hình → task 4.

### Task 1: R5 — Chọn đủ danh mục, giữ tên chứng từ — A09/A12

**Files:** Modify `src/features/sales/pages/PosPage.tsx`, `src/features/sales/components/CartPanel.tsx`; create `src/features/sales/components/CustomerPicker.tsx` + test. Modify `src/features/inventory/purchase/components/PurchaseProductCombobox.tsx`, `src/features/inventory/purchase/pages/PurchaseDetailPage.tsx`, opening/stock-count pages. Test các page/picker tương ứng.

**Interfaces:** `CustomerPicker` nhận `value: string | null`, `disabled: boolean`, `onChange(id: string | null): void`; dùng `listCustomers({search,cursor,limit:30})`, resolve selected theo API detail hiện có. Product picker nhận `selectedSnapshot?: {id:string;name:string;sku:string}`; source snapshot từ receipt/import result, không chứa giá vốn cho người không quyền. Nếu tái dùng giữa feature, đặt tại `src/features/catalog/components/ProductSelect.tsx` với cùng interface, không import ngược từ catalog sang purchase.

- [x] Viết test chọn customer101/product101 qua search, load tiếp, selected ngoài trang đầu, ngừng hoạt động còn đọc snapshot, lỗi tải→retry, search trước trả muộn bị bỏ. Chứng từ đã ghi sổ không dùng ô trống chỉ vì lookup không thấy.
- [x] Chạy `pnpm exec vitest run src/features/sales/components src/features/inventory src/features/catalog`; thấy ca mới đỏ trước sửa.
- [x] Implement search debounce250ms và cursor bằng query có userId/filter; hydrate selection độc lập. Không tự chọn kết quả đầu khi danh sách tải lại; keyboard Enter chỉ chọn kết quả đúng search hiện tại. Product read-only hiển thị snapshot bằng text.
- [x] Chạy test lại; kiểm không rò giá cho kho chỉ xem, draft ngoài trang đầu vẫn đúng khách, import giữ tên sau áp dụng, không thêm/sửa dữ liệu chỉ do mở picker.
- [x] Review và commit `fix(pickers): search full directories and retain selected identities`.

### Task 2: R6 — Phân trang và báo cáo — A10/A11

**Files:** Modify list API/schema/pages của sales, returns, purchase, opening, stock-count; `src/features/imports/pages/ImportHistoryPage.tsx`; `src/features/notifications/api/notification-api.ts`, `NotificationCenter.tsx`; `src/features/reports/pages/ReportPage.tsx`. Create corresponding list page regression tests và `ReportPage.test.tsx`. Create migration CLI `add_operational_list_pagination`, readonly assertions và isolated behavior fixture.

**Interfaces:** sales `list(filters = {}, cursor?: {sortAt:string;id:string})`; returns `list(filters = {}, cursor?: {updatedAt:string;id:string})`. New `api.list_sales_v2(jsonb,timestamptz,uuid,integer)` và `api.list_sale_returns_v2(jsonb,timestamptz,uuid,integer)` giữ tên tham số hiện hành; trả envelope hiện có với `nextCursor` object tương ứng hoặc null. Hàm definer ở app_private, public API invoker, quyền/scope giữ nguyên.

Purchase/stock lists nhận `list(status?:string,cursor?:{updatedAt:string;id:string})`; opening `list(cursor?:{updatedAt:string;id:string})`; import dùng `listHistory` và cursor createdAt hiện có. Notifications `list(input?: {unreadOnly?:boolean;cursor?:{createdAt:string;id:string}})`; limit50. Profit dùng page cuối nếu có, chỉ dùng first-page cursor khi chưa có page tiếp.

- [x] Viết fixture 51 sales/returns, 101 purchase/opening/count, 31 import, 51 notifications; gồm timestamp trùng và scope OWN/ALL/NONE. Test đi hết không mất/trùng, null cuối dừng; filter đổi bỏ page cũ; loading/error không báo rỗng giả; report51 events tải cuối không nhân đôi và KPI không đổi.
- [x] Chạy test API/page theo feature; SQL fixture native cô lập đỏ trước migration. Kiểm old sales/returns parser vẫn nhận response endpoint cũ.
- [x] Implement keyset + limit+1, cursor cuối page thực hiển thị, SQL scope trước limit; tiếp tục query/index plan với dữ liệu giả. DTO chuyển thêm cursor đúng tên; key query chứa user/filter. Reset pages khi refresh hoặc filter đổi; bỏ response cũ và dedupe theo ID khi dữ liệu biến động giữa các trang; không hứa snapshot lịch sử nếu dữ liệu đang đổi.
- [x] Thêm Tải thêm và trạng thái đang tải/lỗi; notifications filter chưa đọc, không đánh dấu tất cả tự động. Import/đối tác giữ filter khi về danh sách. Kiểm quyền và URL trực tiếp, client cũ/v2 cùng hoạt động.
- [x] Chạy `pnpm exec vitest run src/features/sales src/features/returns src/features/inventory src/features/imports src/features/notifications src/features/reports`, SQL fixture và `pnpm check`; review/commit `fix(lists): paginate operational history without duplicate pages`.

### Task 3: R7a — Không mất form khi realtime tới — A13

**Files:** Modify `src/features/catalog/components/ProductEditor.tsx`, `ProductForm.tsx`, `src/features/catalog/pages/ProductDetailPage.tsx`; tests cạnh các component/page.

**Interfaces:** form có callback `onDirtyChange(dirty:boolean):void`; giữ baseVersion của phiên sửa. Parent gọi save với baseVersion; nhận conflict không tự retry bằng version mới. Realtime không remount theo version. Đổi product ID bắt đầu phiên form mới sau khi xử lý dirty.

- [x] Test sửa tên rồi version2 tới: giữ tên đang nhập; save gửi version1 và báo conflict; tải bản mới cần xác nhận bỏ thay đổi; khi pristine có thể hydrate bản mới; route/back có guard, save thành công cập nhật baseline.
- [x] Chạy `pnpm exec vitest run src/features/catalog` và chứng minh probe mất form đỏ.
- [x] Thay key theo version bằng phiên chỉnh sửa, dirty/conflict state; dùng cơ chế route blocker phù hợp router hiện tại và beforeunload khi dirty. Không tự merge giá/tồn hoặc hiển thị giá từ snapshot không quyền.
- [x] Test lại với lỗi mạng, đổi ID, active/inactive, minStockQty0 khác effective50; review/commit `fix(catalog): preserve unsaved edits across realtime updates`.

### Task 4: R7b — Modal và lỗi tải có thể phục hồi — A16/A17

**Files:** Modify `src/features/notifications/components/NotificationCenter.tsx`, `src/features/settings/pages/StoreSettingsPage.tsx`; tests cạnh file. Chỉ tạo `src/shared/ui/feedback/Modal.tsx` nếu dùng lại ngay ở ≥2 consumer trong cùng PR; nếu không giữ implementation hẹp tại notification.

**Interfaces:** không đổi RPC settings. Dialog quản lý initial focus/focus trap/Escape/restore; chỉ dùng aria-modal nếu nền đã inert/không tương tác. Settings dùng query.isError + retry refetch; giữ values bẩn qua refetch.

- [x] Test focus trong dialog sau mở; Tab/Shift+Tab vòng trong, Escape đóng/trả focus; background không tương tác. Test fetch settings reject phải hiện role=alert và Thử lại, retry thành công hiện form, không gửi save khi chưa tải settings version.
- [x] Chạy `pnpm exec vitest run src/features/notifications/components/NotificationCenter.test.tsx src/features/settings/pages/StoreSettingsPage.test.tsx`; thấy ca mới đỏ.
- [x] Implement các trạng thái và câu báo tiếng Việt, không chỉ generic “thử lại” khi có mã lỗi nghiệp vụ biết trước. Không mở rộng quyền để vượt lỗi.
- [x] Chạy test + desktop/mobile keyboard UAT; review/commit `fix(ui): make dialogs and settings failures recoverable`.

## Phát hành

R5/R7 frontend-only; R6 database tương thích trước frontend v2. Đợt2 không đổi cơ chế phát sinh low-stock episodes; gộp cảnh báo thành tiện ích là phạm vi sau, không lẫn với sửa phân trang. Không xóa thông báo đang tồn tại để làm badge nhỏ hơn.
