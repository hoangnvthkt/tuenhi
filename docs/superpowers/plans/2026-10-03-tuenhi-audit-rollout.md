# Tuệ Nhi — Audit Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Nếu người dùng chọn thực thi qua subagent, dùng superpowers:subagent-driven-development. Các bước dùng checkbox để theo dõi.

**Goal:** Khắc phục 17 điểm audit theo các release nhỏ, sau đó cải thiện thao tác thường dùng.

**Architecture:** Giữ kiến trúc hiện hành. Các kế hoạch con định nghĩa task có test riêng; master quyết định phụ thuộc, release và nghiệm thu.

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

- Giá thay đổi hai lần hoặc cùng tổng nhưng khác từng dòng → kế hoạch an toàn task 2.
- Chuyển tài khoản trong khi request cũ đang bay → kế hoạch an toàn task 1.
- Hai yêu cầu trả cùng tranh lượng còn lại → kế hoạch an toàn task 4.
- Client PWA cũ gặp response cursor mới → kế hoạch thao tác task 2.
- Auth đã thành công nhưng response/một bước sau mất → kế hoạch nhân viên task 1–2.

## Phạm vi, thứ tự và đầu ra

| Đợt | Phạm vi | PR đề xuất | Điều kiện xong |
| --- | --- | --- | --- |
| 1 — Chính xác và an toàn | A01–A08, gồm cả lỗi trả hàng mức P2 liên quan | R1 phiên/cache; R2 checkout; R3 phiếu kho; R4 trả hàng | Các ca sai đã tái hiện chuyển thành test đạt; tiền/tồn đúng, quyền đúng |
| 2 — Tìm và thao tác | A09–A13, A16–A17 | R5 chọn/tìm và snapshot; R6 phân trang; R7 form/modal/lỗi | Mọi bản ghi được phép đều tìm được; không lặp trang, mất form hoặc kẹt tải |
| 3 — Phục hồi quản trị | A14–A15 | R8 nhân viên/Auth | Không tạo trùng tài khoản, không báo thành công giả; lỗi có đường phục hồi |
| 4 — Tiện ích | Khách nhanh, nháp rõ, mobile, tiền thừa, trang cần nhập | Mỗi tiện ích một PR sau thiết kế luồng ngắn | Đo trước/sau; không tăng thao tác ở luồng bán cơ bản |

R1–R4 độc lập ở mức phát hành; thực hiện lần lượt để review và tránh sửa cùng hook/form. R5/R6 dùng cách ly cache từ R1. R7 bảo vệ form trước khi thêm các tiện ích. R8 có thể đẩy lên trước đợt 2 nếu sắp mở tài khoản nhân viên; đề xuất mặc định ưu tiên lỗi đang tác động bán hàng trước. Phát hành từng PR đạt điều kiện, không đợi gom cả đợt nếu bản sửa độc lập.

Kế hoạch con:

- [An toàn nghiệp vụ](/Users/admin/tuenhi/docs/superpowers/plans/2026-10-03-tuenhi-safety-fixes.md).
- [Thao tác và tra cứu](/Users/admin/tuenhi/docs/superpowers/plans/2026-10-03-tuenhi-daily-workflows.md).
- [Phục hồi quản trị](/Users/admin/tuenhi/docs/superpowers/plans/2026-10-03-tuenhi-staff-recovery.md).

## Đối chiếu đủ 17 mục audit

| Mục audit | Task thực hiện |
| --- | --- |
| A01 | An toàn task 2 / R2 |
| A02, A03 | An toàn task 3 / R3 |
| A04 | An toàn task 1 / R1 |
| A05, A06, A07, A08 | An toàn task 4 / R4 |
| A09, A12 | Thao tác task 1 / R5 |
| A10, A11 | Thao tác task 2 / R6 |
| A13 | Thao tác task 3 / R7a |
| A14 | Nhân viên task 1 / R8a |
| A15 | Nhân viên task 2 / R8b |
| A16, A17 | Thao tác task 4 / R7b |

## Chuẩn bị thực thi

- [ ] Đọc audit, spec và đúng kế hoạch con; kiểm tra HEAD, working tree, hướng dẫn repo và artifact/worktree đang gắn.
- [ ] Tạo/reuse worktree quản lý phù hợp, branch `codex/tuenhi-audit-<goi>`; không trộn các tài liệu audit chưa commit vào thay đổi sản phẩm ngoài ý muốn.
- [ ] Chuyển probe từ `/Users/admin/.local/share/tuenhi/audits/2026-10-03/probes/` thành regression kỳ vọng đúng. Không đưa nguyên probe “assert lỗi” vào suite rồi gọi là đạt.
- [ ] Chuẩn hóa bootstrap native PostgreSQL 17 cô lập từ schema/quyền và migration: Unix socket, tên DB cho phép, không copy rows thật; fail khi restore thiếu dependency, không dùng snapshot restore lỗi như bằng chứng toàn hệ thống.
- [ ] Mỗi PR chỉ sửa phạm vi chỉ định; tài liệu release nêu A-ID, hành vi trước/sau, test và giới hạn.

## Test và nghiệm thu

