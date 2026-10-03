# Tuệ Nhi — Safety Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Nếu người dùng chọn thực thi qua subagent, dùng superpowers:subagent-driven-development. Các bước dùng checkbox để theo dõi.

**Goal:** Sửa A01–A08, bảo đảm số xác nhận đúng số ghi nhận và dữ liệu không lẫn tài khoản.

**Architecture:** Bốn PR riêng: ranh giới phiên; xác nhận checkout; trạng thái form kho; bất biến trả hàng. Tận dụng version/idempotency và RPC hiện có; chỉ phần trả hàng cần migration theo thiết kế.

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

- Request tài khoản cũ trả muộn sau khi đổi người → task 1.
- Tổng không đổi nhưng giá từng dòng đổi; tiền khác định dạng 100/100.00 → task 2.
- Mất response sau complete, retry khi đang pending → task 2.
- Refresh/realtime tới trong lúc chỉnh sửa hoặc đang submit → task 3.
- Hai phiếu trả đồng thời, nhận một phần, hủy rồi yêu cầu lại → task 4.

### Task 1: R1 — Cách ly phiên và cache — A04

**Files:** Modify `src/features/auth/components/AuthProvider.tsx`, `src/features/notifications/components/NotificationCenter.tsx`, query keys của các API riêng tư và nơi invalidate liên quan. Create `src/shared/api/private-query-key.ts`. Test `src/features/auth/components/AuthProvider.test.tsx`, `src/features/notifications/components/NotificationCenter.test.tsx`.

**Interfaces:** `privateQueryKey(userId: string, ...parts: readonly unknown[]): readonly unknown[]` trả key có user ID; không fetch query riêng tư khi chưa có user. Giữ `useSession()` API. Cập nhật consumer của notification thay vì cho phép fallback key toàn cục.

- [ ] Chuyển các probe đổi tài khoản thành test kỳ vọng: Owner → anonymous → Staff trong 30 giây không thấy notification Owner; cache cũ bị xóa; profile Staff lỗi không khôi phục Owner; request Owner trả trễ bị loại; cùng user mất mạng vẫn giữ phiên theo chính sách hiện tại.
- [ ] Chạy `pnpm exec vitest run src/features/auth/components/AuthProvider.test.tsx src/features/notifications/components/NotificationCenter.test.tsx`; xác nhận các ca mới thất bại đúng lý do.
- [ ] Trong refresh auth, đối chiếu identity trước khi fetch hồ sơ; clear/cancel private cache tại ranh giới; dùng sequence/identity để bỏ response cũ. Rà `rg -n 'queryKey:|setQueryData|invalidateQueries|removeQueries' src` và cập nhật cặp key/invalidation cho queries riêng tư, giữ refresh vận hành hoạt động.
- [ ] Chạy lại các test trên và `pnpm test`; kiểm thêm Owner→WAREHOUSE_VIEWER không giá/doanh thu, logout cùng tab vẫn sạch, refresh token cùng user không mất giỏ. Không xóa snapshot giỏ của user khác để giải quyết cache.
- [ ] Review diff và commit `fix(auth): isolate account session and private cache`.

### Task 2: R2 — Tổng tiền đã xác nhận — A01

**Files:** Modify `src/features/sales/hooks/use-pos-commands.ts`, `src/features/sales/components/CheckoutDialog.tsx`, `src/features/sales/pages/PosPage.tsx`; create `src/features/sales/model/checkout-confirmation.ts` và `.test.ts`; test `src/features/sales/hooks/use-pos-commands.test.tsx`, `src/features/sales/components/CheckoutDialog.test.tsx`.

**Interfaces:** helper `hasCheckoutChanged(confirmed: CheckoutSnapshot, saved: Sale): boolean`. `CheckoutSnapshot` gồm customerId, channelId, orderDiscount, netTotal và lines `{productId,quantity,unitSalePrice,lineDiscountAmount}`. Capture snapshot tại thao tác xác nhận; phương thức/thông tin chứng từ vẫn theo command hiện có. Không đổi chữ ký RPC complete trong bản sửa dự kiến.

- [ ] Test hook `100000 -> save120000` phải không gọi complete/upload; thông báo cần xác nhận lại và giỏ thành120000. Test lần xác nhận mới mới complete đúng version. Thêm hai dòng đổi giá trái chiều cùng tổng, 100/100.00 tương đương, priceRefreshed=true nhưng không đổi giá, giá đổi lần nữa trước complete, pending outcome dùng request cũ và không save lại.
- [ ] Chạy `pnpm exec vitest run src/features/sales/hooks/use-pos-commands.test.tsx src/features/sales/model/checkout-confirmation.test.ts src/features/sales/components/CheckoutDialog.test.tsx`; ghi nhận đỏ của ca đổi giá.
- [ ] Thêm snapshot/comparison theo chuỗi số chuẩn và identity từng dòng; khi khác dừng trước upload/financial command, cập nhật UI và yêu cầu xác nhận lại. Tránh so trực tiếp chuỗi JSON hoặc chỉ netTotal. Giữ khóa thay giỏ/khách khi đang xử lý.
- [ ] Chạy lại test; native SQL kiểm expectedVersion và PRICE_CHANGED tiếp tục chặn giá đổi sau save. Test in tạm vẫn không complete; thiếu tồn vẫn cho in tạm nhưng không cho bán. Test mất response không yêu cầu upload mới trước đối soát.
- [ ] Review diff và commit `fix(sales): require confirmation of refreshed checkout prices`.

