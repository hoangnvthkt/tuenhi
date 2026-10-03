# Kiểm toán đăng nhập, phân quyền, thông báo, cấu hình và độ tin cậy

Ngày: 03/10/2026. Phạm vi kiểm tra: mã nguồn hiện tại, chuỗi migration cuối cùng, Edge Functions và phép thử cục bộ có mock. Không thay đổi tệp được Git theo dõi; không gọi hoặc sửa dữ liệu Cloud. Các phát hiện bên dưới phân biệt rõ lỗi đã tái hiện với lỗi suy ra từ đường đi mã nguồn.

## Lỗi đã tái hiện cục bộ

### A1 — P1: Chuyển tài khoản có thể hiển thị dữ liệu cache của người trước

**Độ tin cậy: cao; đã tái hiện bằng integration probe React.** Khi nhận sự kiện đăng xuất từ tab khác, `AuthProvider` chỉ xóa trạng thái phiên, không xóa QueryClient. Khi Auth chuyển sang người dùng khác, cache cũng không được xóa. Thông báo dùng khóa chung `['notifications', 'mine']`, trong khi cấu hình query giữ dữ liệu fresh 30 giây.

**Tái hiện:** Chủ cửa hàng tải thông báo → đăng xuất ở tab khác → đăng nhập bằng nhân viên → trở lại tab ban đầu và mở thông báo trong 30 giây. Phép thử hiển thị `PRIVATE OWNER NOTIFICATION` dưới phiên nhân viên và không tải lại feed của nhân viên. Đây là lỗi cách ly dữ liệu ở client; kiểm toán chưa chứng minh có thể vượt quyền SQL.

**Bằng chứng:**

- [AuthProvider.tsx:50](/Users/admin/tuenhi/src/features/auth/components/AuthProvider.tsx:50): nhánh phiên rỗng không gọi `queryClient.clear()`.
- [NotificationCenter.tsx:15](/Users/admin/tuenhi/src/features/notifications/components/NotificationCenter.tsx:15): query key không có user ID.
- [create-query-client.ts:7](/Users/admin/tuenhi/src/shared/lib/query/create-query-client.ts:7): staleTime 30 giây.
- [Probe:57](/Users/admin/.local/share/tuenhi/audits/2026-10-03/probes/access/audit.test.tsx:57): tái hiện dữ liệu thông báo của người trước xuất hiện dưới người sau.

**Biến thể đã tái hiện:** Khi Auth user ID thay đổi nhưng RPC tải hồ sơ mới lỗi, [AuthProvider.tsx:96](/Users/admin/tuenhi/src/features/auth/components/AuthProvider.tsx:96) khôi phục danh tính và quyền của chủ cửa hàng trước đó. Chỉ giữ phiên khi ngoại tuyến nếu user ID còn khớp; cần hủy/xóa truy vấn riêng tư tại mọi ranh giới đổi danh tính và gắn user ID vào query key.

### A2 — P2: Modal thông báo không chuyển focus bàn phím vào trong

**Độ tin cậy: cao; probe xác nhận focus còn ở nút chuông sau khi mở.** [NotificationCenter.tsx:151](/Users/admin/tuenhi/src/features/notifications/components/NotificationCenter.tsx:151) khai báo `aria-modal=true` nhưng không có quản lý focus, chặn Tab thoát ra ngoài, hoàn trả focus hoặc xử lý Escape. Người dùng bàn phím có thể thao tác nền phía sau lớp phủ. Parent cũng đã xác nhận quan sát focus bằng UI.

**Khắc phục đề xuất:** Dùng modal primitive có đầy đủ quản lý focus; kiểm tra Tab/Shift+Tab, Escape và focus sau đóng. Probe hiện dừng ở assertion focus đầu tiên; phần Escape là kiểm tra cần bổ sung, chưa được chạy đến trong lần thử này.

### A3 — P2: Trang cấu hình hiển thị tải mãi khi request lỗi

**Độ tin cậy: cao; đã tái hiện cục bộ.** [StoreSettingsPage.tsx:82](/Users/admin/tuenhi/src/features/settings/pages/StoreSettingsPage.tsx:82) coi mọi trạng thái không có data là đang tải, không xử lý `query.isError`. Cho request tải cấu hình thất bại: trang tiếp tục hiện “Đang tải cấu hình…” dù request đã kết thúc; không thông báo lỗi hoặc nút thử lại.

**Khắc phục đề xuất:** Tách loading/error/empty/success; sử dụng mẫu lỗi có nút thử lại sẵn có ở SalesChannelPage.

## Lỗi có bằng chứng mã nguồn, chưa fault-injection trên backend thực

### A4 — P2: Tạo nhân viên thất bại một phần không thể tiếp tục qua UI

**Độ tin cậy: cao theo đường đi mã nguồn; chưa thử tạo Auth user thật.** [create-employee/index.ts:88](/Users/admin/tuenhi/supabase/functions/create-employee/index.ts:88) trả về `pendingUserId` khi tài khoản Auth đã được tạo nhưng RPC tạo hồ sơ thất bại; đoạn 49–60 hỗ trợ tiếp tục với ID đó. Tuy nhiên [staff-api.ts:138](/Users/admin/tuenhi/src/features/staff/api/staff-api.ts:138) bỏ thông tin details, còn [staff-api.ts:178](/Users/admin/tuenhi/src/features/staff/api/staff-api.ts:178) luôn tạo idempotency key mới. Kiểu `CreateStaffInput` không nhận ID phục hồi.

**Kịch bản:** Auth tạo thành công → finalization RPC thất bại → chủ cửa hàng bấm thử lại cùng form. Lần sau lại gọi tạo Auth user và gặp email đã tồn tại; tài khoản thiếu hồ sơ không có đường hoàn tất từ UI.

