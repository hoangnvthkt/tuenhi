# P2.3 — Customer Purchase History Design

Ngày: 2026-09-03

Trạng thái: Owner đã duyệt ngày 2026-09-03

## 1. Tóm tắt

P2.3 mở rộng Connected Business Explorer thành Customer Context Hub liên thông
**Khách hàng ↔ Hóa đơn ↔ Phiếu trả ↔ Sản phẩm**. Hồ sơ khách giữ vai trò nguồn
thông tin liên hệ; mọi KPI và lịch sử mua được suy ra từ chứng từ vận hành cùng
`app_private.sales_financial_events`.

Increment chỉ dùng dữ liệu vận hành hiện hành. `legacy_sales` không được cộng
vào KPI hoặc lịch sử P2.3. Sale có `customer_id = null` tiếp tục là khách lẻ và
không được hợp nhất thành một hồ sơ khách giả.

P2.3 bổ sung bốn read-model RPC, một partial index, Customer Context Hub, các
link drill-through và POS customer prefill có kiểm soát. Không thay đổi command
bán hàng/trả hàng, công thức tài chính, dữ liệu hồ sơ khách hoặc quyền hiện hành.

## 2. Mục tiêu

- Mở hồ sơ khách để xem thông tin liên hệ, quy mô mua hàng, lần mua gần nhất và
  hoạt động gần đây.
- Tra cứu hai chiều từ khách tới hóa đơn, phiếu trả và sản phẩm liên quan.
- Tính giá trị mua ròng nhất quán với financial-event ledger Phase 1F.
- Giữ đúng scope `sale.all.read` và `sale.own.read` ở phía database.
- Cho phép mở POS với khách được điền sẵn nhưng không tự ghi hoặc thay khách âm
  thầm.
- Dùng URL làm nguồn chuẩn cho tab và bộ lọc để reload/back/forward không mất
  ngữ cảnh.
- Tránh N+1 và không tải toàn bộ lịch sử vào browser để tự tổng hợp.

## 3. Ngoài phạm vi

- Không tính hoặc hiển thị dữ liệu `legacy_sales`.
- Không tạo hồ sơ đại diện cho khách lẻ `customer_id = null`.
- Không thêm CCCD, ngày sinh, giới tính, mạng xã hội hoặc dữ liệu nhạy cảm mới.
- Không thêm điểm thưởng, hạng thành viên, voucher, công nợ hoặc hạn mức tín
  dụng.
- Không thêm COGS, lợi nhuận hoặc giá vốn vào Customer Context Hub.
- Không thêm danh sách khách mua hàng vào Product Context Hub trong P2.3.
- Không thay đổi payment, cancel, return, sale completion hoặc customer-save
  command.
- Không thêm biểu đồ BI, data warehouse, telemetry, Realtime hoặc dependency
  frontend.
- Không tự tạo dữ liệu Cloud, không chạy synthetic E2E hoặc cleanup.

## 4. Nguồn dữ liệu và semantics

### 4.1 Customer identity

Mọi truy vấn bắt đầu từ một row thật trong `api.customers`. Một giao dịch thuộc
khách khi `api.sales.customer_id = p_customer_id`. Tên/điện thoại snapshot trên
hóa đơn chỉ dùng để hiển thị chứng từ lịch sử; chúng không được dùng để ghép
sale có `customer_id = null` vào hồ sơ hiện tại.

Nếu thông tin khách sau này thay đổi, hồ sơ Context Hub hiển thị master data mới
nhất, còn hóa đơn tiếp tục giữ snapshot tại thời điểm hoàn tất.

### 4.2 Scope giao dịch

Read model xác định scope theo thứ tự:

1. Có `sale.all.read` → `salesScope = ALL` và đọc mọi giao dịch của khách.
2. Không có `sale.all.read` nhưng có `sale.own.read` → `salesScope = OWN`; chỉ
   dùng sale có `created_by = auth.uid()` và event có
   `attributed_user_id = auth.uid()`.
