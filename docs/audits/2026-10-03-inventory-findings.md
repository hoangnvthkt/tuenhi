# Kết quả kiểm tra danh mục, đối tác, nhập hàng, mở sổ, kiểm kho và nhập Excel

Ngày kiểm tra: 03/10/2026. Kho mã: `/Users/admin/tuenhi`, nhánh `main`. Chỉ kiểm tra; không sửa tệp được Git theo dõi, không thao tác trình duyệt hoặc thay đổi dữ liệu cloud.

## Lỗi đã xác nhận

### INV-01 — P1: Gửi phiếu mở sổ/kiểm kho bỏ qua số lượng đang sửa trên màn hình

**Độ tin cậy: cao. Đã tái hiện bằng kiểm thử thành phần cục bộ.**

Mở phiếu nháp đã lưu với số lượng `5`, sửa thành `9`, rồi bấm **Hoàn tất kiểm đếm** hoặc **Gửi phiếu để ghi sổ** mà không bấm lưu riêng. Cả hai luồng gọi lệnh submit trực tiếp, không lưu biểu mẫu và không kiểm tra thay đổi chưa lưu. Máy chủ chuyển trạng thái với số lượng `5` đã lưu trước đó. Riêng mở sổ còn chỉ tải lại `document`, nên ô số lượng bị khóa vẫn có thể hiển thị `9`, trong khi ghi sổ thực tế dùng `5`.

Vị trí:

- `src/features/inventory/opening/components/OpeningActions.tsx:45`
- `src/features/inventory/stock-count/pages/StockCountDetailPage.tsx:150`
- `src/features/inventory/opening/pages/OpeningDetailPage.tsx:138`

Sửa tối thiểu: lưu ảnh chụp biểu mẫu đã lưu, khóa gửi phiếu khi có thay đổi chưa lưu như màn hình nhập hàng đang làm; đồng bộ lại các dòng hiển thị sau khi chuyển trạng thái.

### INV-02 — P1: Cập nhật tồn và đếm lại vẫn giữ số đếm cũ, cho phép lưu lại trên tồn mới

**Độ tin cậy: cao. Đã tái hiện bằng kiểm thử thành phần cục bộ.**

Với phiếu COUNTED có số đếm `5`, bấm **Cập nhật tồn & đếm lại**. Máy chủ trả về DRAFT và `countedQty: null`, nhưng `reload()` chỉ thay `document`; mảng `lines` vẫn giữ `5`. Ô nhập tiếp tục hiển thị `5`; bấm Lưu phiếu gửi lại `5`, làm mất ý nghĩa yêu cầu đếm lại sau khi tồn thay đổi.

Vị trí:

- `src/features/inventory/stock-count/pages/StockCountDetailPage.tsx:81`
- SQL chủ động xóa số đếm: `supabase/migrations/20260823082506_phase_1e_returns_cancel_stock_count.sql:1154`

Sửa tối thiểu: đồng bộ `document`, `lines`, `note` và giá vốn ước tính trong cùng một hàm nạp dữ liệu, đặc biệt sau lệnh refresh.

### INV-03 — P2: Không chọn được sản phẩm ngoài 100 dòng đầu khi mở sổ hoặc kiểm kho

**Độ tin cậy: cao. Đã kiểm thử hành vi bỏ cursor và đối chiếu phân trang SQL/API.**

Hai màn hình chỉ tải một trang `limit: 100`, bỏ `nextCursor`, rồi cung cấp danh sách chọn gốc của trình duyệt. Khi danh mục có trên 100 sản phẩm, người dùng không thêm được sản phẩm nằm ngoài trang đầu vào phiếu. Phiếu mở sổ tạo từ Excel chứa sản phẩm ngoài trang đầu cũng có thể hiển thị lựa chọn sản phẩm trống.

Vị trí:

- `src/features/inventory/opening/pages/OpeningDetailPage.tsx:58`
- `src/features/inventory/stock-count/pages/StockCountDetailPage.tsx:49`

Sửa tối thiểu: dùng bộ chọn có tìm kiếm máy chủ, phân trang và nạp thông tin riêng cho sản phẩm đã chọn.

### INV-04 — P2: Phiếu nhập mất tên/SKU hiển thị khi sản phẩm ngoài trang danh mục đầu

**Độ tin cậy: cao. Đã tái hiện bằng kiểm thử thành phần cục bộ.**

Thông tin phiếu có tên/SKU, nhưng bước hydrate chỉ giữ ID, số lượng và giá trong dòng biểu mẫu. Combobox chỉ hiển thị tên nếu tìm thấy ID trong `products`, vốn ban đầu chỉ chứa 100 sản phẩm đang hoạt động. Vì vậy phiếu đã ghi sổ với sản phẩm ngoài trang đầu hoặc đã ngừng hoạt động hiển thị ô nhập sản phẩm trống, bị khóa, không có tên/SKU nhìn thấy được. Áp dụng nhập Excel cũng bỏ tên đã phân giải và chỉ thêm ID/số lượng/giá vào dòng, dẫn tới cùng hiện tượng trước khi lưu.

Vị trí:

- `src/features/inventory/purchase/components/PurchaseProductCombobox.tsx:54`
- `src/features/inventory/purchase/components/PurchaseProductCombobox.tsx:141`
- `src/features/inventory/purchase/pages/PurchaseDetailPage.tsx:142`

