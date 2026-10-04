# Tuệ Nhi — Next Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Nếu người dùng chọn subagent, dùng superpowers:subagent-driven-development. Các bước dùng checkbox để theo dõi.

**Goal:** Hoàn tất nghiệm thu hai mục nhân viên còn lại và giảm thao tác bán hàng bằng các PR nhỏ, có kết quả đo được.

**Architecture:** Tiếp tục React/Supabase hiện có. Tách nghiệm thu Auth khỏi các tiện ích POS để việc chờ nhân viên thật không chặn cải tiến bán hàng. Dùng lại tìm kiếm phía server, idempotency, snapshot/lease, phân trang và ngữ cảnh phiếu nhập đã có.

**Tech Stack:** React 19, TypeScript, TanStack Query, Supabase/PostgreSQL, Vitest, Playwright; Supabase local qua container runtime cho tích hợp Auth.

**Spec:** `docs/superpowers/specs/2026-10-03-tuenhi-audit-remediation-design.md`, mục Nhân viên và Tiện ích; `docs/superpowers/plans/2026-10-03-tuenhi-audit-rollout.md`, mục Đợt tiện ích. Các quyết định chi tiết dưới đây là đề xuất ngày 04/10/2026, chưa triển khai trong lượt lập kế hoạch này.

## Trạng thái làm căn cứ

- PR #2 và #3 đã merge; release production `e9d8bc28b524b2b911bb31e671c5a774f622efeb`: 15/17 mục audit, 56 migration, 577 test và public smoke desktop/mobile 2/2 tại lần phát hành 03/10/2026. Đây là bằng chứng lần phát hành trước, không phải bộ test vừa chạy lại ngày 04/10.
- PR #4 còn OPEN/DRAFT, head `715480db6e90c4c6db76e817fa138f51fcebdefd`, base main. Code A14–A15 đã có; 611 test và review được ghi nhận ở vòng trước. Chưa áp dụng migration R8, chưa deploy hai Edge mới, chưa UAT Auth thật.
- Một số tài liệu trong PR #4 còn ghi production `065b3d2`/54 migration/ba migration chờ; các con số đó đã cũ. Dùng manifest phát hành và trạng thái remote, không tiếp tục từ dry-run cũ.
- Hiện chỉ có Supabase production. Docker CLI có trên máy nhưng daemon chưa chạy khi kiểm tra ngày 04/10. Chưa khởi động/cài đặt môi trường hay thay production trong lượt này.
- Tham chiếu bằng chứng: `/Users/admin/.local/share/tuenhi/releases/2026-10-03-audit-r1-r7/release-report.json`.

## Global Constraints

- Một cửa hàng, một kho logic; giữ React/TypeScript, TanStack Query và Supabase hiện có; không thêm dependency mặc định.
- Không tạo/xóa giao dịch thử trên Supabase production; fixture chỉ chạy ở PostgreSQL cô lập hoặc môi trường test riêng đã kiểm tra danh tính.
- Giữ nguyên phân quyền server, idempotency, version check, chứng từ chuyển khoản và ledger; tiền dùng chuỗi canonical/BigInt, không cộng tiền bằng float.
- Migration mới additive, sinh bằng Supabase CLI sau khi đọc `--help`; không sửa migration đã áp dụng, không tự sửa sổ tiền/tồn lịch sử.
- Giữ nháp/in tạm không tác động tiền/tồn; không lưu mật khẩu, ảnh chứng từ hoặc dữ liệu riêng tư mới vào localStorage.
- Mỗi task: test thất bại trước → sửa tối thiểu → test đạt → review diff → commit chỉ các file thuộc task.
- Hoàn tất gói: `pnpm check`, SQL fixture cần thiết, `pnpm p2:verify:cloud` chỉ đọc, public production smoke khi phát hành; không dùng `pnpm check:full` trên project hiện tại.
- Không có cam kết thời gian trước khi khởi động được môi trường Auth; tiến độ tính theo PR có bằng chứng nghiệm thu.

## Review Focus

