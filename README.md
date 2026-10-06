# Tuệ Nhi — Bán hàng & Kho

## Phạm vi sản phẩm

Tuệ Nhi là ứng dụng nội bộ cho một cửa hàng và một kho logic duy nhất. Giai đoạn nền tảng không theo dõi lô hàng hoặc hạn sử dụng.

## Yêu cầu

Cần Node.js 24.13.1 và pnpm 11.19.0.

## Lệnh frontend cục bộ

```bash
pnpm install
pnpm dev
pnpm check
pnpm check:full
```

`pnpm check` là quality gate local hiện hành. `pnpm check:full` và
`pnpm test:e2e` có dùng tài khoản Cloud là lệnh lịch sử PRE_PRODUCTION, không
được chạy trên project hiện tại. Luôn nạp biến `VITE_*` trước `pnpm build` vì
Vite ghi cấu hình public vào bundle tại thời điểm build.

Các mẫu Excel chính thức được sinh từ code, không sửa tay:

```bash
pnpm templates:generate
pnpm templates:verify
```

Năm file hợp lệ duy nhất trong `public/templates/import` là nhóm hàng v1, sản phẩm v1, nhà cung cấp v1 và khách hàng v1/v2. Mẫu khách hàng v2 là mẫu hiện hành; v1 vẫn được nhận để tương thích.

## Biến môi trường

Chỉ hai biến an toàn cho browser bundle là `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`. Ba biến chỉ dành cho Supabase CLI là `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` và `SUPABASE_PROJECT_ID`; không đặt chúng trong frontend hoặc browser bundle.

## Phase 2 — Controlled development hiện hành

Project Supabase Free hiện tại được dùng như `CONTROLLED_DEVELOPMENT_UAT` nhưng
giữ lifecycle kỹ thuật `PRODUCTION`. Owner tự nhập dữ liệu test qua UI; không
chạy automation tạo/xóa dữ liệu. Các runner bị chặn fail-closed bằng mã
`PRODUCTION_TEST_DATA_FORBIDDEN`.

Release gate chuẩn, chỉ đọc Cloud:

```bash
pnpm p2:release:verify
```

Không chạy `test:cloud:*`, Cloud E2E có credential, `cutover:preflight`,
`cutover:cleanup-tests`, cleanup RPC, lifecycle mutation, bootstrap Owner hoặc
`db push` nếu increment chưa có migration additive được duyệt. Quy trình nền
tảng nằm tại
[runbook P2.0](docs/runbooks/phase-2-p2-0-controlled-development.md).

### P2.1 — Daily workflow productivity

P2.1 là increment frontend-only: giỏ POS có snapshot V2 và quyền sửa một tab,
luồng tìm hàng bằng bàn phím, đối soát pending financial command chỉ đọc, cùng
tra cứu/action hóa đơn rút gọn. Increment này không có migration, không
regenerate Supabase types và không thêm dependency.

Sau `pnpm p2:release:verify` và public production smoke, Owner thực hiện UAT thủ
công theo [runbook P2.1](docs/runbooks/phase-2-p2-1-daily-workflow-productivity.md).
Không dùng camera barcode; máy quét USB/Bluetooth chỉ hoạt động như bàn phím.

### P2.2 — Connected Business Explorer

P2.2 nối hai chiều **Sản phẩm ↔ Nhà cung cấp ↔ Phiếu nhập** bằng Context Hub.
Quan hệ, KPI, số lượng và lịch sử mua chỉ được suy ra từ phiếu nhập đang có
trạng thái `POSTED`; phiếu không có Nhà cung cấp vẫn thuộc lịch sử sản phẩm
nhưng không tạo quan hệ Nhà cung cấp. Giá nhập được kiểm soát server-side và
luôn trả `null` khi người dùng thiếu `purchase.cost.read`.

Các deeplink `focusProduct`, `productId` và `supplierId` chỉ điền sẵn ngữ cảnh
local. Chúng không tự thêm vào giỏ, tạo draft, lưu, ghi sổ hoặc sinh
idempotency key. Migration P2.2 là additive và Cloud assertion chỉ đọc đã được
gắn vào `pnpm p2:release:verify`. Quy trình release, Owner UAT và rollback nằm
tại [runbook P2.2](docs/runbooks/phase-2-p2-2-connected-business-explorer.md).

### P2.3 — Customer Purchase History

