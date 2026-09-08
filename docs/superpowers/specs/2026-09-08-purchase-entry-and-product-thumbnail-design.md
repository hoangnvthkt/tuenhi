# Nhập phiếu mua có giá tại dòng, Excel và ảnh đại diện hàng hóa

Ngày: 2026-09-08

Trạng thái: Owner đã duyệt phạm vi trải nghiệm ngày 2026-09-08; chờ duyệt đặc tả này trước khi lập kế hoạch triển khai.

## 1. Tóm tắt

Thay đổi này rút ngắn quy trình lập phiếu nhập: người lập phiếu nhập sản phẩm, số lượng và đơn giá ngay trên bản nháp; owner chỉ còn ghi sổ. Người dùng có thể nạp các dòng sản phẩm từ một mẫu Excel an toàn và phải sửa hết lỗi trước khi nạp. Danh sách Hàng hóa hiển thị thumbnail của ảnh đại diện đã chọn.

Ba phần dùng dữ liệu và cơ chế hiện có, không tạo một nghiệp vụ mua hàng thứ hai:

- Phiếu nhập vẫn là nguồn duy nhất làm tăng tồn kho khi được ghi sổ.
- NCC, thời gian nhận và ghi chú vẫn được lập trên màn hình phiếu, không có trong file Excel.
- Ảnh vẫn thuộc bucket riêng tư `product-images`; browser chỉ nhận signed URL có hạn.

## 2. Mục tiêu và ngoài phạm vi

### 2.1 Mục tiêu

- Cho phép người có quyền lập phiếu nhập nhập giá nhập bắt buộc cho từng dòng hàng ngay khi tạo/sửa bản nháp.
- Đổi chọn sản phẩm từ select tải sẵn thành ô gõ tìm theo tên, SKU hoặc mã vạch.
- Nạp nhiều dòng `SKU`, số lượng và giá nhập từ đúng mẫu `.xlsx`, có preview và chỉ cho nạp khi toàn bộ dòng hợp lệ.
- Hiển thị ảnh đại diện trên danh sách Hàng hóa khi sản phẩm có `primaryImagePath`.
- Duy trì kiểm soát quyền giá vốn, optimistic version, idempotency, kiểm tra server-side và audit trail hiện có.

### 2.2 Ngoài phạm vi

- Không tạo/sửa hàng hóa, NCC, ngày nhận hoặc ghi chú từ file Excel.
- Không cho nhập CSV, XLS, macro, formula, external link hoặc file không đúng template.
- Không tự lưu nháp, tự ghi sổ, tự tạo NCC hoặc tự tạo hàng hóa khi nạp Excel.
- Không cho phép một sản phẩm xuất hiện hai lần trên cùng phiếu.
- Không thay đổi công thức bình quân giá vốn, stock movement, đảo phiếu, hay quyền `purchase.post`.
- Không làm ảnh hàng hóa thành công khai, không đổi loại tệp/giới hạn upload ảnh.

## 3. Quy trình phiếu nhập mới

### 3.1 Màn hình và trạng thái

Màn lập/sửa phiếu `DRAFT` có bảng dòng hàng theo thứ tự:

```text
Sản phẩm (gõ để tìm) | Số lượng nhận | Đơn giá nhập | Xóa
```

Ô sản phẩm tìm theo tên, SKU hoặc mã vạch, có debounce ngắn và danh sách kết quả giới hạn. Kết quả hiển thị SKU, tên, đơn vị; không cho chọn hàng ngừng hoạt động hoặc hàng đã nằm ở một dòng khác. Người dùng có thể thao tác bằng bàn phím và vẫn có link mở chi tiết sản phẩm sau khi chọn.

`Số lượng nhận` là canonical decimal dương, tối đa 3 số lẻ. `Đơn giá nhập` là canonical money dương, tối đa 2 số lẻ. Giá bằng 0, rỗng, sai định dạng hoặc trùng sản phẩm làm nút Lưu nháp trả lỗi tại dòng và không gọi command.

Nút **Gửi owner nhập giá** bị loại bỏ. Nháp có đủ giá vẫn mang trạng thái `DRAFT`; người có `purchase.post` thấy nút **Ghi sổ** và có thể ghi sổ trực tiếp. Trước khi ghi sổ, server kiểm tra lại toàn bộ giá, sản phẩm còn hoạt động, version và số dư.

`AWAITING_COST` chỉ được giữ để đọc/xử lý các phiếu lịch sử đã ở trạng thái này; hệ thống không tạo thêm phiếu mới ở trạng thái đó. Phiếu lịch sử không tự bị thay đổi trạng thái hoặc giá.

### 3.2 Quyền và tính riêng tư của giá nhập