Sửa tối thiểu: bổ sung thông tin sản phẩm đã lưu/đã phân giải vào các lựa chọn; phiếu chỉ đọc nên hiển thị trực tiếp tên/SKU được lưu trên chứng từ.

### INV-05 — P2: Cập nhật sản phẩm từ nền làm mất thay đổi biểu mẫu chưa lưu

**Độ tin cậy: cao. Đã tái hiện bằng cách render lại thành phần với phiên bản mới.**

`ProductForm` dùng `detail.version` làm React key. Khi dữ liệu realtime hoặc refetch trả về phiên bản mới, React hủy biểu mẫu cũ và tạo biểu mẫu mới, làm mất toàn bộ dữ liệu đang gõ mà không cảnh báo. Kiểm thử nhập tên chưa lưu, cung cấp version 2 và xác nhận tên tự trở về dữ liệu đã lưu.

Vị trí:

- `src/features/catalog/components/ProductEditor.tsx:53`
- Đường cập nhật realtime: `src/features/catalog/hooks/use-catalog-realtime.ts:96`

Sửa tối thiểu: giữ nguyên bản đang chỉnh sửa; báo có cập nhật từ người khác và xử lý xung đột phiên bản rõ ràng.

### INV-06 — P2: Danh sách ngừng hiển thị chứng từ cũ sau 100 phiếu

**Độ tin cậy: cao, xác nhận bằng truy vết mã nguồn.**

API danh sách phiếu nhập, mở sổ và kiểm kho đặt cứng cursor null, giới hạn 100; trang giao diện bỏ cursor trả về, không có nút xem tiếp. Lịch sử nhập Excel cũng chỉ tải 30 dòng đầu. Chứng từ cũ vẫn tồn tại và có thể truy cập bằng URL trực tiếp, nhưng người dùng không tìm hoặc quản lý chúng qua danh sách thông thường.

Vị trí đại diện:

- `src/features/inventory/purchase/api/purchase-api.ts:22`
- `src/features/inventory/purchase/pages/PurchaseListPage.tsx:22`
- Cùng mẫu trong `src/features/inventory/opening/api/opening-api.ts`, `src/features/inventory/stock-count/api/stock-count-api.ts`, `src/features/imports/pages/ImportHistoryPage.tsx`.

Sửa tối thiểu: nhận cursor ở API và thêm nút tải tiếp; danh sách nhập hàng nên có tìm theo số phiếu, trạng thái và ngày.

## Đề xuất trải nghiệm — không tính là lỗi đã xác nhận ở trên

- Cảnh báo thay đổi chưa lưu khi chuyển trang hoặc chuyển người được sửa trong danh sách khách hàng/nhà cung cấp.
- Thống nhất quy trình lưu/gửi/ghi sổ và dùng nhãn tiếng Việt quen thuộc; tránh từ kỹ thuật như “canonical”, “owner”, “workbook” trong thông báo vận hành.
- Hiển thị lỗi tải danh mục thay vì nuốt lỗi; thêm trạng thái lỗi và thử lại ở danh sách kiểm kho.
- Thêm nút quay lại trang trước cho danh sách khách hàng/nhà cung cấp; hiện chỉ có Trang tiếp.
- Hiển thị ngày/số chứng từ rõ hơn trong danh sách nhập hàng và kiểm kho.
- Khi hủy phiếu, xác nhận và nêu số phiếu cùng tác động.
- Nếu cần cho vận hành, thêm xuất danh mục/đối tác thông thường; phần xuất đã kiểm tra hiện tập trung vào workbook các dòng nhập lỗi.

## Bằng chứng kiểm thử

Bản sao kiểm thử tại `probes/inventory/` cạnh báo cáo này:

- `inventory.test.tsx`: 4 kiểm thử tái hiện INV-01 (2 trường hợp), INV-02, INV-03.
- `catalog-ux.test.tsx`: 2 kiểm thử tái hiện INV-04 và INV-05.
- `vitest.config.mjs`: cấu hình chạy riêng, alias tới mã nguồn hiện tại, dùng thư viện trong node_modules của repo.

Lệnh chạy từ `/Users/admin/tuenhi`:

```sh
node node_modules/vitest/vitest.mjs run --config /Users/admin/.local/share/tuenhi/audits/2026-10-03/probes/inventory/vitest.config.mjs
```

Kiểm thử chủ động khẳng định hành vi lỗi hiện có; kết quả PASS là bằng chứng tái hiện, không phải lỗi đã được sửa. Lần chạy ban đầu: 2 suite, 6 kiểm thử PASS. INV-06 là kết luận từ mã nguồn, không có thử nghiệm 101 chứng từ trên cơ sở dữ liệu.

## Phạm vi và giới hạn

Đã đọc danh mục/nhóm hàng, danh sách và biểu mẫu đối tác, API liên quan, phiếu nhập và migration hủy mới nhất, mở sổ/kiểm kho, kiểm tra/xác nhận/lịch sử nhập Excel, xuất tệp lỗi và SQL liên quan. Không thay đổi cloud, không thao tác trình duyệt, không chạy toàn bộ cơ sở dữ liệu. Nhận xét mobile chỉ dựa trên cấu trúc mã và CSS, chưa xác minh giao diện bằng ảnh hoặc trình duyệt. Không tìm thấy thêm lỗi đã xác nhận về hạch toán đảo phiếu nhập hoặc commit nhập Excel trong phạm vi lượt kiểm tra này.