**Khắc phục đề xuất:** Giữ dữ liệu lỗi có cấu trúc, pending user ID và khóa thao tác, hỗ trợ tiếp tục finalization; phân biệt kết quả chưa xác định với lỗi chưa tạo gì.

### A5 — P2: Mở lại tài khoản có thể báo thành công khi Auth vẫn cấm đăng nhập

**Độ tin cậy: cao theo đường đi mã nguồn; chưa gây lỗi Auth thật.** [reactivate-employee/index.ts:40](/Users/admin/tuenhi/supabase/functions/reactivate-employee/index.ts:40) trả HTTP 200, `ok:true` cùng `authReactivationPending:true` nếu RPC đã bật hồ sơ nhưng gỡ ban Auth thất bại. [staff-api.ts:186](/Users/admin/tuenhi/src/features/staff/api/staff-api.ts:186) không đưa cờ đó lên UI; [StaffActions.tsx:43](/Users/admin/tuenhi/src/features/staff/components/StaffActions.tsx:43) gọi refresh thành công.

**Kịch bản:** `set_staff_active` thành công → `updateUserById` gỡ ban thất bại. UI hiện nhân viên hoạt động và thông báo cập nhật thành công, nhưng nhân viên vẫn không đăng nhập được.

**Khắc phục đề xuất:** Hiện trạng thái chưa hoàn tất và cung cấp nút thử lại bước đồng bộ Auth.

### A6 — P2: Chỉ xem được 50 thông báo dù bộ đếm còn nhiều thông báo cũ

**Độ tin cậy: cao theo mã nguồn; parent đã quan sát danh sách thực không có phân trang.** [notification-api.ts:94](/Users/admin/tuenhi/src/features/notifications/api/notification-api.ts:94) luôn gửi `p_limit:50`, không nhận cursor. [NotificationCenter.tsx:233](/Users/admin/tuenhi/src/features/notifications/components/NotificationCenter.tsx:233) không dùng `nextCursor`. SQL đếm unread trên toàn bộ thông báo chưa hết hạn và hỗ trợ cursor ở [20260822042533_phase_1a_notifications.sql:110](/Users/admin/tuenhi/supabase/migrations/20260822042533_phase_1a_notifications.sql:110).

**Kịch bản:** Có hơn 50 thông báo và thông báo cũ chưa đọc. Badge vẫn đếm nhưng người dùng không thể mở các thông báo cũ. “Đánh dấu tất cả đã đọc” có thể xóa trạng thái chưa đọc của những mục chưa từng xem.

**Khắc phục đề xuất:** Nút tải thêm/phân trang và bộ lọc chưa đọc.

## Bằng chứng chạy thử

Harness được lưu bên ngoài repository tại [probes/access](/Users/admin/.local/share/tuenhi/audits/2026-10-03/probes/access/audit.test.tsx). Chạy từ `/Users/admin/tuenhi`:

```sh
pnpm exec vitest run --config /Users/admin/.local/share/tuenhi/audits/2026-10-03/probes/access/vitest.config.mts
```

Kết quả trước khi sao chép harness: 5/5 assertion về hành vi an toàn thất bại, xác nhận cache không được xóa, dữ liệu thông báo lộ giữa hai phiên, danh tính cũ được giữ khi đổi Auth user, focus modal sai và lỗi tải cấu hình bị che thành loading. Đây là các regression probe chủ động tìm lỗi, **không phải** 5 lỗi trong bộ test baseline của dự án.

## Cải thiện trải nghiệm, tách khỏi lỗi

- Hiện quyền **thực sự được cấp** theo từng nhân viên, nhóm theo công việc. “Theo vai trò” hiện không cho chủ cửa hàng biết quyền đang bật hay tắt dù API có default flags.
- Giữ các thông báo lỗi nghiệp vụ an toàn, cụ thể trong thao tác nhân viên; ví dụ giải thích không thể khóa chủ cửa hàng cuối cùng thay vì chỉ “thử lại”.
- Thêm xem trước logo, xóa logo và cảnh báo form cấu hình chưa lưu.
- Sau đăng nhập, quay lại trang người dùng đã định mở: RequireSession có lưu `state.from`, LoginPage hiện luôn chuyển về `/`.
- Màn lỗi kiểm tra phiên cần nút thử lại và quay về đăng nhập, thay vì chỉ có alert.
- Kiểm tra PWA riêng theo tình huống: mở lạnh khi mất mạng, kết nối lại, triển khai phiên bản mới khi còn phiếu/form chưa lưu, tải route lazy sau triển khai, bảo toàn dữ liệu đang nhập. Chưa chứng minh được một lỗi mất dữ liệu do cập nhật PWA.

## Phạm vi còn thiếu và quan sát backend

Migration warehouse-viewer cuối cùng áp dụng allowlist trước permission override; backend kiểm tra profile hiện tại và trạng thái hoạt động. Chưa phát hiện bypass nâng quyền ở phạm vi này. Định nghĩa `set_staff_active` cuối cùng nằm trong `20260822043801_fix_staff_variable_conflicts.sql`; finalizer được thay bằng `20260825021429_phase_1f_b4_staff_access_waiver.sql` và patch viewer trong `20261002091429_warehouse_viewer_access.sql`.

Các test auth/notification hiện có chưa kiểm tra cách ly cache khi đổi tài khoản hoặc tương tác bàn phím modal đầy đủ. StoreSettingsPage chưa có page test. Không chạy auth E2E vì chúng tạo/xóa tài khoản Cloud. Chưa xác minh gửi email/redirect khôi phục mật khẩu, đối soát ban Auth thực, nâng cấp PWA đã cài và accessibility trên thiết bị thật.