`purchase.cost.enter` được gán cho đúng các vai trò đã được phép `purchase.draft.manage`, để người lập phiếu có thể lưu giá nhập. `purchase.post` vẫn là quyền ghi sổ riêng của owner/người được ủy quyền.

Không mở quyền xem giá vốn chung:

- Người tạo có `purchase.draft.manage` + `purchase.cost.enter` chỉ đọc/sửa giá của nháp do chính họ lập.
- Người có `purchase.cost.read` vẫn xem được giá của mọi phiếu theo quyền hiện hành, gồm phiếu đã ghi sổ.
- Người sửa nháp của người khác phải có `purchase.post` và `purchase.cost.read` để nhìn/chỉnh giá. Không có quyền này thì server từ chối thay vì làm mất giá.

Giá nháp được lưu trong bảng private riêng, khóa theo dòng phiếu và cascade khi dòng nháp bị thay thế. Bảng lưu `unit_cost`, `line_cost`, người nhập và thời điểm cập nhật. RPC chi tiết giá chỉ trả dữ liệu nháp cho creator hợp lệ hoặc người có `purchase.cost.read`; dữ liệu operational không có giá vốn.

### 3.3 Command và dữ liệu

`save_purchase_receipt_draft` nhận mỗi line:

```text
productId, receivedQty, unitCost
```

Server xác thực shape JSON chính xác, product UUID duy nhất, số lượng dương, giá dương và định dạng decimal. Trong một transaction, command thay dòng nháp và giá nháp tương ứng, tăng version, ghi audit event không chứa số tiền chi tiết và trả envelope idempotent hiện hành.

`post_purchase_receipt` chỉ dùng giá nháp private đã lưu, không tin đơn giá do request ghi sổ gửi lên. Khi post thành công, transaction sao chép giá đã kiểm tra vào `purchase_receipt_line_costs` (bản ghi giá vốn cuối cùng), tính tồn/giá vốn như hiện hành và chuyển phiếu sang `POSTED`. Thiếu bất kỳ giá nào thì command trả `COST_LINES_REQUIRED`; không có side effect một phần.

Các migration mới là additive và thay thế RPC implementation/wrapper theo workflow đã phê duyệt; không sửa migration lịch sử. Tất cả function tiếp tục có `security definer`, `search_path=''`, revoke `PUBLIC` và chỉ cấp execute cho `authenticated`.

## 4. Nạp dòng phiếu từ Excel

### 4.1 Template và giới hạn

Thêm template công khai để tải về tại:

```text
public/templates/import/purchase-receipt-v1.xlsx
```

Nó dùng quy ước template hiện có: đúng ba sheet theo thứ tự `Hướng dẫn`, `Dữ liệu`, `__tuenhi_meta` (very hidden). `Dữ liệu` chỉ có ba cột theo đúng thứ tự:

| Cột | Kiểu | Bắt buộc | Quy tắc |
| --- | --- | --- | --- |
| SKU | text | Có | Tối đa 64 ký tự, giữ dạng text |
| Số lượng nhận | quantity | Có | Decimal dương, tối đa 3 số lẻ |
| Đơn giá nhập | money | Có | Decimal dương, tối đa 2 số lẻ |

Mẫu có instruction, freeze header, auto-filter, format text cho SKU và data validation phù hợp. Mẫu được tạo bằng generator hiện có và có `template_type` `PURCHASE_RECEIPT`, version `1`.

Giữ nguyên rào chắn workbook đã có: `.xlsx` có zip signature, tối đa 5 MiB, 5.000 dòng, 50 cột; đúng sheet/metadata; không merge ở dữ liệu; không macro, encryption, external link hoặc formula. File được đọc ở browser, không upload hoặc lưu trữ ở Supabase.

### 4.2 Luồng sử dụng

Trong khối **Sản phẩm nhận** của phiếu `DRAFT` có nút **Tải file mẫu** và **Nhập từ Excel**. Chọn file mở dialog xem trước gồm số dòng và bảng:

```text
Dòng Excel | SKU | Sản phẩm nhận diện | Số lượng | Đơn giá nhập | Trạng thái
```

App chỉ resolve SKU chính xác với hàng hóa đang hoạt động qua read RPC batch giới hạn, không dựa vào danh sách sản phẩm đang hiển thị trên browser. Mỗi lỗi ghi đúng số dòng và lý do: cột/template sai, SKU trống/không tồn tại/ngừng hoạt động, số lượng hoặc giá không dương/không đúng precision, SKU trùng trong file hoặc trùng với dòng đang có trên phiếu.

Nút **Nạp vào phiếu** chỉ bật khi không có lỗi. Khi bấm, toàn bộ dòng hợp lệ được thêm vào editor hiện tại, chưa gọi Lưu nháp và chưa ghi sổ. Người dùng vẫn có thể sửa, thêm hoặc xóa từng dòng trước khi lưu. Nếu file có một lỗi, không có dòng nào được nạp; người dùng sửa file rồi chọn lại.