3. Không có hai quyền trên → `salesScope = NONE`; hồ sơ liên hệ vẫn trả về nhưng
   summary là `null` và frontend không gọi các list RPC.

`sale.all.read` không làm mất hiệu lực kiểm tra `customer.read` hoặc
`customer.manage`. Caller phải có quyền xem hồ sơ khách trước khi đọc bất kỳ
dữ liệu liên thông nào.

### 4.3 Financial summary

`netSpend` là tổng `sales_financial_events.net_revenue` sau khi lọc customer,
scope và kỳ. Thành phần summary:

- `completedSalesNet`: tổng dương của `SALE_COMPLETED`.
- `returnedTotal`: trị tuyệt đối tổng âm của `RETURN_COMPLETED`.
- `cancelledTotal`: trị tuyệt đối tổng âm của `SALE_CANCELLED`.
- `netSpend`: tổng cả ba loại event.
- `orderCount`: số sale có event `SALE_COMPLETED` trong kỳ và trạng thái hiện
  hành khác `CANCELLED`.
- `cancelledOrderCount`: số event `SALE_CANCELLED` trong kỳ.
- `completedReturnCount`: số event `RETURN_COMPLETED` trong kỳ.
- `lastPurchaseAt`: thời điểm `SALE_COMPLETED` gần nhất của sale hiện không bị
  hủy trong kỳ.

Với bộ lọc kỳ, tiền và event count phản ánh event phát sinh trong kỳ. Trạng thái
hiện hành được dùng riêng cho `orderCount`/`lastPurchaseAt`, vì hai KPI này mô tả
các hóa đơn mua còn hiệu lực tại thời điểm xem. UI hiển thị riêng doanh số hoàn
tất, tiền trả, tiền hủy và mua ròng để người dùng không suy diễn các số là cùng
một khái niệm.

### 4.4 Date range

Mặc định `from = null` và `to = null`, nghĩa là toàn bộ lịch sử. Một đầu ngày có
thể được dùng độc lập. Khi có đủ hai đầu, yêu cầu `from <= to` và tối đa 366
ngày tính cả hai đầu.

Ngày được đổi thành biên thời gian theo `Asia/Ho_Chi_Minh`:

- `from`: lớn hơn hoặc bằng 00:00 của ngày bắt đầu.
- `to`: nhỏ hơn 00:00 của ngày kế tiếp.

Summary lọc theo `sales_financial_events.occurred_at`; tab hóa đơn lọc theo
`sales.completed_at`; tab trả hàng lọc theo `sale_returns.completed_at`.

### 4.5 Sản phẩm thường mua

Product ranking bắt đầu từ các sale không phải `DRAFT`/`CANCELLED`, thuộc scope
và có `completed_at` trong kỳ đã chọn. Với mỗi sản phẩm:

- `grossSoldQty`: tổng `sale_lines.quantity`.
- `returnedQty`: tổng `accepted_qty` từ return `COMPLETED` của các sale đã chọn,
  kể cả return hoàn tất sau ngày bán.
- `netPurchasedQty`: `grossSoldQty - returnedQty`.
- `grossNetAmount`: tổng `sale_lines.net_amount`.
- `refundedAmount`: tổng `sale_return_lines.refund_amount` thuộc return
  `COMPLETED`.
- `netPurchasedAmount`: `grossNetAmount - refundedAmount`.
- `orderCount`: số sale khác nhau chứa sản phẩm.
- `lastPurchasedAt`: `sales.completed_at` gần nhất.

Cách tính theo cohort sale làm cho một kỳ mua hàng giữ kết quả cuối cùng sau mọi
return, không tạo số lượng âm chỉ vì return diễn ra ngoài kỳ bán. Danh sách sắp
xếp `netPurchasedQty DESC, lastPurchasedAt DESC, productId DESC`.

## 5. Database read models