P2.3 mở rộng Connected Explorer thành **Khách hàng ↔ Hóa đơn ↔ Phiếu trả ↔
Sản phẩm**. Hồ sơ, KPI và lịch sử chỉ dùng chứng từ sales/returns vận hành hiện
hành cùng financial-event ledger; `legacy_sales` không được đưa vào read model.
Scope `ALL/OWN/NONE` được áp dụng trong database và API không trả giá vốn, COGS
hoặc lợi nhuận.

Deeplink `customerId` tới POS chỉ điền sẵn khi giỏ trống, tab giữ editor lease
và người dùng chưa đổi lựa chọn trong lúc lookup. Nếu đã có khách khác, hệ thống
yêu cầu xác nhận; deeplink không tự lưu, tạo draft hoặc chạy command tài chính.
Migration P2.3 là additive, assertion Cloud chỉ đọc được gắn vào
`pnpm p2:release:verify`. Chi tiết release/UAT/rollback nằm tại
[runbook P2.3](docs/runbooks/phase-2-p2-3-customer-purchase-history.md).

## Phản ánh khách hàng 02/10/2026

Bổ sung in tạm tính, sửa/hủy phiếu nhập và chọn/sửa nhà cung cấp trong phiếu,
vai trò kho chỉ xem, cảnh báo tồn dưới ngưỡng. Thứ tự ba migration, Edge Function,
frontend và checklist UAT nằm tại
[runbook phản ánh khách hàng](docs/runbooks/2026-10-02-customer-feedback-fixes.md).
Các fixture ghi dữ liệu chỉ chạy trên PostgreSQL tạm local; release gate Cloud
chỉ chạy assertion read-only. Migration vẫn cần Owner duyệt trước khi apply.

## Quy trình cloud — migration đã được duyệt

Không dùng Supabase local hoặc Docker. Mọi lệnh migration chạy trên project Cloud đã link và phải nạp `.env` từ vị trí an toàn mà không in giá trị ra terminal:

Các ví dụ `db push` dưới đây chỉ áp dụng cho increment có spec/plan migration
additive và phê duyệt riêng; không phải hướng dẫn chạy trong P2.0.

```bash
set -a
source "$TUENHI_ENV_FILE"
set +a

pnpm exec supabase migration list --linked
pnpm exec supabase db advisors --linked --type security --level error --fail-on error
pnpm exec supabase db push --linked --dry-run
pnpm exec supabase db push --linked
pnpm cloud:verify:phase1a
pnpm cloud:verify:phase1b
pnpm supabase:types
```

Migration phải được tạo bằng `pnpm exec supabase migration new <tên>` và review trước khi push. Data API của ứng dụng chỉ expose schema `api`; `app_private` không được expose và không cấp direct table privilege cho browser roles.

## Kiểm thử bảo mật trên Cloud — Lịch sử PRE_PRODUCTION

Toàn bộ phần này mô tả runner lịch sử trước cutover. Không chạy các lệnh bên
dưới khi lifecycle là `OWNER_PILOT` hoặc `PRODUCTION`.

Hai lệnh runtime dùng tài khoản Auth tạm, kiểm tra bằng JWT thật rồi tự xóa dữ liệu trong `finally`:

```bash
pnpm test:cloud:phase1a
pnpm test:cloud:phase1b
pnpm test:e2e
pnpm test:e2e:phase1b
```

Cấp tại runtime các biến chung `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `TEST_OWNER_EMAIL`, `TEST_OWNER_PASSWORD`. Phase 1A dùng thêm `TEST_EMPLOYEE_EMAIL`, `TEST_EMPLOYEE_PASSWORD`. Phase 1B dùng thêm `TEST_CATALOG_EMPLOYEE_EMAIL`, `TEST_CATALOG_EMPLOYEE_PASSWORD`, `TEST_BUSINESS_EMPLOYEE_EMAIL`, `TEST_BUSINESS_EMPLOYEE_PASSWORD`. Email test bắt buộc dùng miền `example.invalid`, tiền tố tương ứng `codex-phase1a-` hoặc `codex-phase1b-`, và mỗi vai trò phải có email riêng.

Nạp credential từ một file runtime nằm ngoài repository, ví dụ biến đường dẫn `PHASE1B_TEST_ENV_FILE`; không ghi giá trị trực tiếp vào lệnh, Git, log CI hoặc browser artifact:

```bash
set -a
source "$TUENHI_ENV_FILE"
source "$PHASE1B_TEST_ENV_FILE"
set +a