### 4.3 Hợp đồng client/server

`ImportTarget`/template contracts và workbook inspector được mở rộng thêm target `PURCHASE_RECEIPT`, không đi qua queue/import job dành cho master data. Một read RPC `resolve_purchase_receipt_products(p_skus text[])` trả từng SKU requested với `productId`, SKU, tên, đơn vị và trạng thái active. RPC giới hạn mảng tối đa 5.000 SKU, chuẩn hóa trim NFC nhưng match SKU chính xác, kiểm tra quyền `purchase.draft.manage` và không trả giá vốn.

UI không gửi product ID hay đơn giá Excel lên RPC resolve. Chỉ sau khi người dùng nhấn Lưu nháp, command save mới nhận `productId`, quantity và cost như mục 3.3.

## 5. Thumbnail ảnh đại diện

`ProductCatalogList` thay placeholder `Ảnh` bằng component thumbnail dùng `primaryImagePath` đã có trên catalog item.

- Có đường dẫn ảnh: component gọi `createSignedUrl` của `ProductImageApi`, hiển thị ảnh 48 × 48 px, `object-cover`, bo góc và alt là tên sản phẩm.
- Chưa có ảnh hoặc signed URL lỗi: hiển thị fallback trung tính **Chưa có ảnh**; lỗi URL không làm hỏng hàng danh sách hoặc bắn toast hàng loạt.
- Signed URL cache theo object path dưới mười phút, invalidated khi ảnh sản phẩm được thêm, xóa hoặc đổi primary. Danh sách vì thế nhận đúng thumbnail mới khi refetch operational data.

Không cần migration cho phần ảnh: `get_product_catalog` đã trả `primaryImagePath`, bucket đã private và `ProductImageApi` đã tạo signed URL 10 phút. Component tách riêng để có unit test và để không nhân bản logic ký URL.

## 6. Thay đổi dự kiến

| Lớp | Thay đổi |
| --- | --- |
| Database | Migration cho private draft costs, validation giá dương, save/post flow, cost-detail scope, grant role và batch SKU resolver. |
| Purchase API/model | Bổ sung `unitCost` trong `PurchaseDraftLine`/save input; post không nhận cost từ UI; thêm resolver SKU. |
| Purchase UI | Product combobox, cột giá nhập bắt buộc, dialog preview Excel, bỏ submit/awaiting-cost flow cho phiếu mới. |
| Imports/template | Contract `PURCHASE_RECEIPT`, parser/reusable validation, generator và `purchase-receipt-v1.xlsx`. |
| Catalog UI | Reusable private-image thumbnail và dùng ở `ProductCatalogList`. |
| Documentation | Cập nhật hướng dẫn phiếu nhập và template download nếu có tài liệu route liên quan. |

## 7. Kiểm thử và tiêu chí nghiệm thu

### 7.1 Unit/component

- Product combobox tìm được theo tên/SKU/mã vạch, không cho chọn trùng/inactive và hỗ trợ keyboard selection.
- Giá nháp trống, 0, âm, quá precision hoặc sai format khóa Lưu nháp và hiện lỗi.
- Excel inspector từ chối mọi workbook nguy hiểm/sai metadata, và preview cho đúng row number/issue.
- Excel có một lỗi không thể nạp bất kỳ dòng nào; file hợp lệ nạp toàn bộ dòng và không tự gọi save.
- Thumbnail hiển thị signed image, fallback khi null/fail và không tạo URL công khai.

### 7.2 API/database

- Creator hợp lệ lưu và đọc lại giá nháp của chính mình; user có draft permission nhưng không phải creator không đọc được giá của phiếu khác.
- Cost reader xem được giá theo scope; post permission không đủ cost read/enter bị từ chối đúng mã.
- Save từ chối duplicate product, product inactive, price/qty invalid và version conflict; idempotent retry trả cùng response.
- Post lấy giá đã lưu, từ chối thiếu giá, giữ nguyên financial math/audit/stock movement, và không nhận giá bị sửa trong request post.
- Batch SKU resolver chỉ trả SKU requested và active, không trả cost.

### 7.3 Regression và QA thủ công

- Chạy lint, typecheck và các test purchase/catalog/import ảnh hưởng.
- Render/test luồng tạo nháp thủ công, tìm sản phẩm, nhập Excel hợp lệ/lỗi, lưu lại/mở lại nháp, owner ghi sổ và ảnh primary đổi trên danh sách.
- Kiểm tra responsive mobile, offline disables, correlation/error UI, version conflict và phiếu `AWAITING_COST` lịch sử.

Không chạy migration, seed, mutation hoặc synthetic E2E trên Cloud trong giai đoạn thiết kế/kiểm thử local.