Tất cả RPC trả envelope `{ok,data,error,correlationId}` hiện hành. Count là JSON
integer. Tiền và số lượng là canonical decimal string. List mặc định 25, tối đa
100, lấy `limit + 1` và trả keyset `nextCursor`; không dùng `OFFSET`.

API wrapper trong `api` dùng `stable`, `security invoker`, `search_path=''`.
Implementation trong `app_private` dùng `stable`, `security definer`,
`search_path=''`. Chỉ `authenticated` được `EXECUTE` trên đúng wrapper và
implementation; `PUBLIC`/`anon` bị revoke.

### 5.1 `api.get_customer_detail`

Signature:

```sql
api.get_customer_detail(
  p_customer_id uuid,
  p_from date default null,
  p_to date default null
)
```

Data:

```text
id, code, customerType, name, phone, email, address,
companyName, taxCode, customerGroup, notes, isActive, version,
salesScope: ALL | OWN | NONE,
purchaseSummary: null | {
  orderCount,
  cancelledOrderCount,
  completedReturnCount,
  completedSalesNet,
  returnedTotal,
  cancelledTotal,
  netSpend,
  lastPurchaseAt
}
```

Caller chỉ có quyền hồ sơ nhận `salesScope=NONE` và `purchaseSummary=null`.
Customer tồn tại nhưng chưa có giao dịch nhận các count bằng `0`, money bằng
`"0"` và `lastPurchaseAt=null`.

### 5.2 `api.list_customer_sales`

Signature:

```sql
api.list_customer_sales(
  p_customer_id uuid,
  p_from date default null,
  p_to date default null,
  p_cursor_completed_at timestamptz default null,
  p_cursor_sale_id uuid default null,
  p_limit integer default 25
)
```

Chỉ trả sale khác `DRAFT`. Mỗi item:

```text
saleId, saleNumber, completedAt, status,
customerNameSnapshot, channelName, createdByName,
paymentMethod, paymentStatus,
originalNetTotal, returnedTotal, effectiveNetTotal
```

`effectiveNetTotal = 0` khi sale `CANCELLED`; trường hợp còn lại bằng
`net_total - tổng refund_total của return COMPLETED`. Cursor:
`{completedAt,saleId}`; thứ tự giảm dần.

### 5.3 `api.list_customer_returns`

Signature:

```sql
api.list_customer_returns(
  p_customer_id uuid,
  p_from date default null,
  p_to date default null,
  p_cursor_completed_at timestamptz default null,
  p_cursor_return_id uuid default null,
  p_limit integer default 25
)
```

Customer purchase history chỉ trả return `COMPLETED`, vì `DRAFT`, `REQUESTED`
và `CANCELLED` chưa tạo financial event. Mỗi item:

```text
returnId, returnNumber, completedAt, reason, refundTotal, refundMethod,
saleId, saleNumber,
lines: [{lineId, productId, sku, productName, unitName,
         acceptedQty, refundAmount}]
```

Cursor: `{completedAt,returnId}`; thứ tự giảm dần. Các return chưa hoàn tất vẫn
được tra cứu từ Sale Detail/Return workflow hiện hành, nhưng không được trình
bày như lịch sử mua đã quyết toán của khách.

### 5.4 `api.list_customer_products`

Signature:

```sql
api.list_customer_products(
  p_customer_id uuid,
  p_search text default null,
  p_from date default null,
  p_to date default null,
  p_cursor_net_purchased_qty text default null,
  p_cursor_last_purchased_at timestamptz default null,
  p_cursor_product_id uuid default null,
  p_limit integer default 25
)
```

`p_search` trim, tối đa 200 ký tự và chỉ tìm SKU hoặc tên snapshot. Cursor text
phải là canonical decimal không âm và đi đủ ba trường. Mỗi item:

```text
productId, sku, productName, unitName, productIsActive,
orderCount, grossSoldQty, returnedQty, netPurchasedQty,
grossNetAmount, refundedAmount, netPurchasedAmount,
lastPurchasedAt
```

