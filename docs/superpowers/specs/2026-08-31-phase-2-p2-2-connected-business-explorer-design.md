# P2.2 — Connected Business Explorer Design

Ngày: 2026-08-31

Trạng thái: Owner đã duyệt

## 1. Tóm tắt

P2.2 biến các màn hình nghiệp vụ rời rạc thành một mạng dữ liệu có thể
drill-through giữa Sản phẩm, Nhà cung cấp và Phiếu nhập. Mỗi trang chi tiết là
một **Context Hub** gồm action bar, KPI ngắn, tab dữ liệu liên quan và deeplink
ổn định.

Quan hệ Sản phẩm–Nhà cung cấp không được khai báo thủ công. Hệ thống chỉ suy ra
quan hệ từ dòng sản phẩm thuộc phiếu nhập đang ở trạng thái `POSTED`. Phiếu
`DRAFT`, `AWAITING_COST`, `CANCELLED` hoặc `REVERSED` không tạo quan hệ và không
được tính vào lịch sử liên thông.

Increment này cần migration additive để bổ sung read-model RPC và một index phục
vụ truy vấn. Migration không sửa, xóa hoặc backfill dữ liệu và không thay đổi
command nhập hàng, giá vốn hoặc tồn kho.

## 2. Mục tiêu

- Từ chi tiết sản phẩm, người dùng xem được các Nhà cung cấp từng cung cấp sản
  phẩm, lịch sử từng lần nhập và deeplink tới Nhà cung cấp/Phiếu nhập.
- Từ chi tiết Nhà cung cấp, người dùng xem đầy đủ hồ sơ, các mặt hàng từng cung
  cấp, lịch sử nhập và deeplink tới Sản phẩm/Phiếu nhập.
- Cung cấp nút nhanh Bán hàng và Nhập hàng theo đúng ngữ cảnh nhưng không tự ghi
  dữ liệu.
- Giữ URL của tab và bộ lọc để reload, back/forward và chia sẻ deeplink không
  làm mất ngữ cảnh.
- Cho phép nhân viên có quyền nghiệp vụ xem Nhà cung cấp, phiếu và số lượng,
  trong khi giá nhập tiếp tục chỉ dành cho `purchase.cost.read`.
- Tránh N+1 bằng read model tổng hợp tại database và keyset pagination.

## 3. Ngoài phạm vi

- Không thêm biểu đồ, dashboard BI, data warehouse hoặc telemetry.
- Không nối Hóa đơn bán hoặc Khách hàng trong P2.2.
- Không tạo Nhà cung cấp chính hoặc bảng liên kết Sản phẩm–Nhà cung cấp.
- Không thay đổi payment, purchase post/reverse, inventory ledger hoặc costing.
- Không tự tạo, ghi, gửi, đảo hoặc xóa chứng từ qua deeplink.
- Không thêm camera barcode, offline financial write hoặc dependency frontend.
- Không chạy automation tạo/xóa dữ liệu, `test:cloud:*`, cleanup, bootstrap,
  lifecycle mutation hoặc Cloud E2E có credential.

## 4. Quyết định UX

### 4.1 Context Hub

Hai trang chi tiết dùng cùng một pattern:

1. Breadcrumb và tiêu đề entity.
2. Action bar theo quyền.
3. KPI ngắn, không có biểu đồ.
4. Tab lưu trong URL.
5. Bảng/timeline có deeplink trên tên và mã chứng từ.
6. Loading, empty state và lỗi an toàn riêng cho từng section.

Desktop dùng lưới thông tin và bảng; mobile xếp một cột, action bar wrap và tab
cuộn ngang. Không tạo split explorer hoặc relationship graph riêng.

### 4.2 Context Hub sản phẩm

Route hiện hành `/products/:productId` được giữ nguyên. Query param `tab` nhận:

- `overview`: thông tin sản phẩm, ảnh, tồn, giá bán, lịch sử giá bán hiện hành và
  tối đa năm dòng nhập gần nhất.