- Phiên cũ của nhân viên bị khóa vẫn còn JWT: API phải từ chối thao tác; kiểm ở task 1.
- Tổng phải thu đổi sau khi đã nhập Khách đưa, kể cả phím tắt thanh toán: kiểm ở task 2.
- Mất response khi thêm khách, bấm lại hoặc đổi tài khoản khi đang tạo: kiểm ở task 3.
- Nháp đang mở ở tab khác hoặc đã có phiên bản mới: kiểm ở task 4.
- Bàn phím điện thoại che hành động; tồn bằng đúng ngưỡng hoặc thiếu dữ liệu ngưỡng: kiểm ở task 5–6.

## Thứ tự và lựa chọn

Khuyến nghị hai luồng công việc độc lập, thực hiện tuần tự từng task trong phiên: **nghiệm thu nhân viên** và **tiện ích bán hàng**. PR tiện ích xuất phát từ main, không mang migration/Edge của PR #4. Có thể phát hành tiện ích trước nếu UAT nhân viên chưa có người tham gia.

Hai lựa chọn khác: đợi xong Auth rồi làm mọi tiện ích (dễ theo dõi nhưng chậm giá trị cho quầy); gom tất cả vào một release (ít lần phát hành nhưng khó khoanh lỗi). Không chọn hai cách này.

| Ưu tiên | Gói | Kết quả cho người dùng | Phụ thuộc |
| --- | --- | --- | --- |
| P0 | Kết thúc A14–A15 | Tạo/khóa/mở nhân viên đúng kết quả; lỗi có thể tiếp tục | Auth local + buổi UAT production có kiểm soát |
| P1.1 | Khách đưa / tiền thừa | Biết ngay cần trả khách bao nhiêu | Checkout hiện có |
| P1.2 | Thêm khách tại POS | Hai trường, không rời giỏ hàng | Directory API và quyền customer.manage |
| P1.3 | Nháp dễ nhận biết | Biết đã lưu ở đâu, tìm lại và tiếp tục đúng đơn | Snapshot/lease và danh sách hóa đơn |
| P2.1 | Thao tác mobile | Tổng tiền/nút chính dễ tiếp cận, không bị bàn phím che | Hoàn tất thay đổi POS P1 |
| P2.2 | Trang Cần nhập | Biết mặt hàng thấp tồn và đi tới lập phiếu nhập | Catalog LOW_STOCK và purchase prefill |

## Task 1 — Hoàn tất nghiệm thu và phát hành PR #4

**Files:** Dùng code hiện có trong `src/features/staff/`, `supabase/functions/create-employee/`, `supabase/functions/reactivate-employee/`, `supabase/migrations/20261003153457_add_staff_reactivation_recovery.sql`. Create `scripts/test-staff-auth-local.mjs`, `e2e/staff-auth-local.spec.ts`, `playwright.staff-local.config.ts`, `docs/runbooks/staff-auth-acceptance.md`; cập nhật trạng thái tài liệu audit trong PR #4.

**Interfaces:** Runner chỉ nhận URL loopback `http://127.0.0.1`/`http://localhost` với port local đã xác minh; từ chối Cloud URL trước bất kỳ lệnh tạo user nào. Chạy actual local Auth, Edge và DB; không dùng mocks để gắn nhãn Auth integration đạt. Cấu hình riêng không kế thừa `.env` production hoặc linked project cache. Report chỉ ghi case/status/correlation ID cần thiết, không mật khẩu/token.

