# Handoff toàn bộ dự án Tuệ Nhi — Bán hàng & Kho

Ngày tổng hợp: **07/11/2026, giờ Việt Nam**. Workspace: `/Users/admin/tuenhi`.

Tài liệu dành cho phiên chat mới: nắm sản phẩm, quy tắc nghiệp vụ, kiến trúc, trạng thái mã nguồn, cách kiểm thử và các điểm chưa được xác minh để tiếp tục ngay.

## 1. Đọc phần này trước

Tuệ Nhi là ứng dụng POS và quản lý kho nội bộ cho **một cửa hàng, một kho logic**. Giao diện tiếng Việt, dùng trên desktop/mobile và cài được dạng PWA. Database là nơi quyết định tiền, tồn, công nợ và quyền. Frontend React gọi Supabase RPC; các thao tác quản trị Auth dùng Edge Functions.

Mã hiện tại đã vượt xa handoff tháng 9: có công nợ khách hàng, thu nợ/điều chỉnh, nhắc nợ quá hạn, bán âm kho và ghi nhận giá vốn bổ sung, dashboard tiền mặt/chuyển khoản/nợ, in tạm tính và ngừng kinh doanh sản phẩm. **Không bắt đầu lại từ giả định P2.3 là tính năng mới nhất.**

Đây là bàn giao dựa trên mã nguồn, Git và tài liệu local được đọc trong phiên này. Phiên chat hiện tại không có lịch sử trao đổi trước đó ngoài yêu cầu tạo handoff. Không có kiểm tra trạng thái Cloud, GitHub hay Vercel trực tiếp trong phiên bàn giao; các trạng thái phát hành bên ngoài chưa được xác nhận lại.

Thứ tự nguồn tin khi có mâu thuẫn:

1. Yêu cầu mới nhất của Owner và hành vi/contract hiện hành đã kiểm chứng.
2. Mã ở commit hiện tại, migrations, tests và runbook của tính năng cụ thể.
3. Các spec/plan/audit/handoff cũ để hiểu quyết định lịch sử. Checkbox chưa tick không đủ kết luận chưa triển khai; tick rồi cũng không chứng minh production đang chạy đúng commit.

## 2. Snapshot Git và workspace

| Mục                            | Trạng thái đã đọc ngày 07/11/2026                                                 |
| ------------------------------ | --------------------------------------------------------------------------------- |
| Repository                     | `https://github.com/hoangnvthkt/tuenhi.git`                                       |
| Branch hiện tại                | `main`                                                                            |
| HEAD                           | `edc57cb54408267ad2370f57fad63d75127cdbdb`                                        |
| Commit gần nhất                | `fix: satisfy strict typing in POS removal test`, 21/10/2026 21:58 +07:00         |
| `origin/main` trong local      | Cùng SHA với HEAD; **chưa fetch**, không khẳng định remote hiện tại chưa đổi      |
| Migration SQL trong repository | **63 file**, mới nhất `20261016030508_dashboard_settlement_drilldowns.sql`        |
| Working tree trước bàn giao    | Có thay đổi tồn tại sẵn; chi tiết bên dưới                                        |
| Thay đổi của phiên bàn giao    | Thêm tài liệu này; không sửa chức năng, migration, dữ liệu hay cấu hình phát hành |

### 2.1 Thay đổi có sẵn phải giữ nguyên

Ba file tracked đã sửa trước phiên này:

- `docs/superpowers/plans/2026-10-03-tuenhi-daily-workflows.md`
- `docs/superpowers/plans/2026-10-03-tuenhi-safety-fixes.md`
- `docs/superpowers/plans/2026-10-03-tuenhi-staff-recovery.md`

Diff quan sát chỉ đổi tiêu đề task từ dạng `Task 1: R5` sang `Task 1 / R5` và tương tự. Không tự hoàn nguyên hoặc gom vào commit công việc mới.

Hai thư mục untracked có sẵn:

- `.workbook_build/`: script dựng Excel Gantt và ảnh preview.
- `outputs/01a15e26-6ef9-7f03-943f-7448c4d7e08c/Gantt_28_viec.xlsx`.

Nội dung script Gantt là công việc xây dựng, có vẻ thuộc công việc khác dùng chung thư mục. Giữ nguyên, không xóa, không chạy formatter toàn repository để xử lý chúng, không đưa vào commit POS. `.workbook_build/create_gantt.mjs` đang làm `pnpm check` dừng tại Prettier.

### 2.2 Worktree/branch tồn tại

Các checkout dưới đây là snapshot quan sát, không phải danh sách công việc cần tự động dọn:

| Checkout                                                             | Branch / head                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| `/Users/admin/tuenhi`                                                | `main` / `edc57cb`                                      |
| `/Users/admin/.codex/worktrees/tuenhi-audit-daily/tuenhi`            | `codex/tuenhi-discounts-default-cost` / `eec690d`       |
| `/Users/admin/.codex/worktrees/tuenhi-audit-staff/tuenhi`            | `codex/tuenhi-audit-staff` / `78b4b81`                  |
| `/Users/admin/.codex/worktrees/tuenhi-feedback-fixes/tuenhi`         | `codex/tuenhi-audit-safety` / `f71daf9`                 |
| `/Users/admin/.codex/worktrees/tuenhi/workbook-spec-update`          | `codex/phase-1a-cloud-identity` / `4d0baaf`             |
| `/Users/admin/tuenhi/.worktrees/codex-phase-1f-b4-free-staff-waiver` | `codex/phase-1f-b4-free-staff-waiver` / `1a83ff6`       |
| `/Users/admin/tuenhi/.worktrees/phase-2-p2-0-controlled-development` | `codex/phase-2-p2-0-controlled-development` / `2879344` |

**Nhánh staff cần chú ý:** commit sửa tiếp tục tạo nhân viên `bea690c` chưa là ancestor của `main`; head `78b4b81` chỉ thuộc nhánh staff trong kết quả `git branch --contains`. Không coi các sửa A14–A15 trên nhánh này đã phát hành. Kế hoạch 04/10 ghi PR #4 là draft tại thời điểm đó; chưa kiểm tra trạng thái PR hiện tại.

## 3. Sản phẩm và các phân hệ đã có trong main