- `suppliers`: các Nhà cung cấp từng cung cấp sản phẩm.
- `purchases`: lịch sử từng lần nhập sản phẩm.

Các query param lọc hợp lệ:

- `supplierId`: UUID Nhà cung cấp, chỉ dùng trong tab lịch sử nhập.
- `from`, `to`: ngày ISO `YYYY-MM-DD`.

Action bar:

- **Bán hàng** → `/pos?focusProduct=<productId>`.
- **Nhập hàng** → `/more/purchases/new?productId=<productId>`.
- **Sửa sản phẩm** giữ route và quyền hiện hành.

Mỗi thẻ Nhà cung cấp có deeplink tới `/more/suppliers/:supplierId` và action
**Nhập từ NCC này** tới
`/more/purchases/new?productId=<productId>&supplierId=<supplierId>`.

### 4.3 Context Hub Nhà cung cấp

Thêm các route:

- `/more/suppliers/:supplierId`: chi tiết Nhà cung cấp.
- `/more/suppliers/:supplierId/edit`: sửa bằng `SupplierForm` hiện hành.

Danh sách `/more/suppliers` tiếp tục hỗ trợ tìm kiếm và tạo mới. Tên Nhà cung
cấp trở thành link tới trang chi tiết; nút sửa ở danh sách được giữ trong P2.2
để không làm chậm thao tác hiện hành.

Trang chi tiết hiển thị mã, tên, điện thoại, email, địa chỉ, ghi chú, trạng thái
và version hiện hành. Query param `tab` nhận:

- `overview`: thông tin liên hệ, KPI và tối đa năm dòng nhập gần nhất.
- `products`: các mặt hàng từng cung cấp.
- `purchases`: lịch sử nhập.

Các query param lọc hợp lệ:

- `q`: tối đa 200 ký tự, tìm SKU hoặc tên sản phẩm trong tab mặt hàng.
- `productId`: UUID sản phẩm, lọc tab lịch sử nhập.
- `from`, `to`: ngày ISO `YYYY-MM-DD`.

Action bar:

- **Lập phiếu nhập** → `/more/purchases/new?supplierId=<supplierId>`.
- **Sửa** → `/more/suppliers/:supplierId/edit` khi có `supplier.manage`.

Tên sản phẩm link tới `/products/:productId`; mã phiếu link tới
`/more/purchases/:receiptId`.

### 4.4 Hành vi deeplink ghi dữ liệu

Deeplink chỉ điền sẵn ngữ cảnh, không gọi RPC mutation:

- POS kiểm tra `focusProduct`, tra chính xác sản phẩm và hiển thị lựa chọn đang
  focus. Người dùng phải bấm thêm hoặc nhấn `Enter`; sản phẩm không tự vào giỏ.
- Sau khi người dùng thêm hoặc bỏ qua lựa chọn, POS xóa `focusProduct` khỏi URL
  bằng navigation `replace` để reload không xử lý lại.
- Trang tạo phiếu nhập kiểm tra `productId` và `supplierId`, sau đó điền sẵn dòng
  local và Nhà cung cấp. Không tạo draft trước khi người dùng bấm lưu.
- Từ header sản phẩm, Nhà cung cấp để trống. Từ thẻ Nhà cung cấp trong sản phẩm,
  cả hai giá trị được điền. Từ Context Hub Nhà cung cấp, chỉ Nhà cung cấp được
  điền.
- UUID sai, entity không tồn tại, entity ngừng hoạt động hoặc thiếu quyền bị bỏ
  qua với cảnh báo tiếng Việt an toàn; không hiển thị raw Supabase error.

## 5. Semantics dữ liệu

### 5.1 Quan hệ Sản phẩm–Nhà cung cấp

Một quan hệ tồn tại khi:

```text
purchase_receipts.status = POSTED
AND purchase_receipts.supplier_id IS NOT NULL
AND purchase_receipt_lines.product_id = productId
```

