# Kiểm toán bán hàng, trả hàng, thanh toán, lịch sử khách và báo cáo

Ngày 2026-10-03. Không sửa tracked files; không thao tác trình duyệt production; không ghi Cloud. Đã dùng kỹ năng Supabase và systematic-debugging để truy vết nguồn, tái hiện trước khi đề xuất sửa.

## Bằng chứng và giới hạn

- Đọc source POS, hook lưu/thu tiền, dialog thanh toán, API, trả hàng, danh sách hóa đơn, lịch sử khách, reports và migration theo thứ tự. Kiểm tra cả các migration sửa function bằng `pg_get_functiondef`.
- Lấy **schema-only** hiện tại bằng pg_dump, không sao chép rows Cloud, không in thông tin kết nối. Restore vào PostgreSQL 17.10 mới, chỉ lắng nghe Unix socket `/tmp/tuenhi-sales-audit/socket`, cổng 55449, database `sales_audit`; chạy synthetic fixtures và rollback. Không thay đổi các hàm nghiệp vụ cần kiểm tra. Thêm permission definitions cho owner giả lập và các sequence giả lập trong transaction.
- Restore thiếu một bảng disposition không liên quan vì local thiếu `extensions.gen_random_uuid()`. Sales/return functions, constraints, triggers được restore và chạy thực tế. Đây không phải bài kiểm thử đầy đủ Auth/Storage/RLS, không dùng dữ liệu nghiệp vụ thật.
- `sql-probes.sql` tái hiện 4 ca. `frontend-probes.mjs` chạy chính expression trích từ source với numeric validator thật, tái hiện 2 ca. `checkout-probe.test.tsx` chạy hook React thật với RPC mocks, 1/1 pass nghĩa là **đã tái hiện hành vi sai**, không phải đã sửa.
- Main chạy full check riêng. Không chạy lại toàn bộ isolated feedback suite: cần seed permission/role defaults đầy đủ và các DB đích riêng, ngoài probe chuyên biệt đã làm; tránh diễn giải restore một phần là kiểm chứng toàn hệ thống.

## Lỗi xác nhận

### 1. P1 — Thu tiền theo giá mới mà người bán chưa xác nhận

Vị trí `/Users/admin/tuenhi/src/features/sales/hooks/use-pos-commands.ts:205` và `:228`; lưu đọc lại giá hiện tại tại `/Users/admin/tuenhi/supabase/migrations/20260823075155_fix_phase_1d_sale_draft_json.sql:15`.

Tái hiện: giỏ/dialog đang hiển thị 100.000; giá sản phẩm đổi thành 120.000 trước khi nhấn xác nhận. `pay()` gọi `save()` (giá mới) rồi `complete()` ngay, không so sánh tổng/giá người bán vừa xác nhận. `priceRefreshed` được API parse nhưng hook không xử lý. Có thể thu thực tế theo số cũ mà sổ ghi số mới, đặc biệt chuyển khoản đã có ảnh chứng từ cho số cũ.

Bằng chứng: hook test với giá hiển thị 100000 và response save netTotal120000 gọi `complete` ngay; SQL thật: `before checkout 50.00, save refresh 60.00, captured 60.00`.

Sửa tối thiểu: lưu/refresh giá trước khi mở xác nhận; nếu giá/tổng thay đổi sau xác nhận, dừng và yêu cầu xác nhận số mới. Chốt amount/version đã được người bán xác nhận trong lệnh thanh toán. Độ tin cậy cao, runtime.

### 2. P1 — Không hủy được yêu cầu trả hàng bình thường

Vị trí `/Users/admin/tuenhi/supabase/migrations/20260823082506_phase_1e_returns_cancel_stock_count.sql:510` (update) và constraint `sale_returns_check1` tại dòng93 trong cùng migration: trạng thái REQUESTED/COMPLETED tương đương requested_at khác null.

Tái hiện: tạo yêu cầu REQUESTED -> nhập lý do -> Hủy yêu cầu. Function đổi CANCELLED nhưng giữ requested_at, vi phạm check. Probe RPC thật nhận `new row for relation "sale_returns" violates check constraint "sale_returns_check1"`. Không hủy được yêu cầu nhập nhầm; lượng chờ trả vẫn bị giữ và chặn yêu cầu mới. Đây là lỗi SQL, API client có thể chỉ hiện lỗi kết nối chung.