- [ ] Đồng bộ PR #4 với main hiện tại, giữ phạm vi staff. Cập nhật docs cũ: hai migration đã live; chỉ migration R8 còn chờ. Chạy lại quality trên commit mới nếu có thay đổi.
- [ ] Kiểm tra runtime bằng `docker info`; khởi động runtime đã cài khi thực thi. Đọc CLI `start --help`, `functions serve --help` trước khi cấu hình; dùng project_id/port riêng. Không reset hoặc seed project Cloud.
- [ ] Viết test guard từ chối URL production và test end-to-end với user chỉ ở local. Chạy lần đầu để thấy thiếu harness/tích hợp; dựng local từ schema/migration, seed Owner/nhân viên giả chỉ ở local. Không restore dữ liệu khách thật.
- [ ] Nghiệm thu local: Owner tạo một user → đúng một Auth user/profile → lần đầu bắt đổi mật khẩu → đăng nhập sau đổi → khóa → đăng nhập mới và phiên cũ bị chặn ở API nghiệp vụ → mở lại → đăng nhập được với đúng role. Kiểm nhân viên kho xem tồn nhưng không doanh thu/ghi tồn; non-Owner không gọi quản trị staff được.
- [ ] Giữ các test fault đã có: Auth tạo xong nhưng finalize lỗi; unban lỗi sau profile active; retry/reload cùng key; sai Owner/target/stale marker. Nếu tiêm lỗi local để tích hợp phục hồi, thực hiện qua proxy/harness local, không đưa công tắc gây lỗi vào production.
- [ ] Chạy `pnpm exec vitest run src/features/staff src/testing/staff-create-handler.test.ts src/testing/staff-reactivate-handler.test.ts`; chạy `node scripts/test-staff-auth-local.mjs` và `pnpm exec playwright test --config playwright.staff-local.config.ts`; PASS tất cả ca, không outbound Cloud. Chạy `pnpm check`, SQL recovery/ACL và Edge typecheck theo hướng dẫn hiện có.
- [ ] Commit harness/runbook và sửa phát hiện nếu có; không viết lại phần staff đã hoàn tất chỉ để lặp quy trình TDD.
- [ ] Chuẩn bị UAT production: anh chỉ định tên/email/vai trò của **nhân viên thật cần được cấp tài khoản**, thống nhất lúc khóa/mở để không ngắt công việc; người đó tự nhập mật khẩu. Chưa có người thì giữ PR draft, tiếp tục task 2.
- [ ] Release candidate: backup mới; xác minh project/lifecycle/quyền; `db push --dry-run` chỉ có migration R8 nếu không phát sinh thay đổi đã review khác. Triển khai DB → Edge create-employee/reactivate-employee → frontend theo commit duyệt. Duy trì JWT verification, Owner checks và tương thích client cũ.
- [ ] Phân biệt hai mốc: local Auth PASS là điều kiện trước release; buổi nhân viên thật là nghiệm thu sau triển khai có kiểm soát. Không tuyên bố UAT code mới trên production trước khi nó được deploy. Đọc policy hiện hành; nếu đang BLOCKED phải giải quyết điều kiện vận hành, không tự đổi lifecycle/policy để vượt chặn.
- [ ] Chạy cloud gate chỉ đọc, production smoke, xác minh Edge version/commit. UAT cùng nhân viên thật: tạo → đổi mật khẩu → khóa → thử phiên cũ/đăng nhập mới → mở lại. Không chèn đơn hàng giả, không xóa tài khoản nhân viên sau UAT.
- [ ] Nếu runtime local không khả dụng: ghi đúng lỗi và tiếp tục tiện ích; phương án thay thế là project test riêng khi được bố trí, không tự mua/tạo Cloud project. Local PASS không thay thế xác minh cấu hình Auth/redirect/policy Cloud.

## Task 2 — Khách đưa và tiền thừa (PR tiện ích đầu tiên)

**Files:** Create `src/features/sales/model/cash-change.ts`, `cash-change.test.ts`; Modify `src/features/sales/components/CheckoutDialog.tsx`, `CheckoutDialog.test.tsx`; kiểm tra hồi quy `src/features/sales/hooks/use-pos-commands.test.tsx`.

**Interfaces:** `calculateCashChange(total: string, tendered: string): {status: 'EMPTY' | 'INVALID' | 'INSUFFICIENT' | 'SUFFICIENT'; change: string | null; shortfall: string | null}`. Input canonical, tính bằng BigInt đơn vị nhỏ nhất; không parse float. Chỉ hiển thị khi CASH. Giá trị nằm trong dialog, không persist. Giữ `onConfirm(proofFile?: File)` và payload thanh toán hiện có.