Phiếu `REVERSED` bị loại ngay khi status đổi, nên quan hệ và mọi tổng hợp được
tính lại từ trạng thái hiện hành, không cần cleanup hoặc materialized table.

Các tổng hợp số lượng dùng `received_qty` từ dòng phiếu. Thời điểm sắp xếp dùng
`received_at DESC`, sau đó `purchase_receipt_id DESC` và
`purchase_receipt_line_id DESC` để kết quả ổn định.

Phiếu `POSTED` không chọn Nhà cung cấp vẫn xuất hiện trong lịch sử sản phẩm với
nhãn “Không chọn nhà cung cấp”, nhưng không làm tăng `supplierCount` và không
tạo deeplink Nhà cung cấp.

### 5.2 Giá nhập

Giá lấy từ `app_private.purchase_receipt_line_costs` theo đúng dòng phiếu. Không
dùng giá vốn bình quân hiện hành để thay thế giá từng lần nhập.

Response luôn có cờ `canReadCost`. Khi caller không có
`purchase.cost.read`, các trường `unitCost`, `lineCost`, `latestUnitCost` và
`totalPostedCost` phải là `null`. Không được trả giá rồi chỉ ẩn bằng CSS.

## 6. Read-model RPC

Mọi RPC trả envelope hiện hành `{ ok, data, error, correlationId }`. API wrapper
trong schema `api` dùng `security invoker`; implementation đặt trong
`app_private`, dùng `security definer` và `set search_path = ''`.

Trong spec này, “quyền đọc nghiệp vụ phiếu nhập” nghĩa là caller có ít nhất một
trong `purchase.operational.read`, `purchase.draft.manage` hoặc
`purchase.cost.read`.

### 6.1 `api.get_product_relationship_context`

Input:

```text
p_product_id uuid
```

Yêu cầu `catalog.read` và quyền đọc nghiệp vụ phiếu nhập.

Data:

```text
productId
supplierCount
postedReceiptCount
totalReceivedQty
lastReceivedAt
latestUnitCost | null
canReadCost
```

`latestUnitCost` lấy từ dòng thuộc phiếu `POSTED` mới nhất theo thứ tự ổn định,
kể cả phiếu không chọn Nhà cung cấp.

### 6.2 `api.list_product_suppliers`

Input:

```text
p_product_id uuid
p_cursor_last_received_at timestamptz default null
p_cursor_supplier_id uuid default null
p_limit integer default 25
```

Yêu cầu `catalog.read` và quyền đọc nghiệp vụ phiếu nhập. `p_limit` trong khoảng
1–100; cursor phải có đủ cả hai trường hoặc cùng `null`.

Mỗi item:

```text
supplierId
supplierCode | null
supplierName
supplierIsActive
postedReceiptCount
totalReceivedQty
lastReceivedAt
latestReceiptId
latestReceiptNumber
latestUnitCost | null
canReadCost
```

Chỉ trả Nhà cung cấp khác `null` có quan hệ qua phiếu `POSTED`. Caller có quyền
đọc phiếu vẫn thấy tên Nhà cung cấp; frontend chỉ render deeplink hồ sơ khi
session có `supplier.read` hoặc `supplier.manage`.

### 6.3 `api.get_supplier_detail`

Input:

```text
p_supplier_id uuid
```

Yêu cầu `supplier.read` hoặc `supplier.manage`. Data gồm toàn bộ trường
`SupplierItem` hiện hành và:

```text
canReadPurchases
canReadCost
distinctProductCount | null
postedReceiptCount | null
totalReceivedQty | null
lastReceivedAt | null
totalPostedCost | null
```

`canReadPurchases` được tính theo đúng nhóm quyền đọc nghiệp vụ đã định nghĩa ở
trên. Nếu giá trị này là `false`, các KPI mua hàng là `null`; thông tin liên hệ
Nhà cung cấp vẫn tải được. Giá chỉ có giá trị khi `canReadCost=true`.

### 6.4 `api.list_supplier_products`

Input:

```text
p_supplier_id uuid
p_search text default null
p_cursor_last_received_at timestamptz default null
p_cursor_product_id uuid default null
p_limit integer default 25
```

Yêu cầu quyền xem Nhà cung cấp và quyền đọc nghiệp vụ phiếu nhập. `p_limit`
trong khoảng 1–100; cursor phải có đủ cả hai trường hoặc cùng `null`.

Mỗi item:

```text
productId
sku
productName
unitName
isActive
postedReceiptCount
totalReceivedQty
lastReceivedAt
latestReceiptId
latestReceiptNumber
latestUnitCost | null
canReadCost
```

Chỉ aggregate các phiếu `POSTED` của đúng Nhà cung cấp. Search dùng SKU hoặc tên
sản phẩm đã trim; không thêm fuzzy search trong P2.2.

### 6.5 `api.list_posted_purchase_history`

Input:

```text
p_product_id uuid default null
p_supplier_id uuid default null
p_from date default null
p_to date default null
p_cursor_received_at timestamptz default null
p_cursor_receipt_id uuid default null
p_cursor_line_id uuid default null
p_limit integer default 25
```

Ít nhất một trong `p_product_id`, `p_supplier_id` phải có giá trị. Nếu lọc theo
sản phẩm, caller cần `catalog.read`; nếu lọc theo Nhà cung cấp, caller cần
`supplier.read` hoặc `supplier.manage`. Caller luôn cần một quyền đọc nghiệp vụ
phiếu nhập. Nếu cả hai filter có giá trị thì phải thỏa cả hai nhóm quyền.

Mỗi item là một dòng sản phẩm trong một phiếu `POSTED`:

```text
lineId
receiptId
receiptNumber
receivedAt
supplierId | null
supplierName | null
productId
sku
productName
unitName
receivedQty
unitCost | null
lineCost | null
canReadCost
```

Khoảng ngày là inclusive theo `received_at` trong múi giờ nghiệp vụ
`Asia/Ho_Chi_Minh`. Nếu cả `from` và `to` có giá trị thì `from <= to` và khoảng
không vượt quá 366 ngày. Không truyền ngày nghĩa là duyệt toàn lịch sử bằng
cursor.

## 7. Index và hiệu năng

Giữ index hiện hành
`purchase_receipt_lines(product_id, purchase_receipt_id)`. Migration bổ sung:

```sql
create index purchase_receipts_posted_supplier_received_idx
on api.purchase_receipts (supplier_id, received_at desc, id desc)
where status = 'POSTED' and supplier_id is not null;
```

RPC phải tổng hợp bằng join/batch query trong database; frontend không gọi cost
detail theo từng phiếu. Mỗi list trả tối đa `p_limit` item và `nextCursor`; không
dùng `OFFSET`.

Implementation phải kiểm tra `EXPLAIN (FORMAT JSON)` trên các query chính và
không thêm index thứ hai nếu index hiện hành đã đáp ứng đường truy vấn sản phẩm.

## 8. Frontend contracts và component boundaries

Thêm client-side schemas và types riêng cho năm RPC. Không nới `.strict()` của
DTO hiện hành và không thêm field vào `get_product_detail`, để frontend cũ vẫn
tương thích sau migration.

Các component và boundary triển khai:

- `EntityActionBar`: action link theo quyền và ngữ cảnh.
- `ContextTabs`: tab đọc/ghi URL có allowlist.
- `RelationshipKpis`: KPI có state không quyền/không dữ liệu.
- `SupplierRelationshipList`: danh sách Nhà cung cấp của sản phẩm.
- `SupplierProductList`: mặt hàng Nhà cung cấp từng cung cấp.
- `PostedPurchaseHistory`: bảng/timeline dùng chung cho hai Context Hub.
- `SupplierDetailPage`: route chi tiết/sửa và partial query orchestration.
- `PrefilledProductIntent`: xử lý `focusProduct` tại POS mà không tự thêm.
- `PurchasePrefillIntent`: xác thực và điền local form tạo phiếu nhập.