Sửa tối thiểu: sửa constraint cho phép yêu cầu đã từng gửi giữ requested_at khi CANCELLED (giữ lịch sử tốt hơn xóa timestamp); thêm ca cancel REQUESTED và DRAFT, lặp idempotency. Độ tin cậy cao, runtime.

### 3. P2 — Một dòng đã trả hết khóa việc trả dòng còn lại

Vị trí `/Users/admin/tuenhi/src/features/returns/pages/ReturnCreatePage.tsx:129`, `:138`, `:259`; khởi tạo qty tại `:66`.

Tái hiện: hóa đơn A và B, A đã trả hết, B còn 1. Form khởi tạo A=0 và disable ô A; gửi B=1 bị positive:true validation của A từ chối. Cũng nhập 0 để bỏ chọn dòng khác bị chặn, phải xóa trắng mới được.

Bằng chứng executable source probe: untouched disabled zero-returnable line makes otherwise valid return invalid. Sửa tối thiểu: 0/blank nghĩa không chọn; chỉ validate positive cho selected lines; không lấy hết dòng làm mặc định. Độ tin cậy cao, runtime expression.

### 4. P2 — Nhận ít hơn yêu cầu làm mất quyền trả phần chưa nhận

Vị trí `/Users/admin/tuenhi/supabase/migrations/20260824092350_clarify_return_request_validation.sql:60`.

Tái hiện: bán 5, yêu cầu trả 5, chỉ kiểm nhận 2; sau đó trả 3 còn lại. Latest SQL cộng requested_qty=5 của phiếu COMPLETED, nên trả `RETURN_QTY_EXCEEDED`, dù invoice lookup hiển thị còn3 theo accepted_qty=2.

Bằng chứng RPC thật như trên, có log. Sửa tối thiểu: lượng giữ = requested_qty của REQUESTED + accepted_qty của COMPLETED. Đồng bộ returnableQty với lượng đang giữ và giải thích dòng nào đang chờ xử lý. Độ tin cậy cao, runtime.

### 5. P2 — Trả hết nhưng hóa đơn luôn ghi “Trả một phần”

Vị trí `/Users/admin/tuenhi/supabase/migrations/20260823082506_phase_1e_returns_cancel_stock_count.sql:699` đến `:711`.

Function tính trạng thái sale bằng các return.status COMPLETED trước khi chuyển phiếu hiện tại sang COMPLETED. Lần hoàn tất cuối cùng không được cộng. Tái hiện bán5 -> trả5: refund50 đúng nhưng sale status PARTIALLY_RETURNED. Gây sai danh sách/lọc trạng thái và vẫn gợi ý tạo trả hàng.

Sửa tối thiểu: tính sau update status trong cùng transaction, hoặc cộng accepted_qty của phiếu hiện tại rõ ràng. Độ tin cậy cao, runtime trên schema hiện tại.

### 6. P2 — “Tải thêm sự kiện” nhân đôi dòng báo cáo sau trang cuối

Vị trí `/Users/admin/tuenhi/src/features/reports/pages/ReportPage.tsx:116`.

`profitPages.at(-1)?.nextCursor ?? profit.data?.nextCursor` dùng cursor trang1 khi cursor trang cuối là null. Ví dụ 51 events, load thêm1; nút vẫn còn, bấm tiếp thêm lại event cuối. Không có bằng chứng tổng KPI bị nhân đôi vì KPI từ RPC riêng; lỗi nằm danh sách chi tiết và khả năng đối soát.

Bằng chứng expression trích nguyên từ source đã chạy: final null -> first cursor. Sửa tối thiểu: phân biệt chưa có trang tiếp theo với đã có trang có nextCursor=null; tốt hơn dùng useInfiniteQuery như CustomerDetailPage đã có. Độ tin cậy cao.

### 7. P2 — Khách thứ101 trở đi không chọn được trực tiếp tại POS

Vị trí `/Users/admin/tuenhi/src/features/sales/pages/PosPage.tsx:220`, `:403`; selector `/Users/admin/tuenhi/src/features/sales/components/CartPanel.tsx:127`.

Chỉ load limit100 một lần, không search/cursor. Dropdown chỉ hiện danh sách này; khách ngoài100 chỉ được thêm nếu đi qua liên kết customerId từ trang khách. Mở draft có customer ngoài100 mà không có liên kết sẽ giữ id trong state nhưng option không có, dễ hiển thị sai là Khách lẻ. API danh bạ hỗ trợ cursor; POS không sử dụng phân trang. Quan sát UI production của audit chính xác nhận 101 lựa chọn gồm Khách lẻ và 100 khách.