### Task 3: R3 — Dữ liệu form kho đúng với bản gửi — A02–A03

**Files:** Modify `src/features/inventory/opening/pages/OpeningDetailPage.tsx`, `src/features/inventory/opening/components/OpeningActions.tsx`, `src/features/inventory/stock-count/pages/StockCountDetailPage.tsx`. Create/test `OpeningDetailPage.test.tsx`, `StockCountDetailPage.test.tsx` bên cạnh page; thêm model helper trong đúng feature chỉ khi cần dùng lại.

**Interfaces:** giữ `api.save` và `api.command` hiện có. `OpeningActions` nhận thêm `hasUnsavedChanges: boolean` và thông báo khóa gửi; parent giữ saved snapshot. Stock page cùng quy tắc. Hydrate toàn bộ form bằng response detail mới duy nhất sau thao tác, không chỉ setDocument.

- [ ] Test lưu5, nhập9 rồi gửi: command không gọi và hiện lý do cần lưu; lưu9 rồi gửi: command dùng version mới. Test refresh COUNTED→DRAFT, countedQty null thì input trống; không thể submit trước khi đếm. Test null khác0, lỗi save giữ9, response cũ không ghi đè chỉnh sửa mới.
- [ ] Chạy `pnpm exec vitest run src/features/inventory/opening/pages/OpeningDetailPage.test.tsx src/features/inventory/stock-count/pages/StockCountDetailPage.test.tsx`; xác nhận đỏ của hai probe audit.
- [ ] Thêm dirty snapshot, khóa submit, khóa tương tác lúc đang chuyển trạng thái. Đồng bộ note/lines/estimates/document trong một đường hydrate; không tự gửi sau save và không tự post.
- [ ] Chạy lại test và native SQL fixture submit/post theo qty đã lưu; chứng minh qty5 không được post khi UI vừa xác nhận9. Kiểm đơn vị nguyên, trùng sản phẩm, số0 hợp lệ ở kiểm kho và rule tồn đầu kỳ hiện có.
- [ ] Review diff và commit `fix(inventory): submit saved counts and clear recount inputs`.

### Task 4: R4 — Vòng đời trả hàng — A05–A08

**Files:** Modify `src/features/returns/pages/ReturnCreatePage.tsx`; create `src/features/returns/pages/ReturnCreatePage.test.tsx`. Create một migration bằng `supabase migration new fix_return_lifecycle` sau kiểm CLI help; timestamp do CLI sinh. Create `supabase/tests/isolated/return_lifecycle_behavior.sql`, `supabase/tests/return_lifecycle_assertions.sql`, runner `scripts/test-audit-isolated.mjs` hoặc mở rộng runner cô lập có allowlist tên DB; nối readonly assertion vào `scripts/controlled-development-gate.mjs`.

**Interfaces:** giữ chữ ký create/cancel/complete return. Sửa final definitions của `app_private.create_sale_return_request_impl`, `complete_sale_return_impl`, bất biến `api.sale_returns` theo spec; giữ wrapper payment-proof và integer validation đang triển khai, không copy đè một definition cũ bỏ mất các patch mới.

- [ ] Tạo fixture rollback với sold5/requested5/accepted2 rồi request3 thành công; full5/5 status RETURNED; hai dòng A trả hết/B còn1 vẫn gửi được B; cancel REQUESTED giữ requested_at và không tiền/tồn, retry cùng key ổn; hai request tranh remaining không vượt sold; accepted0 theo policy hiện hành; discount/rounding cuối khép đủ tiền.
- [ ] Chạy component test và runner cô lập trên mã cũ; xác nhận các ca audit thất bại. Runner từ chối TCP/production, chỉ nhận Unix socket và DB allowlist; không cần secret production để chạy fixture.
- [ ] Sửa validation bỏ chọn0/blank, CHECK cancelled giữ provenance; reserved quantity tính theo trạng thái; tính sale status sau current return COMPLETE trong cùng transaction. Dùng lock order nhất quán, giữ chống lặp và chống gọi không quyền.
- [ ] Chạy `pnpm exec vitest run src/features/returns` và runner cô lập; đối chiếu tiền hoàn/stock movements/financial events chỉ ghi đúng một lần. Readonly assertions không chứa fixture DML.
- [ ] Kiểm tương thích UI cũ và mới, thống kê readonly dữ liệu thật ảnh hưởng; chưa tự backfill trạng thái lịch sử. Review migration và commit `fix(returns): preserve cancellation and remaining return quantities`.

## Nghiệm thu và phát hành

Theo master từng R1–R4. `pnpm check` đạt sau mỗi PR; R4 phải có migration replay và concurrency test. Chủ cửa hàng kiểm bản xác nhận tiền, số đếm và trạng thái trả trên môi trường được phép. Hạn chế tạm thời trước khi R1 đạt: tránh dùng chung phiên trình duyệt cho nhiều vai trò; đây không thay thế bản sửa.