| Lớp | Điều kiện |
| --- | --- |
| Regression | Test từng A-ID đỏ trên mã cũ, xanh trên mã sửa; có no-side-effect assertions cho in/nháp/hủy yêu cầu |
| SQL | Schema/permission fixture đầy đủ, migration theo thứ tự; tiền/tồn/idempotency/concurrency; không chạy fixture lên Cloud |
| Chất lượng | `pnpm check` đạt; số test chỉ là thống kê, không dùng làm thay thế checklist nghiệp vụ |
| UI giả lập | Desktop + mobile, request chậm/lỗi/mất response, nhập liệu/bàn phím và nút disabled/dirty |
| Tích hợp thật | Auth, Storage, Realtime, upload ảnh/chứng từ ở project test riêng khi cần; đọc project identity trước khi chạy; không chạy historical Cloud E2E trên production |
| Thiết bị | Một máy tính dùng bán hàng và một điện thoại thường dùng; máy in nhiệt, PDF tiếng Việt, bàn phím ảo, refresh/PWA khi đang có nháp |

Project test riêng chưa được tạo trong bước lập phương án. Nếu chưa có, vẫn thực hiện được các bản sửa và test cô lập; báo cáo rõ phần tích hợp Auth/Storage chưa nghiệm thu, không đổi nhãn thành “đã test toàn bộ”. Trước release R8 cần kiểm chứng nhánh phục hồi bằng test handler có dependency giả lập và chạy thử tích hợp riêng hoặc buổi UAT tài khoản Owner kiểm soát đã thống nhất.

## Quy trình phát hành từng PR

- [ ] Chốt commit; review diff/migration, kiểm tra client cũ và mới. Quality gate chạy đúng commit.
- [ ] Trước migration: kiểm tra đúng project, backup mã hóa + kiểm chứng khả năng đọc archive; không gọi kiểm tra danh mục archive là full restore. Đọc thống kê dữ liệu ảnh hưởng và `db push --dry-run` đúng danh sách đã review.
- [ ] Release thứ tự database tương thích → Edge nếu có → frontend cùng gói. R1/R2/R3 có thể frontend-only nếu test backend hiện hành đạt; R4 và phần cursor v2 của R6 có migration.
- [ ] Giữ endpoint cũ trong thời gian PWA còn client cũ; không ép reload mất form. Hiển thị cập nhật và tải lại sau khi đã lưu.
- [ ] `pnpm p2:verify:cloud` chỉ đọc; public smoke desktop/mobile với URL deployment chính xác và domain production; xác nhận commit/Edge version, không chỉ thấy website mở được.
- [ ] Nghiệm thu kịch bản thuộc PR, kiểm tra lỗi và đối chiếu tổng tiền/tồn của các giao dịch Owner chủ động thực hiện. Không chèn giao dịch giả vào production.
- [ ] Bàn giao ghi rõ đã phát hành/chưa phát hành, test nào đạt/chưa làm, điều kiện cần hỗ trợ từ thiết bị thật.

Approval production trước đây gắn với bản sửa phản ánh 02/10. Tài liệu này là phương án mới; không tự dùng approval cũ để coi migration/release A01–A17 đã được duyệt. Khi đến bước phát hành, trình PR/migration/test cụ thể nếu chưa có chỉ đạo triển khai production mới.

## Khi phát hiện sự cố

Dừng release tiếp theo nếu có lệch tiền/tồn, cache khác tài khoản, lỗi cấp quyền, duplicate giao dịch hoặc không thể phục hồi thao tác. Frontend có thể quay về bản tương thích đã xác minh; không rollback sang phiên bản mang lại lỗi P1 nếu không có phương án cô lập luồng lỗi. Với migration, ưu tiên forward fix; không khôi phục CHECK cũ khi dữ liệu hủy mới đã hợp lệ, không xóa ledger, không restore đè mất giao dịch mới. Đối soát lịch sử là một thay đổi dữ liệu có danh sách tác động riêng.

## Đợt tiện ích: phạm vi để thiết kế tiếp

1. Khách nhanh: tìm SĐT/tên trong POS, resolve selected ID, thêm tối thiểu tên+SĐT, cảnh báo trùng, giữ giỏ; phụ thuộc R1/R5/R7.
2. Nháp rõ: mã ngắn/thời gian/người tạo/số món; tận dụng local snapshot/lease hiện có, không tạo một hệ thống autosave mới.
3. Mobile: thanh tổng tiền/hành động không bị bàn phím che; thu gọn trường ít dùng, giữ focus tìm hàng, kiểm thử tại 390px và máy thật.
4. Tiền thừa: trường tùy chọn Khách đưa để trợ giúp tính tiền; nếu dùng thì bắt buộc đủ tiền trước xác nhận, không phát sinh công nợ; không thay số captured bằng số khách đưa.
5. Cần nhập: đọc tồn và ngưỡng hiệu lực hiện tại; xem thiếu bao nhiêu, NCC gần nhất nếu có; một thao tác đi sang phiếu nhập được điền ngữ cảnh, không tự lưu/ghi sổ. Gộp thông báo để đọc, giữ lịch sử và chống lặp hiện có.

Chưa đưa tích hợp nhắn tin, loyalty, đa kho hoặc công nợ vào gói này. Không chốt thời lượng theo giờ khi chưa hoàn tất fixture và điểm phụ thuộc; báo tiến độ theo từng PR có nghiệm thu.

## Handoff

Phương thức khuyến nghị: thực hiện trực tiếp từng task trong phiên làm việc, review độc lập trước merge các thay đổi tiền/tồn/quyền; không mở nhiều nhánh cùng sửa các API dùng chung. Bắt đầu R1 rồi R2; R3/R4 tiếp theo. Đây là kế hoạch đã soạn, chưa phải xác nhận thực thi hoặc deploy.