- [ ] Test: total `274000`, tendered `300000` → SUFFICIENT/change `26000`; `200000` → INSUFFICIENT/shortfall `74000`; rỗng → EMPTY; âm/sai định dạng → INVALID. Test số vượt giới hạn Number an toàn và phần thập phân hợp lệ theo MONEY_FINAL.
- [ ] Chạy `pnpm exec vitest run src/features/sales/model/cash-change.test.ts` thấy đỏ; implement helper và chạy xanh.
- [ ] Thêm ô tùy chọn “Khách đưa”, hiển thị “Tiền thừa” hoặc “Còn thiếu”. Rỗng giữ hành vi tiền mặt cũ; đã nhập mà thiếu/không hợp lệ thì chặn cả nút lẫn Ctrl/Cmd+Enter. Đổi tổng tính lại ngay; đổi phương thức xóa giá trị hỗ trợ.
- [ ] Test dialog: tổng tăng sau nhập; chuyển CASH/BANK_TRANSFER; proof vẫn bắt buộc; double-click/saving không gửi lại. Xác nhận số ghi nhận vào hóa đơn vẫn là tiền phải thu, không phải tiền khách đưa.
- [ ] Chạy `pnpm exec vitest run src/features/sales`; quality/review/commit `feat(sales): show cash change at checkout`. Nghiệm thu: nhập một số là thấy tiền thừa, không thêm bước bắt buộc vào checkout cũ. Không cần migration.

## Task 3 — Thêm khách ngay tại POS

**Files:** Create `src/features/sales/components/QuickCustomerDialog.tsx`, `QuickCustomerDialog.test.tsx`; Modify `CustomerPicker.tsx`, `CustomerPicker.test.tsx`; dùng `src/features/directories/api/directory-api.ts`, `model/directory-validation.ts`, `src/shared/lib/phone/normalize-phone.ts`; integration test `src/features/sales/pages/PosPage.test.tsx`.

**Interfaces:** Dialog props `{open:boolean; onClose:()=>void; onCreated:(customer:CustomerItem)=>void}`. Dùng API saveCustomer/validator/idempotency hiện có; không tạo API ghi bỏ qua quyền. Hai trường Tên (bắt buộc), SĐT (tùy chọn; nếu nhập phải hợp lệ); loại mặc định INDIVIDUAL, trường phụ dùng giá trị rỗng hợp lệ.

- [ ] Test đỏ: có quyền customer.manage mới thấy Thêm khách; mở/đóng không mất giỏ; tạo thành công chọn đúng ID vừa tạo và focus quay về tìm hàng; tạo lỗi giữ form.
- [ ] Chuẩn hóa SĐT VN, tìm trước qua server; khi trùng chính xác SĐT chuẩn hóa, gợi ý chọn khách cũ, không tự gộp hoặc ghi đè. Cảnh báo phía UI không được mô tả như ràng buộc unique toàn DB.
- [ ] Giữ một key cho retry cùng payload; pending không đổi payload hoặc bấm tạo lần nữa. Mất response giữ trạng thái chưa rõ, tra cứu/thử lại cùng operation; không tự tạo key mới. Test số `09...` và `+849...`, mạng chậm, hai click, đổi tài khoản, hủy dialog.
- [ ] Chạy test component + POS + directory, quality/review/commit `feat(sales): create customers without leaving the cart`. Mục tiêu: mở → nhập tối đa hai trường → lưu và tự chọn; không điều hướng trang và không thêm bước khi bán khách lẻ. Không thêm migration mặc định.

## Task 4 — Nháp dễ nhận biết và tiếp tục

**Files:** Modify `src/features/sales/pages/SalesListPage.tsx`, `PosPage.tsx`; Create `src/features/sales/components/PosDraftStatus.tsx`, `PosDraftStatus.test.tsx`; dùng `model/pos-storage.ts`/tests và `api/sales-schemas.ts` hiện có.