React Query keys phải gồm entity ID và toàn bộ filter/cursor. Tab overview tải
entity cốt lõi trước; các query liên thông có lỗi độc lập và không làm mất trang
chi tiết. `placeholderData` giữ dữ liệu cũ trong lúc đổi filter.

Không persist response chứa giá nhập vào `localStorage`, IndexedDB hoặc PWA
runtime cache. Service worker tiếp tục chỉ precache app shell/static assets.

## 9. Điều hướng, URL và quyền

URL là nguồn chuẩn cho tab/filter. Giá trị ngoài allowlist được thay bằng default
qua navigation `replace`; không tạo vòng lặp history.

Hiển thị và truy cập được kiểm soát ở cả hai lớp:

- Frontend ẩn action/tab khi session thiếu quyền để tránh ngõ cụt UX.
- Route dùng `RequireSession` như hiện hành.
- Database RPC luôn kiểm tra quyền lại; frontend không phải security boundary.

Tên Nhà cung cấp vẫn có thể xuất hiện trong lịch sử phiếu khi caller có quyền
đọc nghiệp vụ; deeplink hồ sơ Nhà cung cấp chỉ render khi caller có
`supplier.read` hoặc `supplier.manage`. Giá nhập không render nếu
`canReadCost=false`.

## 10. Error handling

- Entity cốt lõi lỗi: hiển thị trang lỗi tiếng Việt an toàn, correlation ID nếu
  envelope cung cấp và nút thử lại.
- KPI hoặc list liên thông lỗi: chỉ section đó hiển thị lỗi; thông tin sản
  phẩm/Nhà cung cấp vẫn dùng được.
- Filter/deeplink sai: bỏ intent hoặc filter, giữ form/cart hiện hành và hiển thị
  cảnh báo an toàn.
- Permission thay đổi giữa session: RPC trả `PERMISSION_DENIED`; frontend xóa
  cache section liên quan và không hiển thị cached cost.
- Không hiển thị SQL, raw Supabase error, stack trace hoặc private payload.

## 11. Invalidation

Sau các command purchase save/post/reverse/cancel hiện hành,
`refreshOperationalData` invalidates:

- product relationship context;
- supplier detail KPI;
- supplier products;
- posted purchase history.

Một phiếu chuyển `POSTED` xuất hiện trong Context Hub sau refresh. Một phiếu
chuyển `REVERSED` biến mất khỏi quan hệ/lịch sử sau refresh. Không dùng Realtime
hoặc polling mới trong P2.2.

## 12. Migration và security assertions

Migration P2.2 chỉ gồm function, grant/revoke và index additive. Không DML,
backfill, trigger, table mới hoặc thay đổi function hiện hành.

SQL assertions phải chứng minh:

- `anon` và session không xác thực không gọi được năm RPC.
- `authenticated` chỉ có `EXECUTE` trên năm API wrapper và năm private
  implementation tương ứng; private schema vẫn không được expose qua Data API.
- Không có direct grant mới trên `app_private.purchase_receipt_line_costs`.
- Implementation là `security definer`, wrapper là `security invoker`, mọi
  function đặt `search_path=''`.
- Product/supplier permission isolation đúng cho từng tổ hợp filter.
- Caller thiếu `purchase.cost.read` nhận cost fields `null`.
- Chỉ `POSTED` được tính; `REVERSED`, `CANCELLED`, `DRAFT` và `AWAITING_COST` bị
  loại.
- Cursor, date range, UUID/filter và limit fail closed với mã lỗi an toàn.

## 13. Kiểm thử frontend

### Product Context Hub

- Tab/filter được restore từ URL và back/reload giữ nguyên.
- Nhà cung cấp, sản phẩm và phiếu mở đúng deeplink.
- Header Nhập hàng không tự chọn Nhà cung cấp.
- Action từ thẻ Nhà cung cấp truyền đúng cả hai ID.
- Cost KPI/list ẩn khi `canReadCost=false`.
- Partial query error không làm mất product detail.

