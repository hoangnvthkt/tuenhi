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

`pnpm check:full` là quality gate frontend đầy đủ trong một lệnh. `pnpm test:e2e` chạy trên bản production đã build và cần bộ tài khoản kiểm thử Cloud tạm thời như phần dưới. Luôn nạp biến `VITE_*` trước `pnpm build` vì Vite ghi cấu hình public vào bundle tại thời điểm build.

Các mẫu Excel chính thức được sinh từ code, không sửa tay:

```bash
pnpm templates:generate
pnpm templates:verify
```

Năm file hợp lệ duy nhất trong `public/templates/import` là nhóm hàng v1, sản phẩm v1, nhà cung cấp v1 và khách hàng v1/v2. Mẫu khách hàng v2 là mẫu hiện hành; v1 vẫn được nhận để tương thích.

## Biến môi trường

Chỉ hai biến an toàn cho browser bundle là `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`. Ba biến chỉ dành cho Supabase CLI là `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` và `SUPABASE_PROJECT_ID`; không đặt chúng trong frontend hoặc browser bundle.

## Quy trình cloud

Không dùng Supabase local hoặc Docker. Mọi lệnh migration chạy trên project Cloud đã link và phải nạp `.env` từ vị trí an toàn mà không in giá trị ra terminal:

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

## Kiểm thử bảo mật trên Cloud

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

## Import Excel và thời hạn lưu

Workbook generic và workbook cũ được parse trong bộ nhớ trình duyệt; file gốc không upload lên Storage hoặc server. Dữ liệu được gửi theo gói tối đa 250 dòng, kiểm tra trước và commit nguyên tử/idempotent. Raw row và lỗi nhập được giữ tối đa 30 ngày rồi job Cloud xóa; record nghiệp vụ đã commit không bị xóa theo raw payload.

`customers-v2.xlsx` loại bỏ các trường nhạy cảm/ngoài phạm vi. CCCD, ngày sinh, giới tính, Facebook, điểm, công nợ và tổng bán lịch sử không được gửi lên server. Số điện thoại form/paste/Excel dùng cùng chuẩn E.164.

## Ranh giới dữ liệu bán hàng cũ

Adapter cố định `LEGACY_Q237_V1` chỉ dành cho owner. Công thức không được thực thi; giá trị cache hợp lệ chỉ mang provenance `CACHED_UNVERIFIED`. Hóa đơn cũ chỉ vào `legacy_sales`/`legacy_sale_lines`, luôn có nhãn “Chỉ để tra cứu” và không tạo payment, tồn kho, giá vốn, doanh thu, trả hàng hay hủy hóa đơn.

Giá vốn và tồn đầu kỳ trong workbook cũ chỉ là gợi ý mở sổ owner-only, chưa có command ghi sổ trong Phase 1B. Ứng viên sản phẩm/khách hàng phải đi qua mẫu, validation và explicit commit của import danh mục chuẩn.

## Bootstrap chủ cửa hàng lần đầu

Chỉ chạy một lần sau khi migration Phase 1A đã được áp dụng. Cấp các biến runtime `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OWNER_PASSWORD`, `BOOTSTRAP_OWNER_DISPLAY_NAME`, sau đó chạy:

```bash
pnpm bootstrap:owner
```

Script không ghi hoặc in mật khẩu/secret. Owner đầu tiên phải đổi mật khẩu trong lần đăng nhập đầu tiên. Không đưa các biến bootstrap hoặc secret key vào biến `VITE_*` hay commit vào Git.

## Ranh giới PWA cache

Service worker chỉ precache app shell và static asset. Mọi phản hồi tài chính, API, Auth, Storage và báo cáo luôn đi qua network, không được runtime-cache.

## Quản trị nhân viên