**Interfaces:** Trạng thái UI phân biệt “Chỉ lưu trên máy này”, “Đã lưu lên hệ thống”, “Có thay đổi chưa lưu”, “Đang lưu”, “Lưu chưa thành công”. Không gọi local snapshot là nháp đã đồng bộ. Hiển thị ID rút gọn chỉ để nhận diện; link/lease vẫn dùng UUID đầy đủ.

- [ ] Test đỏ: lưu thất bại không chuyển nhãn thành đã lưu; reload local snapshot; nháp server đổi version; tab khác đang giữ lease; logout/user switch không thấy nháp người trước.
- [ ] Thêm lối “Đơn nháp” vào danh sách lọc DRAFT hiện có; hiển thị tên khách hoặc Khách lẻ, thời gian và người tạo đã có trong DTO. Không tự tải detail từng dòng để lấy số món. Số món ở danh sách hoãn nếu cần đổi contract; POS đã có giỏ thì hiển thị trực tiếp.
- [ ] Render cập nhật thời điểm đúng nguồn (sortAt danh sách, updatedAt detail); mở nháp không tự thanh toán/trừ tồn. Tận dụng snapshot/lease, không xây autosave server mới.
- [ ] Chạy POS/storage/list tests và quality; review/commit `feat(sales): clarify draft saving and resume`. Mục tiêu: vào danh sách nháp từ POS một thao tác, mở nháp một thao tác; không tăng lần lưu bắt buộc.

## Task 5 — POS mobile và bàn phím

**Files:** Modify `src/features/sales/components/CartPanel.tsx`, `CheckoutDialog.tsx`, `src/features/sales/pages/PosPage.tsx`; Create `e2e/pos-mobile-local.spec.ts` dùng fixture/API local; tests component tương ứng.

- [ ] Đo baseline và chụp cùng giỏ local ở 390×844/360×800; kiểm thanh điều hướng đáy, dialog, zoom 200%, bàn phím ảo thực tế. Không dùng giỏ đang mở trên production để diễn tập.
- [ ] Bố trí vùng tổng tiền/hành động gọn; dành chỗ cho bottom navigation/safe-area, scroll được với bàn phím. Thu gọn trường phụ nhưng không ẩn lỗi validation; không đổi quyền, required fields hoặc xác nhận thanh toán.
- [ ] Test thao tác focus, Tab/Shift+Tab/Escape, IME tiếng Việt, tổng tiền đổi, offline/saving, chạm hai lần. Test giỏ dài 20 dòng; input và nút xác nhận không bị che/không cuộn ngang.
- [ ] Chạy component/Playwright local và quality; nghiệm thu iPhone Safari/PWA trên thiết bị thật trước khi ghi đã đạt phần bàn phím thực. Nếu chưa có thiết bị, ghi giới hạn riêng; Chromium mô phỏng không thay thế được.
- [ ] Review/commit `feat(sales): improve mobile checkout controls`; đo số lần cuộn tìm nút thanh toán giảm, không thêm thao tác so với desktop.

## Task 6 — Trang Cần nhập, bản tối thiểu

**Files:** Create `src/features/inventory/replenishment/pages/ReplenishmentPage.tsx`, `ReplenishmentPage.test.tsx`; Modify `src/app/routes/operation-routes.tsx`, `src/app/pages/MorePage.tsx`; dùng `src/features/catalog/api/catalog-api.ts`, `src/features/inventory/purchase/pages/PurchaseDetailPage.tsx`, `components/PurchasePrefillIntent.tsx` và test hiện có.

**Interfaces:** Route `/more/replenishment`; đọc `get_product_catalog` qua API hiện có với `stockState:'LOW_STOCK'`, phân trang server. Thiếu tới ngưỡng = max(0, effectiveMinStockQty − onHandQty), chuỗi số nguyên/BigInt. Thiếu effectiveMinStockQty thì hiện “Chưa xác định”, không suy ngưỡng từ trường cấu hình có semantics khác. Không coi gợi ý này là dự báo nhu cầu.

