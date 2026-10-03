# Thiết kế khắc phục audit và cải thiện vận hành Tuệ Nhi

Trạng thái: **phương án đề xuất để triển khai**, không phải release đã được duyệt/phát hành. Căn cứ audit ngày 03/10/2026 tại commit `065b3d22681de3daef11796a15c06582ab7e6fce`.

## Mục tiêu và phạm vi

Yêu cầu của Owner: app bán hàng nhỏ, nội bộ; người dùng là trung tâm; thao tác tối giản và chính xác. Kết quả cần đạt: tiền/số lượng ghi nhận khớp bản xác nhận; không mất form; chọn được toàn bộ danh mục; có thể tìm lại mọi chứng từ được phép; đổi tài khoản không giữ dữ liệu người trước.

Giả định thiết kế: giữ một cửa hàng/một kho, giữ hệ thống hiện tại, ưu tiên bàn phím trên máy tính và màn hình điện thoại. Không mở rộng sang đa chi nhánh, công nợ, quy đổi đơn vị, SMS/Zalo hoặc quản lý lô/hạn dùng trong đợt này. Các nhu cầu đó cần đặc tả nghiệp vụ riêng nếu Owner muốn bổ sung.

## Phương án được đề xuất

Chọn **phát hành tăng dần theo gói**, dùng lại nền tảng hiện có. Phương án này đưa các bản sửa an toàn ra sớm và giới hạn phạm vi sự cố. Gom tất cả vào một release làm khó xác định nguồn lỗi; viết lại giao diện/kiến trúc làm tăng phạm vi mà chưa giải quyết nhanh các ca sai đã tái hiện.

Ba gói sửa lỗi độc lập theo đầu ra: an toàn nghiệp vụ (A01–A08); thao tác và tra cứu (A09–A13, A16–A17); phục hồi quản trị (A14–A15). Tiện ích mới nằm ở đợt sau, có thiết kế ngắn cho từng luồng trước khi viết code.

## Quyết định hành vi

### Thanh toán — A01

Chụp nội dung người bán vừa xác nhận: sản phẩm, số lượng, đơn giá, giảm từng dòng/toàn đơn, khách, kênh, phương thức và tổng phải thu. `saveDraft` trả giá mới: so sánh số tiền theo giá trị, không theo định dạng chuỗi; so cả từng dòng vì tổng có thể giữ nguyên khi hai giá thay đổi ngược chiều. Nếu khác, cập nhật giỏ, đóng trạng thái đang xác nhận và hiện **“Giá đã thay đổi. Vui lòng kiểm tra và xác nhận lại.”**; chưa upload ảnh và chưa gọi complete.

Giữ RPC complete, expectedVersion và PRICE_CHANGED hiện có để chặn giá đổi thêm sau bước lưu. Không chỉ dựa cờ `priceRefreshed` (cờ có thể true dù tổng không đổi). Nhánh đang đối soát lệnh chưa rõ kết quả dùng đúng request cũ, không lưu lại draft hay phát lệnh mới. Đây là sửa frontend trước; chỉ thay RPC nếu test chứng minh bảo vệ server hiện tại thiếu.

### Phiếu kho — A02–A03

Giữ thao tác “Lưu” và “Gửi/Ghi sổ” tách rõ trong bản sửa đầu tiên. Khi dữ liệu bẩn, khóa bước gửi và giải thích “Lưu thay đổi trước khi gửi”. Sau lưu/chuyển trạng thái/refresh, đồng bộ document, lines, note và estimates từ cùng một response. Refresh để đếm lại phải để số đếm cần nhập thành null, không khôi phục số cũ. Refetch nền không được tự ghi đè form đang nhập.

### Phiên và quyền — A04

Tại logout, đổi Auth user hoặc tài khoản bị khóa: dừng request riêng tư, xóa cache và session cũ trước khi render người mới. Query riêng tư có userId trong key; không chỉ thêm userId mà bỏ quên request đang chạy. Chỉ fallback offline nếu Auth user ID còn trùng hồ sơ đã xác thực. Giữ server là nơi quyết định quyền; không hạ quyền kho chỉ xem để né lỗi cache.

### Trả hàng — A05–A08

0 hoặc ô trống là không chọn dòng; số dương mới là yêu cầu trả. Lượng bị giữ = requested của phiếu REQUESTED + accepted của phiếu COMPLETED; CANCELLED không giữ lượng. Hoàn tất phiếu và tính trạng thái hóa đơn trong cùng transaction, gồm cả lượng đang hoàn tất. Hủy giữ dấu vết requested_at hợp lệ, giải phóng lượng giữ, không tạo biến động tiền/tồn. Giữ nguyên tính tiền hoàn từ snapshot chiết khấu và giá vốn gốc.

Khóa theo hóa đơn gốc/phiếu nhất quán và kiểm tra đồng thời để hai yêu cầu không cùng lấy phần còn lại. Cấu trúc mới không tự sửa lịch sử tiền/tồn. Trước migration đọc thống kê phiếu thật hiện có; nếu trạng thái lịch sử cần sửa, lập danh sách tác động và bước đối soát riêng, không suy từ số liệu audit trước đó.