Frontend chỉ link `productId` khi session có `catalog.read`. Dữ liệu sản phẩm
snapshot vẫn được hiển thị nếu sản phẩm hiện đã ngừng hoạt động.

### 5.5 Index

Migration thêm đúng index hỗ trợ lịch sử theo khách:

```sql
create index sales_customer_completed_idx
on api.sales (customer_id, completed_at desc, id desc)
where customer_id is not null and status <> 'DRAFT';
```

Các join khác dùng index hiện có: `sale_lines(sale_id,product_id)` unique,
`sale_returns(original_sale_id,status,updated_at,id)`, return line indexes và
partial unique indexes của financial events. Sau migration phải chạy
`EXPLAIN (FORMAT JSON)` trên đường customer sales/event/product; không ép
planner dùng index khi dataset nhỏ.

## 6. Frontend và URL contract

P2.3 mở rộng `src/features/connected-explorer` nhưng tách customer API schemas,
URL parser và component thành file riêng để module P2.2 không tiếp tục phình to.
Không tạo một feature Customer Insights song song.

### 6.1 Routes

Thêm:

- `/more/customers/:customerId`
- `/more/customers/:customerId/edit`

Danh sách `/more/customers` tiếp tục hỗ trợ tạo/sửa nhanh; tên và mã khách trở
thành link tới Context Hub.

### 6.2 URL

`tab` nhận:

- `overview`
- `sales`
- `returns`
- `products`

`from` và `to` áp dụng cho cả bốn tab. `q` chỉ áp dụng cho tab products. Missing
hoặc invalid `tab` dùng `overview`. UUID/ngày/query sai được loại bằng navigation
`replace`; back/forward và reload giữ filter hợp lệ.

### 6.3 Overview

Header hiển thị tên, mã, loại cá nhân/doanh nghiệp và trạng thái. Action bar:

- **Bán cho khách này** khi có `sale.draft.manage` và customer active.
- **Sửa khách hàng** khi có `customer.manage`.

Overview giữ đầy đủ phone, email, address, company, tax code, group và notes.
Nếu có sales scope, hiển thị KPI summary và tối đa năm sale cùng năm return gần
nhất, merge/sort ở client để tạo activity list năm dòng. Hai request độc lập;
lỗi activity không làm mất hồ sơ hoặc KPI.

Với `salesScope=OWN`, ngay dưới tab hiển thị nhãn cố định **Giao dịch của tôi**.
Với `NONE`, chỉ tab Tổng quan xuất hiện và không gọi list RPC.

### 6.4 Sales, returns và products

- Sales tab hiển thị original value, refunded value và effective net cạnh trạng
  thái; link tới `/sales/:saleId`.
- Returns tab hiển thị return, sale gốc, sản phẩm nhận lại và refund; link return
  chỉ render khi có `return.request.create`, sale link theo sales scope.
- Products tab hiển thị gross/returned/net quantity, order count, net amount và
  last purchase; tìm kiếm được submit vào URL, không query theo từng phím.
- Mọi list dùng `useInfiniteQuery`, 25 dòng mỗi lần và nút **Tải thêm**.
- Đổi filter dùng `placeholderData` giữ dữ liệu cũ; section hiển thị trạng thái
  đang cập nhật và lỗi tiếng Việt an toàn.

### 6.5 Link ngược

- Sale Detail tiếp tục dùng invoice read model để hiển thị chứng từ và gọi thêm
  đúng một lần RPC `api.get_sale_detail` hiện hành để lấy `customerId` cùng
  `productId` của các dòng. Customer snapshot trở thành link về Customer Context
  Hub khi caller có quyền hồ sơ; từng dòng link về Product khi có `catalog.read`.
- Return Detail đã có `productId` trên từng dòng và gọi thêm đúng một lần
  `api.get_sale_detail(document.saleId)` khi cần lấy `customerId`; sau đó hiển
  thị link Customer, sale gốc và product theo quyền.
