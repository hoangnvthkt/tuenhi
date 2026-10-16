# Tuệ Nhi — Audit Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Nếu người dùng chọn thực thi qua subagent, dùng superpowers:subagent-driven-development. Các bước dùng checkbox để theo dõi.

**Goal:** Khắc phục 17 điểm audit theo các release nhỏ, sau đó cải thiện thao tác thường dùng.

**Architecture:** Giữ kiến trúc hiện hành. Các kế hoạch con định nghĩa task có test riêng; master quyết định phụ thuộc, release và nghiệm thu.

**Tech Stack:** React 19, TypeScript, TanStack Query, Supabase/PostgreSQL, Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-10-03-tuenhi-audit-remediation-design.md](/Users/admin/tuenhi/docs/superpowers/specs/2026-10-03-tuenhi-audit-remediation-design.md). Trạng thái cập nhật 03/10/2026: đã triển khai mã cho A01–A17 và review độc lập từng gói; chưa phát hành production. Tiện ích đợt 4 chưa triển khai.


## Bàn giao triển khai ngày 03/10/2026

| Gói | Kết quả mã và kiểm thử | Trạng thái phát hành |
| --- | --- | --- |
| R1–R4 / A01–A08 | Đã review; sửa thêm đối soát thanh toán và chuyển route phiếu kho. 546 test. [PR #2](https://github.com/hoangnvthkt/tuenhi/pull/2) | Chờ duyệt phát hành bản audit mới |
| R5–R7 / A09–A13, A16–A17 | Đã review; sửa cả cache hai bộ lọc thông báo và hiển thị lựa chọn bàn phím. 577 test gồm gói trước. [PR #3](https://github.com/hoangnvthkt/tuenhi/pull/3) | Phụ thuộc R1–R4; chờ phát hành |
| R8 / A14–A15 | Đã review; giữ form khi email trùng và giữ yêu cầu mở đăng nhập khi retry hết quyền. 611 test gồm các gói trước; Deno check hai Edge entrypoint đạt | Giữ draft tới khi nghiệm thu Auth thật; hiện chỉ có production |

`pnpm check` đạt: format, lint, TypeScript, 124 file/611 test, template/font verification và production build. Cảnh báo kích thước các chunk xuất Excel/PDF vẫn là advisory của Vite, không phải lỗi build. Sáu nhóm PostgreSQL cô lập đạt: checkout, phiếu kho, vòng đời trả, phân trang, phục hồi nhân viên và hai yêu cầu trả đồng thời. ACL assertion mới đã chạy ở PostgreSQL cô lập. Đây không phải kiểm thử toàn bộ Supabase Auth/Storage/RLS thực tế.

GitHub CI của PR #2/#3 và Vercel Preview đều đạt tại các commit ghi trên PR. Public smoke Chrome desktop/Pixel 7 trên production hiện hành và preview R5–R7 đạt 2/2 mỗi đích. Browser UAT dialog dùng component thật với API giả lập, chặn mạng ngoài localhost; kiểm tra 20 dòng, cuộn, Tab/ShiftTab/Escape và focus. Chưa dùng iPhone, máy in nhiệt, máy quét thật; chưa kiểm chứng Auth/Storage/Realtime đầu-cuối. Không tạo tài khoản hay chứng từ thử trên production.

Gate chỉ đọc của bản production hiện hành `065b3d2` đạt, 54 migration đã đồng bộ. Gate của nhánh audit xác nhận đúng project/lifecycle rồi dừng tại `migrationList` vì 3 migration mới chưa áp dụng; các assertion audit trên Cloud **chưa chạy**. Không gọi kết quả baseline là gate đạt cho release mới. Production vẫn là `065b3d2`.

### Inventory release và điều kiện nghiệm thu

1. Backup mã hóa và kiểm tra đọc archive; xác minh lại project `ccfhkhtxoruyniwxowrz` và số liệu ảnh hưởng tại thời điểm phát hành. Không xem việc đọc archive là full restore.
2. R4: `20261003123755_fix_return_lifecycle.sql`; R6: `20261003144857_add_operational_list_pagination.sql`. Giữ endpoint cũ cho PWA. Chỉ phát hành frontend R1–R7 sau đúng migration tương ứng.
3. R8: `20261003153457_add_staff_reactivation_recovery.sql` → Edge `create-employee`, `reactivate-employee` (giữ JWT/Owner guards) → frontend. Read-only recovery RPC giữ nguyên reason/audit của operation trước, không ghi lại profile từ marker sau reload.
4. Trước R8, cần môi trường Auth test hoặc tài khoản nhân viên **thật được Owner chỉ định** để nghiệm thu tạo → bắt đổi mật khẩu → khóa → mở lại, kèm ca lỗi phục hồi đã có mocks. Owner xác nhận chỉ có production; chưa có tài khoản được chỉ định, chưa thực hiện bước này.
5. Sau phát hành từng gói, chạy gate mới đúng commit, public smoke domain chính và deployment chính xác, nghiệm thu thiết bị/luồng trong phạm vi. Dừng nếu sai tiền/tồn/quyền; giữ mọi ledger và chứng từ, ưu tiên forward fix DB.

Giới hạn vận hành có chủ đích: thanh toán mất snapshot sau reload và server chưa ghi nhận kết quả cần đối soát hỗ trợ; tạo nhân viên mất response chưa biết ID hoặc Auth orphan cũ cũng cần hỗ trợ. Không lưu thêm mật khẩu, ảnh hay payload thanh toán để tự đoán/gửi lại. Khi resume nhân viên, chỉ Owner đã tạo operation được dùng marker; thay đổi profile sau thao tác mở lại có thể buộc bỏ yêu cầu cũ sau kiểm tra.

### Quyết định đã ghi nhận khi triển khai

- Ruling: Normalize Task N / R headings to Task N: R — task helper requires colon — documentation-only formatting cost.
- Ruling: Checkout snapshot captured when Confirm invokes pay; underlying editor disabled while dialog is open — prevents content changes between shown confirmation and submitted snapshot — cost if wrong: background programmatic changes would require an explicit dialog snapshot later.
- Ruling: Native SQL fixture exercises periodic save/submit/post and frontend covers both opening and periodic dirty guards — shared version guard pattern retained with no SQL changes — cost if wrong: opening-only backend regression needs separate fixture expansion before release.
- Ruling: Use one safety PR with separate R1–R4 commits rather than four merge-dependent PRs — one whole-branch reviewer sees cross-feature boundaries and all fixes share verification — cost if wrong: rollback granularity is one safety release; individual commits remain revertible.
- Ruling: Do not persist proof or payment payload for reload recovery — existing durable marker stores only identity/key, so a lost in-memory snapshot permits read-only outcome lookup and requires support if repeatedly NOT_FOUND — cost: no blind retry after reload, prioritizing correct amount and payment method.
- Ruling: Preserve small initial option loads where existing deep-link hydration consumes them; pickers fetch/search all pages independently — avoids destabilizing prefill while removing first-page selection limit — cost: one redundant initial read, no data loss.
- Ruling: stock count also receives v2 endpoint because legacy parser requires nextCursor=null, matching sales/returns compatibility rule — cost: one extra API wrapper retained until older clients retire.
- Ruling: move cross-feature pagination integration tests to src/testing rather than shared or app modules — preserves architectural dependency restrictions — cost: no feature ownership change.
- Ruling: ProductForm remount key derives from the accepted baseline version, never the latest remote version while dirty — pristine refresh and explicit discard intentionally begin a new form baseline — cost: local-only validation resets on an accepted reload.
- Ruling: save returns saved productID to the editor so it clears its dirty guard before navigating; request carries baseline version and sale price — avoids blocking successful own navigation and avoids overwriting unseen remote edits.
- Ruling: notification uses native dialog locally (one consumer), no shared modal framework — smallest implementation with real background blocking — cost: supported browser must implement HTMLDialogElement.showModal (current Chromium verified; no live iOS Safari test).
- Final: Ruling: Re-grade missing keyboard highlight/scroll Important — selecting a product that is not visibly identified can put the wrong item on a sale/purchase; accuracy is central to the approved goal — cost: a small extra UI behavior patch and regression test.
- Final: Ruling: Reviewer declined R8, separately-reviewed R1–R4, live deployment/authenticated Cloud/iOS Safari — preserve assigned boundaries and record those runtime checks as unverified, not release evidence — cost: these need their own release/UAT gates.
- Task 1: Ruling: Resume contains only key/target ID and reconstructs immutable email/name/role from server-owned Auth app_metadata bound to the creating Owner — allows password-free reload with no persisted private form data and rejects arbitrary/legacy pending IDs — cost: older orphan Auth accounts require support; metadata lasts on Auth record.
- Task 1: Ruling: Unknown response without target ID remains blocked after read-only staff-list lookup and shows operation ID for support — no reliable server lookup exists for an Auth account with no profile — cost: manual reconciliation rather than blind duplicate create.
- Task 1: Ruling: Enable allowImportingTsExtensions under noEmit for pure Edge handler imports in Vitest/typecheck — Deno uses explicit .ts imports; no new runtime dependency — cost: TypeScript setting broadens accepted import syntax.
- Task 2: Ruling: Add Owner-only read-only get_staff_reactivation_recovery RPC and minimal resume flag — after reload the original private reason is not persisted; the stored profile command owns the reason/audit, and resume only checks its actor/key/target plus unchanged current profile before Auth unban — cost: one additive migration and strict profile timestamp gate may require a new reviewed operation after unrelated profile edits.
- Task 2: Ruling: Auth transport/ban errors return partial state; reactivation marker persists IDs only, same-session retry keeps original reason, reload never replays a missing profile command — cost: unknown operations not recorded by the DB require support reconciliation rather than a blind request.
- Task 2: Ruling: No Cloud Auth fixture integration on PRODUCTION/OWNER_WAIVER — complete mock fault tests and isolated PostgreSQL guards, keep real create/password-change/lock/reactivate as explicit release gate in a test project or authorized Owner UAT — cost: R8 cannot be declared Auth-integration verified or production-ready yet.
- Final: Ruling: Reviewer declined live Auth, legacy orphans/unknown-target support, existing staff pagination/deactivation backend and previously-reviewed safety/daily — retain assigned boundary and pending real-Auth UAT; no pagination or deactivation redesign in R8 — cost: staff feed remains first50, old orphan/unknown ID needs support, complete Auth behavior remains unverified until UAT.

Không còn finding Critical/Important chưa xử lý trong ba lượt review; không có minor bị hoãn. Các giới hạn nghiệm thu bên trên vẫn là điều kiện release, không phải bằng chứng đã đạt.

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