pnpm test:cloud:phase1b
pnpm test:e2e:phase1b
```

Runner Phase 1B fail-closed nếu thiếu biến, tạo tài khoản/record tổng hợp bằng JWT thật, chỉ dọn đúng profile `codex-phase1b-…@example.invalid` và thất bại nếu còn profile, import run, product hoặc legacy sale. Playwright đã tắt trace, screenshot và video để tránh ghi credential hoặc workbook tổng hợp vào báo cáo.

Khi chạy toàn bộ `pnpm test:e2e` cùng Phase 1A, đặt thêm `TEST_PHASE1B_OWNER_EMAIL` và `TEST_PHASE1B_OWNER_PASSWORD` để tách owner browser Phase 1B khỏi cặp `TEST_OWNER_*` có tiền tố Phase 1A. Lệnh `test:e2e:phase1b` riêng vẫn có thể dùng `TEST_OWNER_*` làm fallback.

`test:cloud:phase1a` kiểm tra RLS, RPC, Edge Function, phân quyền owner/employee, hard gate đổi mật khẩu, last-owner protection và ranh giới `app_private`. `test:e2e` kiểm tra luồng đăng nhập/đổi mật khẩu/đăng xuất, route staff, giao diện desktop/mobile và trạng thái offline. Hàm dọn dữ liệu test chỉ cho service role gọi và chỉ chấp nhận profile có email test đúng tiền tố trên.

`test:cloud:phase1b` kiểm tra quyền theo target, owner-only giá bán/legacy import, direct-write denial, idempotency, cạnh tranh SKU, zero balance, Storage private và ranh giới archive bằng publishable-key client đăng nhập từng vai trò. Secret key chỉ dùng setup/cleanup. `test:e2e:phase1b` dùng workbook tổng hợp sinh từ test, không dùng workbook thật của cửa hàng.

## Vận hành catalog, ảnh và Realtime

Bucket `product-images` là private, giới hạn 5 MiB và chỉ nhận JPEG/PNG/WebP. Client lưu object theo đường dẫn đã kiểm soát, gọi command gắn metadata, và dùng signed URL ngắn hạn để hiển thị. Không đổi bucket thành public.

Realtime publication chỉ phát tín hiệu thay đổi cho `products`, `product_images` và `inventory_balances`. Client nhận tín hiệu rồi invalidate/refetch dữ liệu authoritative; payload Realtime không được dùng như sổ dữ liệu thay thế.

## Chứng từ chuyển khoản

Ảnh chứng từ là tùy chọn cho thanh toán hóa đơn và hoàn tiền trả hàng bằng
chuyển khoản; có thể xác nhận khi chưa có ảnh. Nếu đính kèm, ảnh phải là JPEG,
PNG hoặc WebP không quá 5 MiB. Bucket `payment-proofs` là private; client upload
object bất biến trước command, server kiểm tra quyền sở hữu/đường dẫn rồi gắn
metadata chỉ khi command thành công. Ảnh chỉ mở qua signed URL ngắn hạn; gửi
lại yêu cầu không xóa hay thay ảnh đã gắn.

Áp dụng migration `20261006105559_optional_transfer_proofs.sql` trước khi phát
hành frontend tương ứng. Kiểm thử SQL dùng database cô lập qua Unix socket:
`supabase/tests/isolated/optional_transfer_proofs.sql`; không chạy fixture trên
Cloud production.

## Công nợ theo khách hàng

Chọn khách có mã và **Kết hợp / Ghi nợ** ở quầy để nhập tiền mặt, chuyển khoản
và ghi nợ phần còn lại. Mở chi tiết khách hàng để **Thu nợ** hoặc **Chỉnh số dư
nợ** có lý do; lịch sử giữ người thực hiện, số tiền và số dư sau mỗi thao tác.
KH01 mua 100.000đ, trả 30.000đ tiền mặt + 50.000đ chuyển khoản thì nợ 20.000đ;
thu đủ 20.000đ về 0. Chi tiết quyền, trả hàng và triển khai xem
[runbook công nợ](docs/runbooks/2026-10-06-customer-debt.md).

## Import Excel và thời hạn lưu

Workbook generic và workbook cũ được parse trong bộ nhớ trình duyệt; file gốc không upload lên Storage hoặc server. Dữ liệu được gửi theo gói tối đa 250 dòng, kiểm tra trước và commit nguyên tử/idempotent. Raw row và lỗi nhập được giữ tối đa 30 ngày rồi job Cloud xóa; record nghiệp vụ đã commit không bị xóa theo raw payload.

`customers-v2.xlsx` loại bỏ các trường nhạy cảm/ngoài phạm vi. CCCD, ngày sinh, giới tính, Facebook, điểm, công nợ và tổng bán lịch sử không được gửi lên server. Số điện thoại form/paste/Excel dùng cùng chuẩn E.164.

## Ranh giới dữ liệu bán hàng cũ

Adapter cố định `LEGACY_Q237_V1` chỉ dành cho owner. Công thức không được thực thi; giá trị cache hợp lệ chỉ mang provenance `CACHED_UNVERIFIED`. Hóa đơn cũ chỉ vào `legacy_sales`/`legacy_sale_lines`, luôn có nhãn “Chỉ để tra cứu” và không tạo payment, tồn kho, giá vốn, doanh thu, trả hàng hay hủy hóa đơn.

Giá vốn và tồn đầu kỳ trong workbook cũ chỉ là gợi ý mở sổ owner-only, chưa có command ghi sổ trong Phase 1B. Ứng viên sản phẩm/khách hàng phải đi qua mẫu, validation và explicit commit của import danh mục chuẩn.

## Bootstrap chủ cửa hàng lần đầu

Đây là quy trình lịch sử, chỉ chạy một lần sau migration Phase 1A. P2.0 không
được chạy lại bootstrap. Khi tạo Production sạch ở P2.6 sẽ có phê duyệt và
runbook riêng. Cấp các biến runtime `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OWNER_PASSWORD`,
`BOOTSTRAP_OWNER_DISPLAY_NAME`, sau đó chạy:

```bash
pnpm bootstrap:owner
```

Script không ghi hoặc in mật khẩu/secret. Owner đầu tiên phải đổi mật khẩu trong lần đăng nhập đầu tiên. Không đưa các biến bootstrap hoặc secret key vào biến `VITE_*` hay commit vào Git.

## Ranh giới PWA cache

Service worker chỉ precache app shell và static asset. Mọi phản hồi tài chính, API, Auth, Storage và báo cáo luôn đi qua network, không được runtime-cache.

## Quản trị nhân viên

Owner dùng màn `/staff` để tạo, khóa, mở lại tài khoản và đặt mật khẩu tạm. Các thao tác Auth Admin đi qua bốn Edge Function `create-employee`, `deactivate-employee`, `reactivate-employee`, `reset-employee-password`; UI không bao giờ nhận secret key. Nhân viên mới hoặc vừa được đặt lại mật khẩu phải đổi mật khẩu ở lần đăng nhập tiếp theo.

## Triển khai Production

Ứng dụng Production hiện chạy tại [tuenhi.vercel.app](https://tuenhi.vercel.app)
và Vercel build từ nhánh `main`. Mọi `pnpm build` đều chạy production-build
verifier: giới hạn JavaScript/CSS initial, tổng deploy assets, bắt buộc PWA
manifest/service worker/icon, chặn secret material và không cho preload
XLSX/ExcelJS/PDF trong app shell.

Smoke công khai không dùng credential chạy độc lập trên mobile và desktop:

```bash
PRODUCTION_BASE_URL=https://tuenhi.vercel.app pnpm test:e2e:production
```

Workflow `Production deployment smoke` nhận `vercel.deployment.ready` chỉ cho
project `tuenhi`, môi trường `production`, ref `main`, rồi phát status cố định
`Vercel - tuenhi: production-smoke`. Sau khi workflow đã có trên `main`, chọn
status này làm Vercel Deployment Check bắt buộc để domain Production chỉ được
cập nhật sau khi smoke đạt. `workflow_dispatch` vẫn cho phép chạy thủ công với
deployment URL hoặc domain hiện tại.

## Báo cáo Phase 1F-A

Dashboard và trang `/reports` dùng múi giờ cố định `Asia/Ho_Chi_Minh`. Dashboard mặc định Hôm nay; báo cáo mặc định Tháng này và hỗ trợ Hôm nay, Tuần này, Tháng này hoặc khoảng ngày tùy chọn tối đa 366 ngày. Nhân viên chỉ nhận DTO doanh thu theo quyền; giá vốn, lợi nhuận và định giá tồn chỉ có trong RPC owner-only và không được persist vào browser storage hoặc PWA runtime cache.

Nút XLSX tạo file trong bộ nhớ trình duyệt, không upload lên Storage. Báo cáo chính thức chỉ tổng hợp ledger vận hành; `legacy_sales` luôn là dữ liệu tra cứu riêng.

Quality gate Phase 1F hiện hành:

```bash
pnpm check
pnpm cloud:verify:phase1f
```

`test:cloud:phase1f` là runner lịch sử có tạo dữ liệu tổng hợp và không được chạy
ở `OWNER_PILOT` hoặc `PRODUCTION`.

Project Cloud hiện tại là database Production duy nhất. Backup, cutover và dữ
liệu vận hành do Owner quản lý ngoài repository. Sau khi lifecycle là
`PRODUCTION`, không chạy Cloud runner, Cloud E2E tạo dữ liệu hoặc cleanup tổng
hợp.

### Cutover Phase 1F-B

Trước điểm chuyển lifecycle, chạy `pnpm cutover:preflight`; nếu có dữ liệu test, chỉ dọn sau dry-run và phê duyệt Owner. Sau khi chuyển `OWNER_PILOT`, không chạy lại preflight, cleanup hay Cloud runner. Owner nhập dữ liệu trực tiếp trên Preview, tạo baseline 1 sau danh mục/ảnh và baseline 2 sau mở sổ/đối soát, trước giao dịch bán thật.

`cutover:backup` và `cutover:export-images` chỉ nhận thư mục tuyệt đối ngoài repository, dùng PostgreSQL native 17/AES-256 và nhận passphrase qua terminal tương tác. Mỗi archive có receipt SHA-256; xác minh bằng `pnpm cutover:verify-backup -- --archive <file.enc> --receipt <file.receipt.json> --confirm`. Archive, receipt và bản sao trên ổ ngoài phải được kiểm trước khi đi tiếp. Xem [runbook cutover](docs/runbooks/phase-1f-production-cutover.md).

Không chuyển `OWNER_PILOT` hoặc `PRODUCTION` khi chưa có phê duyệt go-live riêng. Sau `OWNER_PILOT`, runner tổng hợp bị chặn ở script và database. Tài khoản nhân viên chỉ mở sau `AUTH_HARDENED` khi có leaked-password protection, hoặc sau `STAFF_ACCESS_WAIVER` được Owner chấp thuận qua service command. Waiver Free không phải Auth hardening: Supabase không kiểm tra mật khẩu đã bị rò rỉ; vẫn bắt buộc mật khẩu tối thiểu 10 ký tự gồm chữ hoa/chữ thường/số, đổi mật khẩu tạm ở lần đăng nhập đầu và dùng reset mật khẩu khi cần.

### Owner pilot B5

Khi Cloud đã ở `OWNER_PILOT`, dùng [runbook B5](docs/runbooks/phase-1f-b5-owner-pilot-readiness.md) để nghiệm thu Preview với dữ liệu mock. B5 chỉ chạy quality gate local và kiểm tra Cloud read-only (`cutover:verify`, migration list, DB lint/advisor); không chạy preflight, cleanup, Cloud runner, backup/restore hoặc lệnh lifecycle. Báo cáo readiness phải ghi rõ dữ liệu mock vẫn còn; dọn mock và nhập dữ liệu thật chỉ được lập trong phase cutover được Owner duyệt riêng.

### Dữ liệu thật B6

B6 giữ Cloud ở `OWNER_PILOT` và dùng một manifest SHA-256 được Owner duyệt trước
khi hủy dữ liệu mock. Sau khi nhập danh mục/ảnh thật, tạo Baseline 1; sau mở sổ
và đối soát, tạo Baseline 2 tại thư mục ngoài repository. Xem
[runbook B6](docs/runbooks/phase-1f-b6-real-data-baselines.md). B6 không merge
`main` hoặc deploy Production. Đây là tài liệu lịch sử của B6; trạng thái deploy
hiện hành được mô tả tại phần “Triển khai Production” và release report B7/B8.

### Ổn định B8

Các lệnh tài chính trọng yếu lưu marker tối thiểu trong `localStorage` theo
user/command/entity và tái dùng cùng idempotency key nếu response bị mất. Marker
không chứa tiền, giá vốn, khách hàng hoặc payload chứng từ. Nếu lookup chưa xác
định được kết quả, giao diện giữ marker và hiển thị riêng “Mã yêu cầu”; mã này
không phải correlation ID.

RPC `api.get_my_command_outcome` chỉ cho user đăng nhập tra outcome của chính
mình theo allowlist tài chính và không mở quyền đọc
`app_private.command_deduplication`. Xem
[runbook B8](docs/runbooks/phase-1f-b8-production-stabilization.md).

## Tài liệu đã phê duyệt

- [Đặc tả thiết kế](docs/superpowers/specs/2026-08-21-internal-single-store-pos-design.md)
- [Đặc tả Cloud và nhập liệu](docs/superpowers/specs/2026-08-22-cloud-platform-data-entry-design.md)
- [Kế hoạch Phase 0](docs/superpowers/plans/2026-08-21-phase-0-foundation.md)
- [Kế hoạch Phase 1A](docs/superpowers/plans/2026-08-22-phase-1a-cloud-identity-ux.md)