### Supplier Context Hub

- Danh sách Nhà cung cấp link tới route chi tiết.
- Trang hiển thị đủ thông tin master và action theo quyền.
- Tab mặt hàng/lịch sử phân trang 25, giữ dữ liệu khi refetch và lọc URL.
- Product/receipt links giữ đúng ID.
- Caller chỉ có supplier permission vẫn xem contact nhưng không tải purchase
  sections.

### Deeplink intents

- POS focus chính xác sản phẩm nhưng không tự thêm vào cart.
- Xác nhận mới thêm sản phẩm và xóa intent bằng `replace`.
- Phiếu nhập mới prefill đúng product/supplier nhưng không gọi save.
- Invalid/inactive/forbidden IDs bị bỏ qua mà không đổi cart/draft.
- Reload không lặp lại intent đã được xử lý.

## 14. Kiểm thử database

Mọi automated Cloud assertion của P2.2 là read-only; không insert, update,
delete, gọi command nghiệp vụ hoặc tạo Auth user. Assertions kiểm tra:

- Mọi receipt ID do read model trả về đang có status `POSTED`.
- Trên dữ liệu hiện có, supplier count, receipt count, distinct product count,
  quantity và latest row khớp một aggregate SQL độc lập chỉ đọc.
- Phiếu `POSTED` không chọn Nhà cung cấp, nếu có, xuất hiện ở product history
  nhưng không tăng supplier count.
- Cost fields và permission branch được kiểm tra bằng contract/unit tests;
  metadata assertions xác nhận không có direct grant lên private cost table.
- Search và keyset cursor được kiểm tra bằng unit fixtures, gồm các timestamp
  bằng nhau, không trùng hoặc bỏ sót item.
- Metadata/grant assertions xác nhận actor thiếu product/supplier permission bị
  chặn fail-closed và anonymous không có execute privilege.
- Grants và private table isolation hiện hành không thay đổi.

Việc quan sát một quan hệ biến mất sau `REVERSED` chỉ thực hiện trong Owner UAT
thủ công trên chứng từ test được ghi nhận riêng; không tự động mutate Cloud để
phục vụ test.

## 15. Release và rollback

P2.2 implementation chỉ mở sau khi P2.1 được tích hợp vào `main`. Thứ tự release:

1. Tạo/review migration additive và regenerate Supabase TypeScript types.
2. Chạy local unit/SQL tests, `pnpm check` và production-build verifier.
3. Áp migration lên project `CONTROLLED_DEVELOPMENT_UAT` theo plan P2.2 được
   Owner duyệt riêng.
4. Xác minh read RPC với entity hiện có; không tạo dữ liệu tự động.
5. Deploy frontend tương thích ngược.
6. Chờ check `Vercel - tuenhi: production-smoke` đạt trước promotion.
7. Owner UAT thủ công. Nếu chưa có lịch sử nhập, Owner tự tạo một phiếu test hợp
   lệ và ghi nhận riêng thay đổi counts.

Rollback frontend dùng Vercel Instant Rollback. Database giữ contract additive;
không chạy down migration phá dữ liệu. Cleanup RPC/index, nếu từng cần, là một
release riêng sau khi không còn consumer.

## 16. Tiêu chí nghiệm thu

- Sản phẩm ↔ Nhà cung cấp ↔ Phiếu nhập drill-through được theo cả hai chiều.
- Mọi quan hệ và KPI chỉ dựa trên phiếu `POSTED`.
- Không có N+1 cost/detail request từ frontend.
- Giá nhập không rời security boundary `purchase.cost.read`.
- Deeplink không tự ghi dữ liệu và không làm hỏng giỏ/draft hiện có.
- URL tab/filter ổn định qua reload/back và hoạt động trên mobile/desktop.
- Migration additive không thay đổi application counts.
- `pnpm check`, SQL assertions, DB lint/advisor, `p2:release:verify` và public
  production smoke đều đạt trước Owner UAT.