Owner dùng màn `/staff` để tạo, khóa, mở lại tài khoản và đặt mật khẩu tạm. Các thao tác Auth Admin đi qua bốn Edge Function `create-employee`, `deactivate-employee`, `reactivate-employee`, `reset-employee-password`; UI không bao giờ nhận secret key. Nhân viên mới hoặc vừa được đặt lại mật khẩu phải đổi mật khẩu ở lần đăng nhập tiếp theo.

## Triển khai

Vercel được chủ động hoãn lại; Phase 1B không tạo hoặc liên kết dự án triển khai.

## Báo cáo Phase 1F-A

Dashboard và trang `/reports` dùng múi giờ cố định `Asia/Ho_Chi_Minh`. Dashboard mặc định Hôm nay; báo cáo mặc định Tháng này và hỗ trợ Hôm nay, Tuần này, Tháng này hoặc khoảng ngày tùy chọn tối đa 366 ngày. Nhân viên chỉ nhận DTO doanh thu theo quyền; giá vốn, lợi nhuận và định giá tồn chỉ có trong RPC owner-only và không được persist vào browser storage hoặc PWA runtime cache.

Nút XLSX tạo file trong bộ nhớ trình duyệt, không upload lên Storage. Báo cáo chính thức chỉ tổng hợp ledger vận hành; `legacy_sales` luôn là dữ liệu tra cứu riêng.

Quality gate Phase 1F:

```bash
pnpm test:cloud:phase1f
pnpm cloud:verify:phase1f
```

Phase 1F-B (dữ liệu thật, backup, bật leaked-password protection và go-live) chỉ được bắt đầu khi owner phê duyệt riêng. Project Cloud hiện tại sẽ trở thành production; không chạy runner dữ liệu tổng hợp sau cutover.

### Cutover Phase 1F-B

Trước điểm chuyển lifecycle, chạy `pnpm cutover:preflight`; nếu có dữ liệu test, chỉ dọn sau dry-run và phê duyệt Owner. Sau khi chuyển `OWNER_PILOT`, không chạy lại preflight, cleanup hay Cloud runner. Owner nhập dữ liệu trực tiếp trên Preview, tạo baseline 1 sau danh mục/ảnh và baseline 2 sau mở sổ/đối soát, trước giao dịch bán thật.

`cutover:backup` và `cutover:export-images` chỉ nhận thư mục tuyệt đối ngoài repository, dùng PostgreSQL native 17/AES-256 và nhận passphrase qua terminal tương tác. Mỗi archive có receipt SHA-256; xác minh bằng `pnpm cutover:verify-backup -- --archive <file.enc> --receipt <file.receipt.json> --confirm`. Archive, receipt và bản sao trên ổ ngoài phải được kiểm trước khi đi tiếp. Xem [runbook cutover](docs/runbooks/phase-1f-production-cutover.md).

Không chuyển `OWNER_PILOT` hoặc `PRODUCTION` khi chưa có phê duyệt go-live riêng. Sau `OWNER_PILOT`, runner tổng hợp bị chặn ở script và database. Tài khoản nhân viên chỉ mở sau `AUTH_HARDENED` khi có leaked-password protection, hoặc sau `STAFF_ACCESS_WAIVER` được Owner chấp thuận qua service command. Waiver Free không phải Auth hardening: Supabase không kiểm tra mật khẩu đã bị rò rỉ; vẫn bắt buộc mật khẩu tối thiểu 10 ký tự gồm chữ hoa/chữ thường/số, đổi mật khẩu tạm ở lần đăng nhập đầu và dùng reset mật khẩu khi cần.

## Tài liệu đã phê duyệt

- [Đặc tả thiết kế](docs/superpowers/specs/2026-08-21-internal-single-store-pos-design.md)
- [Đặc tả Cloud và nhập liệu](docs/superpowers/specs/2026-08-22-cloud-platform-data-entry-design.md)
- [Kế hoạch Phase 0](docs/superpowers/plans/2026-08-21-phase-0-foundation.md)
- [Kế hoạch Phase 1A](docs/superpowers/plans/2026-08-22-phase-1a-cloud-identity-ux.md)