- Hai lookup này dùng scope sale hiện hành, không tạo RPC mới và không sửa
  response của `get_sale_invoice`/`get_sale_return`, nhờ đó migration additive
  vẫn tương thích frontend cũ. Nếu lookup liên kết lỗi, chứng từ vẫn hiển thị và
  chỉ ẩn các link phụ; không có request theo từng dòng.
- Không thêm tab Customer vào Product Detail trong increment này.

## 7. POS customer prefill

Action **Bán cho khách này** mở `/pos?customerId=<uuid>`.

Tạo `PrefilledCustomerIntent` với quy tắc:

1. Chỉ xử lý ở giỏ mới hoặc draft POS hiện hành; tra customer chính xác bằng
   read model, kiểm tra active và quyền.
2. Nếu giỏ chưa có customer và người dùng chưa sửa selection trong lúc lookup,
   điền customer local rồi xóa query bằng navigation `replace`.
3. Nếu giỏ đang có cùng customer, chỉ xóa query.
4. Nếu giỏ có customer khác, hiển thị customer hiện tại và customer từ link;
   chỉ đổi sau khi người dùng bấm **Đổi khách hàng**.
5. **Giữ khách hiện tại** bỏ intent và xóa query.
6. Tab không sở hữu POS lease chỉ hiển thị intent ở trạng thái không thể áp
   dụng; người dùng phải takeover trước.
7. Intent UUID sai, forbidden, missing hoặc inactive không thay đổi cart/search
   và chỉ hiển thị cảnh báo an toàn có thể bỏ qua.

Intent không xóa dòng hàng, không tạo/save draft, không gọi financial command,
không sinh idempotency key và không ghi customer vào storage của user khác.

## 8. Cache và refresh

Query keys tiếp tục có root `connected-explorer`, sau đó là customer ID, sales
scope, filter và cursor đầy đủ. Không persist response vào browser storage.

`refreshOperationalData` đã invalidate root này; sale complete/cancel và return
complete sẽ làm stale Customer Context Hub. Customer save cũng dùng cùng refresh
flow để cập nhật hồ sơ và list.

Không thêm Realtime hoặc polling. Khi quay lại Context Hub, React Query refetch
theo lifecycle hiện hành.

## 9. Error handling

- Strict Zod schemas từ chối extra/private fields và cost/COGS/profit fields.
- Client error chỉ giữ safe code, correlation ID và message map nội bộ; không
  giữ raw Postgres/Supabase details.
- Permission được kiểm tra trước customer existence.
- Entity không tồn tại sau khi permission đạt trả `REFERENCE_NOT_FOUND`.
- Filter/cursor/limit sai trả `VALIDATION_FAILED`.
- Lỗi một section không che hồ sơ hoặc section khác.
- Không gửi lỗi tới Sentry, Supabase hoặc telemetry ngoài.

## 10. SQL assertions

Tạo assertion P2.3 hoàn toàn chỉ đọc:

- Đủ tám functions, đúng invoker/definer, `stable`, empty `search_path`.
- `authenticated` có execute; `PUBLIC`/`anon` không có.
- Không direct grant lên `sales_financial_events`, sale/return cost tables.
- No-session path trả `PERMISSION_DENIED` an toàn.
- Actor `OWN` không nhận sale/event của actor khác; actor `ALL` đối chiếu toàn
  bộ customer.
- Customer detail vẫn trả master data và summary `null` khi không có sales read.
- `customer_id=null` không xuất hiện ở bất kỳ read model nào.
- Summary money/count khớp aggregate financial events độc lập.
- Sale cancelled, return completed và return chưa completed có semantics đúng.
- Product quantity/amount khớp sale lines và completed return lines.
- Cursor trang kế tiếp không trùng/bỏ sót khi timestamp hoặc quantity bằng nhau.
- Nếu Cloud không có actor/dataset phù hợp, assertion ghi `NOTICE SKIPPED`; không
  tạo Auth user, customer, sale hoặc return test.

## 11. Frontend tests