| Phân hệ          | Phạm vi hiện có trong mã nguồn                                                             | Điểm vào                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Đăng nhập        | Session, quên mật khẩu, đổi mật khẩu lần đầu, route theo quyền                             | `/login`, `/forgot-password`, `/change-password`                                                          |
| Dashboard        | Chỉ số vận hành/tài chính theo quyền, liên kết drilldown, tiền mặt/chuyển khoản/nợ còn lại | `/`                                                                                                       |
| POS              | Tìm SKU/tên/barcode qua bàn phím, giỏ nháp, khách hàng, giảm giá, thanh toán, in tạm tính  | `/pos`, `/pos/:saleId`                                                                                    |
| Hóa đơn          | Danh sách/chi tiết, in nhiệt/PDF, trạng thái thanh toán/công nợ, hủy theo điều kiện        | `/sales`, `/sales/:saleId`                                                                                |
| Trả hàng         | Yêu cầu, nhận hàng thực tế, hoàn tiền/cấn trừ, hủy yêu cầu theo vòng đời                   | `/returns`, `/returns/new`, `/returns/:returnId`, `/sales/:saleId/return`                                 |
| Sản phẩm         | CRUD danh mục, nhóm, ảnh private, tồn/ngưỡng, giá mặc định theo quyền, context hub         | `/products`, `/products/new`, `/products/:productId`, `/products/:productId/edit`, `/products/categories` |
| Nhập hàng        | Phiếu nháp, nhập Excel, NCC tại chỗ, giá nhập, submit/post/cancel theo quyền               | `/more/purchases`, `/more/purchases/new`, `/more/purchases/:receiptId`                                    |
| Nhập bổ sung     | Danh sách hàng dưới ngưỡng, đi sang phiếu nhập với ngữ cảnh sản phẩm                       | `/more/replenishment`                                                                                     |
| Mở sổ tồn        | Chứng từ mở tồn đầu kỳ có điều kiện pristine-product                                       | `/more/inventory/opening`, `/more/inventory/opening/new`, `/more/inventory/opening/:countId`              |
| Kiểm kho         | Nháp, đếm, cập nhật snapshot/đếm lại, gửi và ghi chênh lệch                                | `/stock-counts`, `/stock-counts/new`, `/stock-counts/:countId`                                            |
| Định giá tồn     | Số liệu giá trị tồn owner-only                                                             | `/more/inventory/valuation`                                                                               |
| NCC / Khách hàng | Danh bạ, context hub, lịch sử giao dịch và liên kết hai chiều                              | `/more/suppliers`, `/more/suppliers/:supplierId`, `/more/customers`, `/more/customers/:customerId`        |
| Công nợ          | Khách có mã, bán kết hợp/ghi nợ, thu nợ, chỉnh số dư có lý do, lịch sử và nhắc quá hạn     | Tab Công nợ trong chi tiết khách                                                                          |
| Import           | Danh mục Excel, validate/commit, lịch sử và workbook lỗi                                   | `/imports`, `/imports/history`, `/imports/:importRunId`                                                   |
| Bán hàng cũ      | Archive riêng chỉ để tra cứu                                                               | `/legacy-sales`, `/legacy-sales/:legacySaleId`                                                            |
| Báo cáo          | Doanh thu/giá vốn/lợi nhuận theo quyền, XLSX, chi tiết phân bổ thanh toán                  | `/reports`, `/reports/settlements`                                                                        |
| Nhân viên        | Tạo/khóa/mở/reset mật khẩu qua Edge; phần recovery mới còn ở nhánh riêng                   | `/staff`                                                                                                  |
| Cấu hình         | Kênh bán, thông tin cửa hàng                                                               | `/more/sales-channels`, `/more/store-settings`                                                            |
| Thông báo        | Feed có filter, đọc/chưa đọc, low-stock và debt reminders                                  | `NotificationCenter`                                                                                      |

Có guard quyền cho từng route; quyền cuối cùng vẫn kiểm tra trên server. Route `/` chuyển tài khoản `WAREHOUSE_VIEWER` sang `/products`.

### 3.1 Mốc phát triển để tra Git