- [ ] Test đỏ: tồn49/ngưỡng50 hiện thiếu1; tồn50 không thuộc thấp tồn; nhiều trang; inactive không được gợi ý; permission kho chỉ xem không thấy giá vốn/doanh thu và không lập phiếu.
- [ ] Hiển thị tên/SKU/đơn vị/tồn/ngưỡng/thiếu; quyền đọc theo inventory hiện có, quyền tạo phiếu kiểm cả server. Một click Lập phiếu nhập đi tới `/more/purchases/new?productId=...`; dùng prefill hiện có, chưa lưu/ghi sổ. Không tự sửa chứng từ có sẵn.
- [ ] Bản đầu chưa tự chọn NCC gần nhất hoặc số lượng nhập; người dùng xác nhận trong phiếu. NCC gần nhất cần đọc lịch sử và quyền riêng, đưa sang PR sau khi chốt quy tắc chọn từ phiếu đã ghi sổ. Không thêm truy vấn N+1 vào danh sách.
- [ ] Test prefill không tạo stock movement/receipt, refresh không nhân dòng, sản phẩm vừa inactive/mất quyền báo lỗi có đường quay lại; chạy catalog/purchase/replenishment tests + quality; review/commit `feat(inventory): add low stock replenishment view`.

## Phát hành và dừng sự cố

- Mỗi tiện ích một PR từ main; không gom code staff chưa đạt gate. Review cuối dựa trên diff thực và exact commit, không chỉ đếm test.
- Frontend-only: quality → preview với API test/local → merge/deploy theo phạm vi duyệt → smoke public + đối chiếu deployment assets. Preview dùng DB production vẫn là production về dữ liệu.
- Có migration/Edge: backup mới và inventory thay đổi → dry-run đúng danh sách → DB → Edge → frontend → cloud read-only assertions → kiểm tra tương thích client đang cài. Không dùng số lượng migration dự kiến thay đối chiếu tên thực tế.
- Trước rollback staff: kiểm tra pending operations; không tự xóa user/profile hoặc đảo ledger. Nếu Auth sai quyền/trạng thái, dừng thao tác staff mới, giữ bằng chứng/correlation ID, sửa tiếp theo có mục tiêu. Rollback UI cũ có thể che pending; không coi đó là phục hồi đầy đủ.
- Tiện ích lỗi: quay frontend về commit tương thích đã xác minh, không rollback migration bằng cách xóa dữ liệu. Không tự reload tab còn form chưa lưu.
- Bàn giao mỗi PR ghi trước/sau, test đã chạy, giới hạn thiết bị, commit/version production, bước đối soát. Không gọi public smoke là kiểm thử giao dịch đầy đủ.

## Cần đầu vào khi tới nghiệm thu

Chỉ phần staff cần anh chỉ định nhân viên thật (tên/email/vai trò) và thời điểm thử khóa/mở. Các tiện ích có thể triển khai, test local và chuẩn bị PR trước khi có thông tin này. Không cần gửi mật khẩu vào chat. Nghiệm thu iPhone/máy in sẽ dùng thiết bị đang vận hành khi có người hỗ trợ; không ghi PASS thay cho việc chưa chạy.

## Nguồn và tự rà kế hoạch

- Đã đối chiếu PR #2/#3 MERGED, #4 DRAFT; code hiện có cho CustomerPicker, CheckoutDialog, POS storage, sales list DTO, catalog threshold và purchase prefill.
- Supabase hỗ trợ local Auth/Postgres/Storage qua CLI và container runtime: https://supabase.com/docs/guides/local-development (đọc ngày 04/10/2026). Đây là cơ sở chọn môi trường thử local; không khẳng định cấu hình hiện tại đã khởi động được.
- Đủ A14–A15 và năm nhóm tiện ích trước đây. Chủ động thu nhỏ bản đầu: số món ở danh sách nháp, NCC gần nhất/gợi ý lượng nhập nâng cao và gộp thông báo nằm ngoài sáu task này.
- Tất cả năm Review Focus có ca nghiệm thu tương ứng. Đã phân biệt local Auth, production deployment và production UAT, tránh vòng phụ thuộc đòi test code chưa deploy.