### Danh mục và tra cứu — A09–A12

Tìm khách/sản phẩm phía server, phân trang; resolve lựa chọn theo ID độc lập trang đầu. Chứng từ cũ hiển thị snapshot tên/SKU ngay cả khi sản phẩm ngừng hoạt động. Các danh sách dùng cursor ổn định theo timestamp + id hoặc name + id, không dùng offset cho luồng thay đổi thường xuyên. Hết dữ liệu phải trả null thật; đổi filter reset toàn bộ trang. Giữ bộ lọc ở URL khi phù hợp.

Bản cũ của sales/returns parser chỉ chấp nhận nextCursor null. Vì PWA cũ có thể còn chạy, bổ sung RPC `list_sales_v2` và `list_sale_returns_v2` với DTO cursor mới, giữ endpoint cũ trong thời gian chuyển tiếp. Các endpoint khác chỉ thay tại chỗ nếu parser cũ chấp nhận contract mới; không mặc định việc thêm trường/đổi null là tương thích.

### Form, modal và lỗi — A13, A16–A17

Giữ form sản phẩm theo id và phiên chỉnh sửa, không remount theo version server. Khi có bản mới: giữ nội dung đang nhập, hiện lựa chọn tải bản mới sau xác nhận bỏ thay đổi hoặc tiếp tục xem để tự đối chiếu; save dùng version gốc và phải nhận VERSION_CONFLICT nếu cũ. Không tự merge giá/tồn.

Modal thông báo có focus vào trong, Tab/Shift+Tab không ra nền, Escape đóng, trả focus; thao tác nền bị vô hiệu. Cấu hình có trạng thái loading/error/data và Thử lại. Không hiện “chưa có dữ liệu” trong khi còn đang tải.

### Nhân viên — A14–A15

Giữ idempotency key của một lần tạo nhân viên qua các lần thử lại, nhận/preserve pendingUserId do server trả; tiếp tục phần tạo hồ sơ đang thiếu, không tạo Auth lần nữa. Không lưu mật khẩu tạm để phục hồi. Server kiểm Owner, email, ID và tình trạng hồ sơ trước khi resume; không nhận một ID tùy ý để ghi đè người đã tồn tại.

Mở lại tài khoản có ba trạng thái UI: đang xử lý, hoàn tất, cần hoàn tất mở đăng nhập. `authReactivationPending` không được báo thành công đầy đủ; thử lại chỉ đối soát phần còn thiếu với cùng operation. Mã lỗi an toàn và đường xử lý hiện rõ. Phục hồi qua tải lại trang cần giữ marker tối thiểu theo Owner (operation/key/target ID), không chứa mật khẩu; khi hết phiên xóa marker riêng tư hoặc yêu cầu đọc lại trạng thái từ server trước khi tiếp tục.

## Điều kiện hoàn tất

Mỗi A01–A17 có test kỳ vọng đúng trong repo, không chỉ probe chứng minh hành vi sai. Test chạy độc lập, có lần thấy thất bại trên mã cũ. Frontend mới tương thích backend đã phát hành, backend mới vẫn phục vụ client cũ theo phạm vi đã công bố. Mỗi gói có review, bằng chứng test, migration/Edge inventory, UAT và phương án dừng phát hành.

Không gọi smoke công khai là E2E giao dịch. Dùng unit/component + native PostgreSQL fixture cho lỗi đã xác định; dùng UI với API giả lập cho lỗi mạng; Auth/Storage/Realtime đầu-cuối cần project test riêng đã xác minh. Không hạ guard PRODUCTION_TEST_DATA_FORBIDDEN và không dùng preview nối production để tạo dữ liệu thử.

## Tiện ích sau sửa lỗi

Ưu tiên: khách nhanh tại POS; nháp có mã/thời gian; thanh tổng tiền cố định trên mobile; khách đưa/tiền thừa; trang Cần nhập và cảnh báo tổng hợp. Có quyền mới được thêm khách. Cash tender chỉ hỗ trợ tính toán trong UI ở phiên bản đầu, không tạo công nợ hoặc thay ledger. Giữ nội dung phiếu khi đóng thêm khách. Cảnh báo tổng hợp vẫn giữ dữ liệu thông báo và episode hiện có, không xóa lịch sử để giảm badge; trạng thái cần nhập đọc tồn hiện tại, không suy từ tin cũ.

Đo với cùng kịch bản trước/sau: thời gian hoàn thành, số thao tác, số lần nhập lại, số lỗi tiền/tồn. Mục tiêu bắt buộc: 0 sai khác giữa bản xác nhận và kết quả; 0 mất form; chọn được bản ghi ngoài trang đầu. Mục tiêu UX đề xuất: giảm ít nhất 30% thao tác của kịch bản bán đơn giản sau khi có baseline; chưa hứa thời gian khi chưa đo thiết bị/mạng thật.
