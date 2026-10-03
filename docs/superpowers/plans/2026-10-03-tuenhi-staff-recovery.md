# Tuệ Nhi — Staff Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Nếu người dùng chọn thực thi qua subagent, dùng superpowers:subagent-driven-development. Các bước dùng checkbox để theo dõi.

**Goal:** Sửa A14–A15 để tạo/mở lại nhân viên có đường phục hồi và báo đúng trạng thái.

**Architecture:** Giữ Edge Owner-only và chức năng finalize hiện có. Frontend parse kết quả có cấu trúc, cùng request ID qua retries; handler được kiểm thử lỗi từng bước qua dependency giả lập trước tích hợp Auth riêng.

**Tech Stack:** React 19, TypeScript, TanStack Query, Supabase/PostgreSQL, Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-10-03-tuenhi-audit-remediation-design.md](/Users/admin/tuenhi/docs/superpowers/specs/2026-10-03-tuenhi-audit-remediation-design.md). Trạng thái: phương án đề xuất ngày 03/10/2026, chưa triển khai.

## Global Constraints

- Một cửa hàng, một kho logic; giữ React/TypeScript, TanStack Query và Supabase hiện có; không thêm dependency mặc định.
- Không tạo/xóa giao dịch thử trên Supabase production; fixture chỉ chạy ở PostgreSQL cô lập hoặc môi trường test riêng đã kiểm tra danh tính.
- Giữ nguyên phân quyền server, idempotency, version check, chứng từ chuyển khoản và ledger; tiền dùng chuỗi canonical/BigInt, không cộng tiền bằng float.
- Migration mới additive, sinh bằng Supabase CLI sau khi đọc `--help`; không sửa migration đã áp dụng, không tự sửa sổ tiền/tồn lịch sử.
- Giữ nháp/in tạm không tác động tiền/tồn; không lưu mật khẩu, ảnh chứng từ hoặc dữ liệu riêng tư mới vào localStorage.
- Mỗi task: test thất bại trước → sửa tối thiểu → test đạt → review diff → commit chỉ các file thuộc task.
- Hoàn tất gói: `pnpm check`, SQL fixture cần thiết, `pnpm p2:verify:cloud` chỉ đọc, public production smoke khi phát hành; không dùng `pnpm check:full` trên project hiện tại.

## Review Focus

- Auth tạo thành công nhưng finalize lỗi hoặc response mất → task 1.
- Retry sau reload, không còn mật khẩu trong bộ nhớ → task 1.
- pendingUserId không khớp email, đã có profile hoặc actor không phải Owner → task 1.
- Profile active nhưng Auth vẫn banned → task 2.
- Double-click/retry cùng key không tạo thêm audit/notification hoặc mở quyền khác → task 1–2.

### Task 1: R8a — Tiếp tục tạo nhân viên — A14

**Files:** Modify `src/features/staff/api/staff-api.ts`, `src/features/staff/components/StaffForm.tsx`, `src/features/staff/pages/StaffPage.tsx`, `supabase/functions/create-employee/index.ts`, `_shared/staff-validation.ts` nếu validator cần cho resume không mật khẩu. Test `staff-api.test.ts`, `StaffForm.test.tsx`, `StaffPage.test.tsx`; create mockable handler và test cạnh Edge theo test runner thích hợp, không chạy Auth thật trong unit.

**Interfaces:** `CreateStaffInput` thêm `idempotencyKey:string`, `pendingUserId?:string`; initial-create cần temporaryPassword, resume dùng pendingUserId và không cần lưu/đọc lại mật khẩu. `StaffRecoveryError` chứa code, correlationId, pendingUserId nullable, outcomeUnknown. Tách initial/resume bằng discriminated union trong validator, không cho thiếu cả password lẫn pending ID. Tạo key ở đầu operation trong UI, không ở mỗi lần api.create.

- [ ] Test finalize500 trả pendingID → UI giữ operation/key → retry gọi resume không createUser mới. Test reload marker không chứa password; đọc lại danh sách/trạng thái trước tiếp tục. Test mất response trước biết ID hiện chưa xác định, không tự tạo lại; Owner phải tra cứu/đối soát trước.
- [ ] Chạy `pnpm exec vitest run src/features/staff`; thêm handler tests mô phỏng createUser/finalize/getUserById. Xác nhận test đỏ ở nơi thông tin recovery bị mất.
- [ ] Parse details trên cả HTTP error và envelope; hiển thị “Tài khoản đã tạo, cần hoàn tất hồ sơ” và Tiếp tục. Resume server xác minh email/ID/current profile/Owner; không cho thay role hoặc email của operation đang pending một cách âm thầm. Thành công xóa marker; đổi Owner không đọc marker của người trước.
- [ ] Test lỗi lần2, retry cùng key, email tồn tại thật, stale pendingID và không quyền. Marker chỉ chứa key/targetID/action gắn user, không password hoặc payload form riêng tư. Review/commit `fix(staff): resume partially created employee accounts`.

### Task 2: R8b — Mở lại tài khoản báo đúng kết quả — A15

**Files:** Modify `src/features/staff/api/staff-api.ts`, `src/features/staff/components/StaffActions.tsx`, `src/features/staff/pages/StaffPage.tsx`, `supabase/functions/reactivate-employee/index.ts`; tests staff-api/StaffActions và Edge handler tương ứng.

**Interfaces:** `setActive(input & {idempotencyKey:string}): Promise<{authReactivationPending:boolean}>`; profile-only success không là login-ready. UI lưu operation đang pending và gọi lại cùng key/target/reason. Edge giữ trường kết quả additive để client cũ parse được; không trả secret hoặc ban details.

- [ ] Test set_staff_active success nhưng Auth unban failure → API trả pending, UI không toast thành công; retry unban success→toast hoàn tất, operation kết thúc. Test double-click, không quyền, locked lastOwner guard, transport unknown và stale marker.
- [ ] Chạy `pnpm exec vitest run src/features/staff`; handler test đỏ trước sửa.
- [ ] Implement pending message/action, giữ key trong operation, không báo “đăng nhập được” chỉ vì profile active. Không xóa ban để sửa một user sai hoặc hạ policy Owner waiver.
- [ ] Test lại + `pnpm check`; tích hợp create→first-password-change→lock→reactivate trong project test hoặc buổi UAT tài khoản được phép, ghi rõ kiểm tra Auth nào thực sự chạy. Review/commit `fix(staff): surface incomplete authentication reactivation`.

## Release riêng R8

Nếu có thay validator resume: Edge backward-compatible trước frontend mới; giữ JWT verification và Owner authorization. Không đổi lifecycle/staff policy. Không tạo nhân viên giả trên production để chứng minh test; dùng mocks cho branch errors và integration target riêng. Rollback UI cũ có thể làm mất khả năng tiếp tục, nên phải lập danh sách pending operations trước rollback và ưu tiên forward fix nếu đang có thao tác chưa hoàn tất.