- Phase 1A–1F: Auth/nhân viên → catalog/import → kho/giá vốn → POS → trả/hủy/kiểm kho → báo cáo, cutover và ổn định command.
- P2.0: controlled development; P2.1: năng suất POS/giỏ nháp; P2.2: Product–Supplier–Purchase; P2.3: Customer–Sale–Return–Product.
- 08–10/09: giá phiếu nhập, nhập Excel/thumbnail, sequence chứng từ và sửa post nhập trực tiếp.
- 02/10: in tạm, kho chỉ xem, hủy phiếu nhập, cảnh báo tồn thấp.
- 03/10: audit nghiệp vụ/UX; sửa an toàn và workflow đã vào main qua PR #2/#3. Staff recovery tách riêng.
- 04/10: quick customer, tiền thừa, trạng thái giỏ nháp, mobile checkout, nhập bổ sung.
- 05/10: giới hạn giảm giá và giá vốn mặc định (`eec690d`, merge #10).
- 06/10: giao diện danh mục mobile, ảnh chuyển khoản tùy chọn (`4d259f7`), công nợ (`dc0f1cb`).
- 15/10: bán âm kho, nhắc nợ, mobile POS (`a2c7d34`); phục hồi asset cũ sau deploy (`1430a32`).
- 16/10: trả tiền thừa khi thanh toán kết hợp (`e578649`), dashboard settlement/drilldown (`5f8edfc`).
- 21/10: nút xóa dòng POS, giảm từ 1 thì xóa, nút in tạm tính, ngừng/bật bán lại sản phẩm (`cbd43c4`); cập nhật test và typing (`080df75`, `edc57cb`).

Các mục này chứng minh code đã ở main local; không thay cho bằng chứng triển khai hay Owner UAT.

## 4. Quy tắc nghiệp vụ phải giữ

### 4.1 Tiền, số lượng và chứng từ

- Dùng canonical decimal **string** ở API/DTO cho giá trị số; tiền tối đa hai chữ số thập phân theo contract. Logic tiền phía client có helper BigInt theo đơn vị nhỏ nhất. Không thay bằng phép cộng/trừ float tùy tiện.
- Số lượng nhập/bán/đếm là số nguyên. Số dư kho và system snapshot hiện có thể âm; số đếm vật lý không âm. Kiểm tra loại signed/nonnegative đúng ngữ cảnh.
- Giảm dòng là số tiền giảm **toàn dòng**, không nhân thêm số lượng. Ví dụ `2 × 55.000 − 1.000 giảm dòng − 500 giảm đơn = 108.500`.
- Giá/tổng sau lưu nháp phải khớp số người dùng xác nhận trước complete; thay đổi giá phải được xác nhận lại. Giữ version guard, price guard và rollback transaction khi lỗi.
- Chứng từ và ledger do database cập nhật trong transaction với locking, expected version và idempotency. Không ghi thẳng bảng hoặc tính lại tài chính từ UI để ghi sổ.
- In hóa đơn dùng DTO server có snapshot; không thêm cost/profit vào DTO in/PDF, kể cả caller là Owner. In tạm không đồng nghĩa đã thu tiền hoặc ghi sổ bán.

### 4.2 Giỏ nháp, nhiều tab và kết quả chưa rõ

- Snapshot POS V2 gắn user, có editor lease để một tab giữ quyền sửa. Trạng thái giỏ local khác draft đã lưu server.
- Deeplink `customerId`, `focusProduct`, `productId`, `supplierId` chỉ điền ngữ cảnh với guard; không tự thêm/lưu/ghi sổ hoặc tạo financial command khi mở URL.
- Financial-command executor giữ marker tối thiểu trong localStorage, đối soát outcome rồi retry **cùng idempotency key** nếu chưa rõ kết quả. Không tạo yêu cầu mới chỉ vì mất response.
- Marker không lưu số tiền, thông tin khách, giá vốn hoặc payload chứng từ. Request ID khác correlation ID.
- `api.get_my_command_outcome` chỉ trả kết quả của chính user theo allowlist, không mở bảng dedup private.
- Khi đổi tài khoản: hủy request/cache private theo ranh giới user, không để quyền/dữ liệu Owner sót sang user mới. Tham khảo `private-query-key`, AuthProvider và tests.
- Offline khóa lưu/thanh toán. PWA chưa phải giải pháp bán hàng offline có đồng bộ ledger.

### 4.3 Thanh toán và công nợ

- Khách có mã mới được ghi nợ. Khách vãng lai không được tạo công nợ.
- Chọn **Kết hợp / Ghi nợ**: tiền mặt + chuyển khoản, phần còn thiếu là nợ. Ví dụ đơn 100.000, thu 30.000 cash + 50.000 bank → nợ 20.000.
- Với tiền thừa, ledger ghi số tiền thực giữ lại sau trả lại cash; tiền khách đưa không phải toàn bộ số thu. Logic dùng `src/shared/lib/numeric/payment-allocation.ts` và tests hiện hành, bao gồm mixed payment.
- Thu nợ không vượt dư nợ; phân bổ hóa đơn cũ trước. Chỉnh số dư bắt buộc lý do; chỉnh giảm không được tính là tiền đã thu. Giảm nợ thủ công ưu tiên nợ nhập tay rồi hóa đơn cũ.
- `customer.debt.read` / `customer.debt.collect` mặc định Owner và có thể cấp riêng; chỉnh số dư là Owner. Quyền xem một hóa đơn không mở tổng nợ khách.
- Trả hàng cấn trừ phần chưa trả/đã chỉnh giảm của chính hóa đơn trước, phần còn lại mới hoàn tiền thực. Giữ liên kết allocation và lịch sử.
- Tiền thu nợ nhập tay không tạo doanh thu hóa đơn mới. Không backfill công nợ vào hóa đơn cũ thanh toán đủ.
- Nhắc nợ khi còn khoản quá **7 ngày tròn**, theo tuổi allocation/nợ điều chỉnh tăng; mua thêm không làm trẻ hóa nợ cũ. Feed reconcile và poll 60 giây khi NotificationCenter mounted, không dùng cron/SMS/push ngoài ứng dụng. Đã đọc giữ trong ngày Việt Nam; ngày sau tái báo nếu còn quá hạn.

### 4.4 Bán âm kho và giá vốn bổ sung

**Rule chặn bán khi thiếu tồn trong spec/plan cũ đã bị thay thế.** Checkout hiện cho tồn âm, vẫn giữ guard giá/version/quyền.

- Phần có hàng dùng bình quân giá vốn; bán hết lượng đã biết tiêu thụ chính xác phần giá trị tồn còn lại.
- Phần bán thiếu kho có **COGS tạm bằng 0**, lợi nhuận còn tạm tính. Giá vốn mặc định sản phẩm chỉ gợi ý nhập hàng, không được lấy làm bằng chứng giá vốn.
- Phiếu nhập ghi sổ sau đó phân bổ giá thực tế vào các shortage cũ theo FIFO; phần còn dư mới thành tài sản tồn kho.
- Allocation bổ sung điều chỉnh snapshot chi phí và sự kiện `SALE_COMPLETED` gốc, nên **lợi nhuận của kỳ bán cũ có thể thay đổi khi nhập bù**. Doanh thu, tiền thu và công nợ giữ nguyên.
- Khi tồn bằng 0 hoặc âm, giá trị tồn và bình quân giá vốn bằng 0. Giữ bảo toàn tiền/lượng và phần dư làm tròn.
- Trả hàng giải phóng phần chưa có giá vốn trước, sau đó hoàn giá vốn đã ghi nhận; hủy giải phóng shortage và đảo giá vốn phù hợp. Hàng trả/hủy có giá vốn có thể bù shortage khác trước khi tăng tài sản tồn.
- Phiếu nhập đã cấp giá vốn cho shortage có thể bị chặn hủy theo guard đảo phiếu. Không sửa constraint/ledger để ép hủy.
- Kiểm kho tăng từ tồn 0/âm cần Owner nhập ước tính giá vốn rõ ràng; stale snapshot phải tải lại và đếm lại.
- Migration không viết lại dữ liệu lịch sử khi apply; replenishment tương lai xử lý shortage mới. Không rollback bằng cách bật lại constraint tồn không âm khi đã có số dư âm.

Nguồn chi tiết: [negative-inventory.md](../runbooks/negative-inventory.md).

### 4.5 Dashboard settlement khác báo cáo dòng tiền theo ngày thu

`api.get_sale_settlement_report(date,date,text,text,timestamptz,uuid,integer)` trả summary và danh sách phân trang độc lập, scope theo quyền. UI: `/reports/settlements?period&from&to&scope&method=ALL|CASH|BANK_TRANSFER|DEBT`.

- Chọn ngày/kỳ theo **ngày bán của hóa đơn**, múi giờ `Asia/Ho_Chi_Minh`.
- Tiền mặt/chuyển khoản là khoản hiện đã phân bổ vào các hóa đơn bán trong kỳ, kể cả thu nợ sau ngày bán; trừ hoàn tiền thực của các hóa đơn đó.
- Nợ là **nợ còn lại hiện tại của các hóa đơn bán trong kỳ**, không phải tổng nợ toàn bộ khách hoặc riêng nợ phát sinh ban đầu.
- Không cộng thu nợ hóa đơn ngoài kỳ vào kỳ đang chọn; không tính hóa đơn hủy vào số dư.
- Net theo phương thức có thể âm do hoàn tiền; nợ còn lại không âm.
- Tổng tính server trên toàn bộ tập dữ liệu, không lấy tổng trang đang hiển thị. OWN không được lộ hóa đơn/cost của nhân viên khác.
- Không gọi các card này là báo cáo mọi tiền thu vào đúng ngày đó. Đây là quyết định nghiệp vụ được ghi trong plan 16/10.

### 4.6 Giá mặc định, ảnh, import và dữ liệu cũ

- Giá vốn mặc định tùy chọn, >0 nếu có, hai chữ số thập phân; để trống để xóa. Đọc theo `purchase.cost.read`, sửa thêm `purchase.cost.enter` và quyền sản phẩm. Không đổi bình quân giá vốn, phiếu cũ hay giá import Excel.
- `product-images` và `payment-proofs` private, JPEG/PNG/WebP tối đa 5 MiB; hiển thị signed URL ngắn hạn. Không đổi bucket public.
- Ảnh chuyển khoản **tùy chọn** cả thanh toán và hoàn tiền. Nếu có ảnh: upload bất biến trước command, server kiểm đường dẫn/quyền, chỉ gắn metadata sau thành công; replay không thay/xóa ảnh đã gắn.
- Excel parse trong bộ nhớ browser; file gốc không upload. Gói tối đa 250 dòng, validation rồi commit atomic/idempotent. Raw payload/lỗi giữ tối đa 30 ngày, không xóa record nghiệp vụ đã commit theo retention này.
- Mẫu danh mục sinh từ code; hiện verifier kiểm **7 mẫu**: categories-v1, products-v1, suppliers-v1, customers-v1/v2, opening-balances-v1, purchase-receipt-v1. README nói “năm file” là mô tả cũ.
- Mẫu khách v2 hiện hành; không gửi CCCD, ngày sinh, giới tính, Facebook, điểm hoặc tổng bán/công nợ từ workbook cũ. Công nợ vận hành mới đi qua command riêng, không import số dư khách tùy ý bằng mẫu danh mục.
- Legacy adapter `LEGACY_Q237_V1` owner-only; công thức không được thực thi, cache chỉ `CACHED_UNVERIFIED`. `legacy_sales` chỉ tra cứu, không tham gia doanh thu, kho, giá vốn, thanh toán, trả/hủy hoặc KPI operational.
- Ngừng kinh doanh là đổi `isActive` qua saveProduct với version; lịch sử giữ lại, có thể bật bán lại. Không hard-delete sản phẩm có lịch sử.

## 5. Kiến trúc và bản đồ mã nguồn

### 5.1 Stack tại package.json

Node yêu cầu `>=24.13.1 <25`; `.node-version` là `24.13.1`. `packageManager` pin `pnpm@11.19.0`, engine `>=11.19.0 <12`; máy bàn giao đang chạy Node `v24.13.1`, pnpm `11.25.0`.

React 19.2.8, TypeScript 6.0.3, Vite 8.2.2, React Router 8.3.0, Tailwind 4.3.3, TanStack Query 5.101.4, Supabase JS 2.112.3, Zod 4.4.3, React Hook Form; XLSX/ExcelJS cho Excel, pdfmake cho PDF. Vitest/Testing Library và Playwright kiểm thử. Đây là version trong repo, không phải khuyến nghị nâng cấp.

### 5.2 Cấu trúc frontend

```text
src/app/                       composition, providers, layout, routes, error recovery
src/features/auth/             session, permission gates, login/password
src/features/catalog/          sản phẩm, ảnh, nhóm, connected explorer
src/features/directories/      khách/NCC, context hub
src/features/customer-debt/     công nợ, thu và điều chỉnh số dư
src/features/connected-explorer/ read models/context hub liên phân hệ
src/features/payments/          chứng từ thanh toán
src/features/sales/             POS, checkout, giỏ, hóa đơn/in/PDF
src/features/returns/           yêu cầu trả, nhận, hoàn tiền
src/features/inventory/         opening, purchase, stock-count, replenishment, valuation
src/features/dashboard/        card và hook dashboard
src/features/reports/           report API/schema, settlement, export
src/features/imports/           generic + legacy parser/workflow
src/features/legacy-sales/      archive tra cứu
src/features/staff/             quản trị nhân viên
src/features/settings/          cửa hàng/kênh bán
src/features/notifications/     thông báo
src/shared/                    API, hooks, số/điện thoại, UI, Supabase client/types
supabase/migrations/            lịch sử database
supabase/functions/             Edge Functions
supabase/tests/                 SQL assertions chỉ đọc + isolated fixtures tách riêng
scripts/                       gates, templates, backup/cutover, isolated runners
e2e/                           browser specs và local fixtures
```

Hướng dependency: `app → features → shared`, app cũng dùng shared. Shared không import feature/app; feature không import app; import liên feature qua public `index.ts`. Alias `@/*` trỏ `src/*`. Các ngoại lệ có sẵn không phải lý do mở rộng import sâu khi sửa.

Feature thường gồm `api` (transport + Zod), `model` (logic/type), `hooks`, `components`, `pages`, `index.ts`. Tests colocated. Đọc [frontend-architecture.md](../architecture/frontend-architecture.md) trước refactor.

### 5.3 File quan trọng để vào việc

| Việc                     | File/module bắt đầu                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router/quyền màn hình    | `src/app/app-routes.tsx`, `src/app/routes/*.tsx`, `features/auth/components/RequireSession.tsx`                                                      |
| Phiên/cache riêng tư     | `features/auth/components/AuthProvider.tsx`, `shared/api/private-query-key.ts`, `features/auth/hooks/use-private-query-key.ts`                       |
| POS/giỏ                  | `features/sales/pages/PosPage.tsx`, `components/CartPanel.tsx`, `model/pos-storage.ts`, `hooks/use-pos-commands.ts`                                  |
| Checkout/tiền thừa       | `features/sales/components/CheckoutDialog.tsx`, `model/checkout-confirmation.ts`, `model/cash-change.ts`, `shared/lib/numeric/payment-allocation.ts` |
| In tạm/PDF               | `features/sales/components/DraftPrintDialog.tsx`, `model/sales-pdf.ts`, `pages/SaleDetailPage.tsx`                                                   |
| Chứng từ kho             | `features/inventory/{purchase,opening,stock-count}/`                                                                                                 |
| Sản phẩm/context         | `features/catalog/pages/ProductDetailPage.tsx`, API/connected explorer cùng feature                                                                  |
| Công nợ                  | Tìm `customer-debt` và `customer.debt` trong features, generated types và migration 06/10                                                            |
| Dashboard/settlement     | `features/dashboard/`, `features/reports/`, migration 16/10                                                                                          |
| Lỗi RPC                  | `shared/api/rpc-envelope.ts`, `shared/api/command-error.ts`                                                                                          |
| Command chưa rõ kết quả  | `shared/api/financial-command*.ts`, `financial-outcome-api.ts`, `shared/hooks/use-financial-command.ts`                                              |
| Invalidate sau nghiệp vụ | `shared/api/refresh-operational-data.ts`                                                                                                             |
| Số chuẩn                 | `shared/lib/numeric/canonical-number.ts`, `shared/ui/forms/NumericField.tsx`                                                                         |
| Types API sinh tự động   | `shared/supabase/database.types.ts`                                                                                                                  |
| Asset cũ sau deploy      | `app/bootstrap/asset-recovery.ts`, `app/errors/`, `e2e/asset-recovery.spec.ts`                                                                       |
| Build budgets            | `scripts/verify-production-build.mjs`, `vite.config.ts`                                                                                              |

Các đường dẫn bắt đầu `features/`, `shared/`, `app/` trong bảng này đều nằm dưới `src/`.

### 5.4 Database, bảo mật và contract

- Browser dùng schema exposed `api`; `app_private` chứa ledger, cost, permissions, dedup và implementation nhạy cảm. Không expose private hoặc cấp direct table privilege để chữa lỗi UI.
- API wrapper theo quyền tối thiểu; privileged implementation ở private với `search_path = ''`; giữ RLS/FORCE RLS, grants và actor scope.
- RPC envelope có `ok`, `data`, `error {code,message,details}`, `correlationId` UUID. Dùng Zod/parseRpcEnvelope và business error hiện có, không bỏ parse để “nhận được dữ liệu”.
- Scope `ALL/OWN/NONE` thực thi server-side. Cost/profit/valuation owner-only, không chỉ ẩn bằng CSS. Không persist chúng trong localStorage/IndexedDB/SW cache; owner query có permission gate và `gcTime: 0` theo kiến trúc.
- Realtime là tín hiệu invalidate/refetch; payload không thay ledger authoritative.
- Giữ URL, query param, DTO version, canonical numeric string, RPC signature và error code khi refactor; thay contract phải có migration/types/tests tương ứng.
- Edge Functions hiện có: `change-initial-password`, `create-employee`, `deactivate-employee`, `reactivate-employee`, `reset-employee-password`; shared code ở `supabase/functions/_shared/`.
- Không dùng user-editable `user_metadata` cho quyền. Secret/service-role chỉ trên server/runtime an toàn.
- Waiver trên Free không đồng nghĩa leaked-password protection. Tài liệu lịch sử ghi policy `OWNER_WAIVER`; chưa đọc lại trạng thái live. Không tuyên bố Auth đã harden nếu chưa xác minh.

## 6. Môi trường và cách chạy

### 6.1 Mô hình môi trường được tài liệu hiện hành quy định

README và P2.0 dùng một Supabase Cloud Free hiện tại làm `CONTROLLED_DEVELOPMENT_UAT`, nhưng lifecycle kỹ thuật giữ `PRODUCTION` để khóa runner nguy hiểm. Có production frontend tại [tuenhi.vercel.app](https://tuenhi.vercel.app) theo README, build từ main. Chưa xác nhận live trong phiên này.

Handoff tháng 9 nói dữ liệu do Owner nhập để UAT; audit tháng 10 ghi đã có 1.099 sản phẩm, 481 khách, 7 record bán. **Đây là số lịch sử, không phải baseline hiện tại và không chứng minh dữ liệu bây giờ đều là test.** Coi dữ liệu Cloud là cần bảo toàn; chỉ Owner xác nhận được đã vận hành thật/chuyển project mới hay chưa.

Các thao tác không được tự chạy trên project hiện tại:

- `test:cloud:*`, Cloud E2E có credential/tạo dữ liệu, `pnpm check:full`.
- `cutover:preflight`, `cutover:cleanup-tests`, cleanup RPC, bootstrap Owner, lifecycle mutation, reset/clear project.
- Fixture `supabase/tests/isolated/*` trên Cloud, tự tạo/xóa dữ liệu test, backfill/sửa ledger tùy ý.
- `db push` khi chưa có scope migration được review/phê duyệt. Tạo handoff không cấp quyền triển khai migration hay phát hành mới.

Giữ một agent chính theo ràng buộc trong handoff cũ; không tự spawn subagent. Có thể kiểm tra nhiều lệnh độc lập song song mà không tạo agent khác.

### 6.2 Local frontend

```bash
cd /Users/admin/tuenhi
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm dev
```

Không cần cài lại dependency nếu node_modules hiện dùng được. Không đổi lockfile/version chỉ để khớp version mới ngoài mạng.

`.env` có sẵn và bị ignore; **không in/copy nội dung vào chat, tài liệu hoặc log**. `.env.example` chỉ liệt kê tên biến.

- Browser được nhận `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- CLI/server dùng các biến runtime riêng như `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `SUPABASE_SECRET_KEY`, thông tin DB khi cần. Không đưa chúng vào `VITE_*`.
- Vite đọc public config lúc build; build đúng phải có public config phù hợp. Không tạo file chứa secret để tiện bàn giao.
- `supabase/.temp/project-ref` là cấu hình link local, chưa xác nhận identity live trong phiên này; không hardcode project mới từ phỏng đoán.

### 6.3 Kiểm thử SQL cô lập

Main có fixture cho PostgreSQL 17 dùng một lần, chỉ Unix socket, `listen_addresses=''`, schema/roles/grants cần thiết, không copy dữ liệu vận hành. Đây không phải Supabase local/Docker stack. Xem [isolated README](../../supabase/tests/isolated/README.md).

Mỗi fixture/runner có tên database và điều kiện riêng; đọc đầu file/runbook trước chạy. Ví dụ `customer_debt_test`, `pos_debt_reminders`, `pos_negative_stock`, `audit_remediation`. Một số fixture rollback; runner concurrency có commit dữ liệu giả và cleanup trong database cô lập. Không mặc định mọi file SQL đều read-only chỉ vì nằm trong tests.

Nhánh staff có test Auth lifecycle với local stack riêng (`78b4b81`); đó là công việc chưa merge. Nếu tiếp tục staff, đọc nhánh và plan tương ứng, không áp giả định môi trường đó cho main.

## 7. Kiểm thử và bằng chứng bàn giao

### 7.1 Lệnh chuẩn và giới hạn

```bash
pnpm check
pnpm p2:verify:cloud
pnpm p2:release:verify
```

`pnpm check` lần lượt: Prettier → ESLint → TypeScript → Vitest → import templates → PDF fonts → build/verifier. `p2:release:verify` = local check + read-only Cloud gate. Cloud gate cần runtime credentials đúng và vẫn kiểm identity/lifecycle; không suy ra từ việc `.env` tồn tại là có đủ mọi credential.

### Kết quả chạy thực tế ngày 07/11/2026

| Kiểm tra                                                    | Kết quả trong phiên bàn giao                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                                                | **FAIL ở Prettier**, cảnh báo `.workbook_build/create_gantt.mjs`; chuỗi dừng trước lint/typecheck/test/build |
| `pnpm lint` chạy riêng                                      | PASS, exit 0                                                                                                 |
| `pnpm typecheck` chạy riêng                                 | PASS, exit 0                                                                                                 |
| `pnpm test` chạy riêng                                      | PASS, **136 test files / 742 tests**, exit 0                                                                 |
| `pnpm templates:verify`                                     | PASS, 7 workbook templates                                                                                   |
| `pnpm fonts:verify`                                         | PASS                                                                                                         |
| `pnpm build` chạy riêng                                     | PASS, gồm TypeScript, Vite, PWA và production-build verifier                                                 |
| Build metrics                                               | Initial JS gzip **218.352 bytes**; CSS gzip **11.873 bytes**; tổng assets **4.236.734 bytes**                |
| `git diff --check`                                          | PASS ở thời điểm rà tài liệu                                                                                 |
| Cloud gate / SQL live / migration history remote            | **Không chạy** trong phiên này                                                                               |
| Isolated SQL / concurrency / browser E2E / production smoke | **Không chạy** trong phiên này                                                                               |

Build có cảnh báo chunk lớn của Vite, nhưng production verifier đạt; không kết luận đây là lỗi tính năng. Build tái sinh `dist/` và TypeScript build info bị Git ignore. Không sửa artifact Gantt để vượt gate. Các kiểm tra riêng đạt không làm thay đổi kết luận rằng **full `pnpm check` chưa đạt trên workspace hiện tại**.

File handoff mới được format riêng bằng Prettier và kiểm tra link nội bộ trước khi giao. Các thay đổi local có sẵn giữ nguyên.

Các lệnh browser có phạm vi an toàn rõ:

```bash
pnpm test:e2e:ci
pnpm test:e2e:recovery
pnpm exec playwright test --config playwright.pos-local.config.ts
PRODUCTION_BASE_URL=https://tuenhi.vercel.app pnpm test:e2e:production
```

CI smoke dùng config giả cho app shell và asset recovery; POS/dashboard local dùng fixtures. Production smoke công khai không credential, không chứng minh thanh toán/trả hàng/thu nợ đã chạy đúng trên live. Không chạy `pnpm test:e2e` mặc định vì có legacy Cloud suites.

### 7.2 Release gate chưa bao phủ mọi assertion mới

Đã đọc `scripts/controlled-development-gate.mjs`: có identity/lifecycle/counts, migration list, DB lint/advisors, Phase 1F, P2.2, P2.3, return lifecycle, operational pagination, feedback và customer debt assertions.

Một số file mới **chưa được gọi trong GATE_COMMANDS**, nên nếu release chạm chúng phải chọn thêm kiểm tra read-only tương ứng:

- `supabase/tests/product_default_cost_assertions.sql`
- `supabase/tests/optional_transfer_proofs_assertions.sql`
- `supabase/tests/customer_debt_reminder_assertions.sql`
- `supabase/tests/negative_inventory_assertions.sql`
- `supabase/tests/dashboard_settlements_assertions.sql`

Không tự mở rộng gate trong phiên chỉ tạo handoff. Gate structural/live invariants cũng không thay behavioral/concurrency tests cô lập.

### 7.3 Build/PWA/CI

- Initial JS budget: **220 KiB gzip**; CSS: **12 KiB gzip**; tổng assets: **4 MiB + 42 KiB** theo verifier hiện tại.
- Verifier bắt buộc manifest/SW/icons, chặn secret material, chặn preload XLSX/ExcelJS/PDF trong app shell. Giữ lazy chunks cho thư viện tài liệu.
- SW precache app shell/static; `runtimeCaching: []`. Không cache API/Auth/Storage/financial/report responses.
- Recovery khi route chunk cũ sau deploy được kiểm qua asset-recovery suite; không đổi thành reload lặp vô hạn hoặc xóa giỏ để chữa asset.
- `.github/workflows/ci.yml`: pnpm check + browser smoke CI.
- Workflow production nhận `vercel.deployment.ready` cho project `tuenhi`, environment production, ref main; status cố định `Vercel - tuenhi: production-smoke`. Có manual workflow_dispatch.
- Cấu hình code workflow không chứng minh blocking check đã bật trong dashboard hay deployment hiện tại đã pass; phải kiểm khi phát hành.

## 8. Migration mới gần nhất và quy trình phát hành

| File                                                      | Ý nghĩa                               |
| --------------------------------------------------------- | ------------------------------------- |
| `20260908072934_purchase_draft_costs.sql`                 | Giá nháp phiếu nhập                   |
| `20260910033337_restore_document_sequences.sql`           | Sequence chứng từ                     |
| `20260910033740_fix_direct_purchase_post_transition.sql`  | Chuyển trạng thái post nhập trực tiếp |
| `20261002091314_sales_provisional_print.sql`              | In tạm                                |
| `20261002091429_warehouse_viewer_access.sql`              | Kho chỉ xem                           |
| `20261002091513_purchase_cancel_and_low_stock_alerts.sql` | Hủy nhập/cảnh báo tồn                 |
| `20261003123755_fix_return_lifecycle.sql`                 | Vòng đời trả hàng                     |
| `20261003144857_add_operational_list_pagination.sql`      | Phân trang operational                |
| `20261005034613_product_default_cost.sql`                 | Giá vốn mặc định                      |
| `20261005035448_sale_discount_validation.sql`             | Guard giảm giá                        |
| `20261006105559_optional_transfer_proofs.sql`             | Ảnh chuyển khoản tùy chọn             |
| `20261006111449_customer_debt.sql`                        | Ledger công nợ/thu/điều chỉnh         |
| `20261015102749_customer_debt_reminders.sql`              | Nhắc nợ quá hạn                       |
| `20261015103004_negative_inventory_deferred_costing.sql`  | Tồn âm/giá vốn bổ sung                |
| `20261016030508_dashboard_settlement_drilldowns.sql`      | Dashboard settlement                  |

Có **63 migration local**. Không khẳng định Cloud đã apply đủ 63 khi chưa đọc migration history live. Không dùng số 48/54 trong handoff/audit cũ làm số hiện tại.

Khi có yêu cầu phát hành cụ thể: đọc runbook tương ứng → xác nhận project và phạm vi duyệt → tests local/SQL cô lập → tạo migration bằng CLI với timestamp do CLI cấp, review additive/preconditions → backup an toàn và dry run đúng danh sách → DB → Edge nếu có → regenerate API types nếu đổi contract → assertions/lint/advisors chỉ đọc → frontend → CI/public smoke → Owner UAT.

Backup/cutover thật theo runbook: archive mã hóa và receipt ngoài repository, xác minh restore/receipt theo quy trình. Không coi artifact build hoặc schema-only test fixture là backup nghiệp vụ.

Rollback thường dùng frontend về deployment tương thích, giữ schema additive và ledger. Không down migration phá dữ liệu, không xóa bảng nợ, không reset project, không sửa số dư trực tiếp để ép qua gate.

## 9. Việc còn mở và cách chọn bước tiếp theo

### 9.1 Các việc rõ ràng cần biết

1. **Staff recovery A14–A15:** có code/test ở nhánh staff, chưa nằm trong main theo ancestry local. Đọc diff, plan, bằng chứng và trạng thái PR/deploy hiện tại trước tiếp tục; không merge chỉ vì có test commit.
2. **Release/UAT gần nhất chưa xác minh:** plan dashboard 16/10 còn hai checkbox commit/deploy và live validation chưa tick, trong khi code đã commit main. Cần bằng chứng GitHub/Vercel/Owner để kết luận, không coi checkbox là trạng thái cuối cùng.
3. **Quality gate local đang bị chặn bởi artifact ngoài POS:** xử lý riêng với Owner khi cần release; không xóa/sửa artifact Gantt trong công việc khác.
4. **Tài liệu bị lệch thực tế:** Master Design/handoff tháng 9 còn ghi không công nợ, replenishment hoãn, POS chặn thiếu tồn; README còn ghi 5 mẫu. Dùng runbook/code mới hơn cho các điểm này. Không tự sửa tất cả tài liệu trong một task tính năng không liên quan.
5. **Thiết bị thật:** chưa xác minh lại iPhone Safari/PWA, bàn phím ảo, camera/chứng từ, máy in nhiệt thật; Chromium local không thay các nghiệm thu đó.
6. **Phạm vi gate:** assertions mới ở mục 7.2 chưa nối vào gate tổng; chọn đúng khi release liên quan.

### 9.2 Roadmap lịch sử, chưa phải lệnh triển khai mới

- P2.4 Management Insights: so sánh kỳ, xu hướng sản phẩm/nhóm/kênh/phương thức, hàng chậm và biến động tồn. Dashboard settlement đã đáp ứng một phần nhu cầu quản trị nhưng chưa đủ bằng chứng toàn bộ P2.4 hoàn tất.
- P2.5 Security/Administration: rà phiên/reset/revoke/JWT, audit viewer/export, least privilege. Staff recovery chưa tương đương hoàn tất P2.5.
- P2.6 Clean Go-live: dự kiến project Supabase thứ hai sạch, schema/config được duyệt, bootstrap một Owner, không copy test/Auth/Storage/ledger cũ, chuyển Vercel sau gate. **Chưa xác minh kế hoạch này đã được thực hiện hay còn phù hợp tình trạng dữ liệu hiện tại.**
- Camera barcode chưa nằm trong phạm vi đã xác nhận; USB/Bluetooth scanner hoạt động kiểu bàn phím.
- Nhà cung cấp gần nhất/gợi ý lượng nhập nâng cao, gộp thông báo và một số tiện ích trong plan 04/10 là ứng viên, chưa tự đưa vào backlog bắt buộc hay tuyên bố đã xong.

Yêu cầu duy nhất của phiên bàn giao là tổng hợp ngữ cảnh. Chưa có yêu cầu tính năng kế tiếp; phiên mới nhận ưu tiên cụ thể từ Owner rồi mới thiết kế/triển khai.

## 10. Tài liệu tham chiếu ưu tiên

Đọc nhanh:

- [README](../../README.md) — cách chạy, môi trường, ranh giới Cloud; đối chiếu các điểm lỗi thời đã nêu.
- [Kiến trúc frontend](../architecture/frontend-architecture.md).
- [P2.0 controlled development](../runbooks/phase-2-p2-0-controlled-development.md).
- [Plan dashboard settlement](../superpowers/plans/2026-10-16-dashboard-settlements.md).
- [Công nợ](../runbooks/2026-10-06-customer-debt.md), [nhắc nợ](../runbooks/customer-debt-reminders.md), [tồn âm](../runbooks/negative-inventory.md).
- [Giảm giá/giá mặc định](../runbooks/2026-10-05-discounts-default-cost.md), [ảnh tùy chọn](../runbooks/2026-10-06-optional-transfer-proofs.md).
- [SQL cô lập](../../supabase/tests/isolated/README.md).

Khi cần lịch sử/quyết định:

- [Spec nền tảng](../superpowers/specs/2026-08-21-internal-single-store-pos-design.md), [Cloud/data entry](../superpowers/specs/2026-08-22-cloud-platform-data-entry-design.md).
- [Master Phase 2](../superpowers/specs/2026-08-31-phase-2-master-design.md), [handoff P2.3 cũ](2026-09-03-p2-3-to-p2-4-handoff.md).
- [Runbook P2.1](../runbooks/phase-2-p2-1-daily-workflow-productivity.md), [P2.2](../runbooks/phase-2-p2-2-connected-business-explorer.md), [P2.3](../runbooks/phase-2-p2-3-customer-purchase-history.md).
- [Nhập hàng/thumbnail](../superpowers/specs/2026-09-08-purchase-entry-and-product-thumbnail-design.md).
- [Feedback 02/10](../runbooks/2026-10-02-customer-feedback-fixes.md), [audit 03/10](../audits/2026-10-03-app-audit.md) và các findings cùng thư mục.
- [Plan safety](../superpowers/plans/2026-10-03-tuenhi-safety-fixes.md), [daily workflows](../superpowers/plans/2026-10-03-tuenhi-daily-workflows.md), [staff recovery](../superpowers/plans/2026-10-03-tuenhi-staff-recovery.md), [next release 04/10](../superpowers/plans/2026-10-04-tuenhi-next-release.md).
- [B8 command recovery](../runbooks/phase-1f-b8-production-stabilization.md), [cutover](../runbooks/phase-1f-production-cutover.md), [B7/B8 report](../reports/2026-08-28-phase-1f-b7-b8-production-stabilization.md).

## 11. Checklist mở đầu phiên mới

1. Đọc tài liệu này; xác nhận đang ở đúng workspace. Kiểm tra `AGENTS.md`/skill áp dụng trong phiên mới.
2. Đọc Git status, log và diff. Nhận diện các thay đổi có sẵn ở mục 2; không reset/clean/stash hoặc commit gộp chúng.
3. Khi cần đồng bộ remote, fetch rồi so sánh SHA; không tự pull/rebase/merge nếu divergence hay đang có thay đổi local.
4. Đọc module/test/runbook đúng yêu cầu mới. Giữ nguyên quy tắc tiền, ledger, quyền, retry và môi trường.
5. Nếu cần xác nhận phát hành: kiểm migration list/identity/lifecycle bằng read-only với credential an toàn; kiểm CI/Vercel đúng commit và Owner UAT. Không lấy public smoke làm bằng chứng mọi giao dịch.
6. Báo rõ baseline gate bị artifact local chặn và phạm vi test thực sự đã chạy; không sửa artifact ngoài task để “cho xanh”.
7. Triển khai theo yêu cầu mới được giao. Handoff không tự cấp quyền merge/push/deploy/migrate hoặc tạo dữ liệu Cloud.

Lệnh mở đầu an toàn:

```bash
cd /Users/admin/tuenhi
git status --short --branch
git log --oneline --decorate -12
git diff --stat
git worktree list
git rev-parse HEAD origin/main
node --version
pnpm --version
```

## 12. Prompt mang sang chat mới

Sao chép đoạn sau; nếu chat mới không truy cập được workspace, đính kèm toàn bộ file handoff này:

```text
Tiếp tục dự án Tuệ Nhi — Bán hàng & Kho tại /Users/admin/tuenhi.

Đọc kỹ docs/handoffs/2026-11-07-project-handoff.md trước khi làm việc, rồi đọc code/test/runbook liên quan đến yêu cầu tôi giao tiếp theo. Hãy dùng handoff tháng 11 làm điểm vào; handoff và roadmap tháng 9 có nhiều giả định đã cũ.

Snapshot bàn giao: main local edc57cb, 63 migration local, chưa xác nhận lại Cloud/Vercel/GitHub live. Đã có công nợ, thu nợ/điều chỉnh, nhắc quá 7 ngày, bán âm kho/ghi giá vốn bổ sung, dashboard settlement theo ngày bán, tiền thừa thanh toán kết hợp, in tạm và ngừng kinh doanh sản phẩm. Nhánh staff recovery còn riêng, chưa coi là đã merge/deploy.

Trước tiên kiểm tra Git read-only và giữ nguyên 3 plan local đã sửa cùng .workbook_build/ và outputs/. pnpm check bị chặn ở định dạng file Gantt ngoài POS; không tự xóa hoặc sửa các artifact này. Đọc kết quả kiểm thử chi tiết trong handoff, không mặc định toàn bộ gate đã xanh.

Chỉ dùng một agent chính. Bảo toàn dữ liệu Cloud; tài liệu quy định CONTROLLED_DEVELOPMENT_UAT với lifecycle PRODUCTION, nhưng tình trạng vận hành thật cần xác minh nếu liên quan. Không chạy Cloud test tạo/xóa dữ liệu, cleanup, bootstrap, reset, lifecycle mutation hoặc fixture SQL cô lập trên Cloud. Không in secret/.env. Handoff này không cấp quyền phát hành hay migration mới.

Sau khi đọc, tóm tắt ngắn trạng thái và các ràng buộc ảnh hưởng đến công việc, rồi thực hiện yêu cầu cụ thể tiếp theo của tôi. Nếu tôi chưa giao yêu cầu tiếp theo, chỉ báo đã nắm ngữ cảnh; không tự bắt đầu P2.4 hay merge nhánh staff.
```