Sửa tối thiểu: selector tìm tên/điện thoại phía server, resolve riêng selected customerId, cho tạo nhanh nếu có quyền. Source-traced, chưa tạo101 rows/browser. Độ tin cậy cao cho giới hạn danh sách.

### 8. P2 — Danh sách hóa đơn/trả hàng bị cắt ở50, không có phân trang

Vị trí `/Users/admin/tuenhi/src/features/sales/api/sales-api.ts:127`; `/Users/admin/tuenhi/src/features/returns/api/returns-api.ts:86` (list); SQL `/Users/admin/tuenhi/supabase/migrations/20260823073932_phase_1d_sales_pos.sql:304` hardcodes nextCursor=null; list UI không nút tải thêm.

Có51 hóa đơn cùng bộ lọc thì chỉ xem được50 đầu; tìm chính xác mã có thể tìm được bản cũ, nhưng duyệt lịch sử để tìm sai lệch/nháp bị bỏ quên không đầy đủ. Không nói dữ liệu bị mất. Sửa tối thiểu: cursor thực và tải thêm, số kết quả đang hiển thị. Source-traced, chưa seed51/browser. Độ tin cậy cao.

## Cải tiến thao tác, tách biệt với lỗi

1. POS: chọn hàng -> số lượng -> khách/kênh khi cần -> một nút Thanh toán -> xác nhận tổng đã đồng bộ. Hiển thị số khách đưa và tiền thối với CASH; giữ bắt buộc chứng từ BANK_TRANSFER theo chính sách hiện tại. Không phát sinh partial payment/credit nếu chủ cửa hàng chưa cần.
2. Trả hàng: từ hóa đơn chọn đúng dòng (mặc định chưa chọn), số lượng, lý do -> kiểm nhận -> **hiện rõ số tiền hoàn dự kiến theo chiết khấu hóa đơn gốc trước khi chuyển tiền** -> phương thức/chứng từ -> xác nhận. Hiện riêng đã trả/đang chờ/còn được trả; lỗi tại dòng thay vì một thông báo tổng quát.
3. Báo cáo: người bán cần đối soát hôm nay (bán - giảm giá - trả - hủy = thuần), breakdown tiền mặt/chuyển khoản, drilldown hóa đơn. UI hiện “Giảm dòng” nhưng không hiện orderDiscounts ở KPI dù DTO/workbook có; thêm “Tổng giảm giá” hoặc dòng “Giảm toàn đơn” để tự cộng đối soát được. OWN/ALL áp dụng revenue nhưng owner/profit vẫn ALL: cần nhãn phạm vi rõ, tránh người dùng nghĩ cùng bộ lọc.
4. Hủy hóa đơn/trả hàng: xác nhận nêu mã phiếu, số tiền, tồn kho bị đảo; sau thành công một receipt trạng thái rõ. Chưa thể kết luận tiền đã thực sự trả chỉ dựa trên đảo ledger; nên diễn đạt nghiệp vụ và hỏi trạng thái tiền mặt/chuyển khoản rõ ràng.
5. Lịch sử khách: ưu tiên tổng chi tiêu thuần + đơn gần nhất + nút mua tiếp/chọn khách. Giữ chi tiết nâng cao sau tab/mở rộng, không tăng số dashboard.

## Tính năng đã có, nên tận dụng

- Local cart persistence, phát hiện giỏ cũ, lease đa-tab; không nên viết lại autosave/resume từ đầu.
- Save draft, provisional print, invoice PDF, snapshot thông tin hóa đơn đã có.
- Product/customer context links tới POS; customer history có orders/returns/products và useInfiniteQuery.
- Permission-aware controls; owner profit/cost separation.
- Financial command idempotency + unknown-outcome reconciliation + recovery banner đã có; không giải quyết bằng retry mới vô điều kiện.
- Backend return refund dựa net_amount sau phân bổ discount, phần trả cuối khép chênh lệch rounding; original cost snapshot và ledger COGS có correction migration. Không phát hiện lỗi tổng tiền hoàn trong ca probe.
- Revenue ledger dùng thời điểm sự kiện và Asia/Ho_Chi_Minh, return/cancel là delta riêng. Có XLSX export phân trang profit; không nhân lỗi pagination UI sang kết luận export sai.