- DTO strict parsing, canonical decimal, cursor và safe client error.
- URL canonicalization, lifetime default, one-sided date, invalid/overlong range,
  reload và back/forward.
- Customer master data tải độc lập với transaction permission.
- `ALL`, `OWN`, `NONE` hiển thị và gọi API đúng scope server trả về.
- Overview partial failures không làm mất hồ sơ/KPI.
- Sales/returns/products pagination không trùng hoặc bỏ sót.
- Cost/COGS/profit không render kể cả response chứa field ngoài contract.
- Customer list/detail/edit tái sử dụng `CustomerForm` hiện hành.
- Sale/Return/Product drill-through render theo permission; lookup liên kết lỗi
  chỉ ẩn link và không làm mất nội dung chứng từ.
- POS prefill: empty/same/different customer, confirm/dismiss, inactive/invalid,
  async user edit, readonly lease và marker đúng user.
- Không test nào gọi mutation khi chỉ mở deeplink.

## 12. Release và Owner UAT

Thứ tự release:

1. Xác nhận `main`/`origin/main` đã chứa P2.2 closure và không divergence; cập
   nhật Master Design.
2. Ghi baseline scrubbed counts bằng `pnpm p2:release:verify`.
3. Tạo migration qua Supabase CLI, review SQL và `db push --linked --dry-run`.
4. Apply duy nhất migration additive đã duyệt lên
   `CONTROLLED_DEVELOPMENT_UAT`.
5. Regenerate Supabase types, chạy P2.3 SQL assertions/lint/advisors và xác nhận
   counts không đổi.
6. Deploy frontend, chờ `Vercel - tuenhi: production-smoke` đạt trước promotion.
7. Owner UAT Context Hub và POS customer prefill bằng dữ liệu test thủ công.

Quality gate gồm targeted Vitest, `git diff --check`, `pnpm check`,
`pnpm p2:verify:cloud` và `pnpm p2:release:verify`. Gate Controlled Development
được mở rộng thêm `p2.3Assertions` sau P2.2 assertions.

Owner UAT:

1. Customer → Sale → Return/Product và quay về Customer.
2. Sale/Return → Customer/Product theo đúng quyền.
3. So sánh lifetime KPI với các chứng từ test đã biết.
4. Lọc một kỳ có sale, return và cancel; đối chiếu từng thành phần summary.
5. Tài khoản `sale.own.read` chỉ thấy giao dịch của mình và nhãn scope rõ ràng.
6. Customer không có giao dịch vẫn tải hồ sơ/KPI 0.
7. POS prefill empty/same/different customer không tự save hoặc đổi âm thầm.
8. Reload/back/forward trên desktop/mobile giữ tab và filter.

Nếu thiếu dataset, Owner tự tạo/hoàn tất/hủy/trả một bộ chứng từ test qua UI và
ghi nhận riêng counts. Không chạy Cloud automation tạo dữ liệu.

## 13. Rollback

- Frontend dùng Vercel Instant Rollback về deployment tốt gần nhất.
- Database giữ migration additive; frontend cũ không gọi RPC P2.3.
- Không chạy down migration, drop function/index hoặc sửa financial ledger tại
  chỗ.
- Nếu summary sai, dừng Owner UAT ghi dữ liệu và đối chiếu read-only với event
  ledger/correlation ID; không mở grant tạm lên private tables.

## 14. Giả định

- Project hiện tại tiếp tục là `CONTROLLED_DEVELOPMENT_UAT`, lifecycle kỹ thuật
  `PRODUCTION`, policy hiện hành `OWNER_WAIVER`.
- P2.2 đã được Owner nghiệm thu ngày 2026-09-03.
- Financial-event ledger và sale/return snapshots hiện hành là authoritative.
- Quy mô dữ liệu hiện tại phù hợp keyset/on-demand query; không cần materialized
  view hoặc background aggregation.
- Camera barcode, Inventory Replenishment, Management Insights và clean go-live
  tiếp tục nằm ngoài P2.3.
