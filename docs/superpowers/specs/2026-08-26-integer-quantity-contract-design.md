# Quy ước số lượng nguyên cho nghiệp vụ vận hành

Ngày: 2026-08-26

Trạng thái: Chờ Owner duyệt đặc tả triển khai

Liên quan: `docs/superpowers/specs/2026-08-22-cloud-platform-data-entry-design.md`

## 1. Mục tiêu

Loại bỏ hoàn toàn sự nhập nhằng giữa số lượng hàng và cách hiển thị số theo
tiếng Việt. Mọi nghiệp vụ vận hành phải hiểu `1` là một đơn vị và `1000` là một
nghìn đơn vị. Số lượng không có phần thập phân. Chỉ giá tiền, giảm giá, doanh
thu, giá vốn và các giá trị tài chính mới được có phần thập phân.

Ví dụ hiển thị đọc-only dùng định dạng Việt Nam:

| Giá trị canonical | Hiển thị | Ý nghĩa |
| --- | --- | --- |
| `1` | `1` | một đơn vị |
| `1000` | `1.000` | một nghìn đơn vị |
| `150000.50` | `150.000,50 đ` | giá tiền hợp lệ |

Trong ô nhập liệu, người dùng luôn nhập canonical ASCII không có dấu phân tách
hàng nghìn: `1`, `1000`, `150000.50`.

## 2. Phạm vi áp dụng

Quy ước mới áp dụng cho mọi dữ liệu vận hành của hàng hóa:

- Ngưỡng tồn, tồn thực tế và mọi biến động kho.
- Mở sổ, nhập/mua hàng, kiểm kho và các biểu mẫu/import tương ứng.
- Số lượng dòng hóa đơn bán, yêu cầu trả hàng và số lượng được chấp nhận trả.
- Snapshot/DTO liên quan để browser không còn nhận số lượng hoạt động dạng
  `1.000` khi giá trị là một.

Tiền tệ không thay đổi contract: số tiền tiếp tục là canonical decimal tối đa
hai chữ số thập phân. Giá vốn trung bình nội bộ vẫn được server tính với độ
chính xác riêng; không trở thành dữ liệu số lượng do người dùng nhập.

`legacy_sales` là archive chỉ-đọc, không tham gia tồn kho, bán hàng hoặc báo
cáo. Archive không được sửa hoặc làm tròn lịch sử trong thay đổi này.

## 3. Contract thống nhất

### 3.1 Số lượng

- Chuỗi cuối cùng: `^(?:0|[1-9][0-9]*)$`.
- Không có khoảng trắng, dấu `+`/`-`, dấu phân tách hàng nghìn, dấu phẩy, số mũ
  hay phần thập phân.
- Giá trị cần dương (`> 0`): số lượng bán, mở sổ, mua/nhập, yêu cầu trả và số
  lượng trả được chấp nhận.
- Giá trị không âm (`>= 0`): tồn, ngưỡng tồn và số lượng kiểm thực tế.
- Payload trình duyệt gửi chuỗi canonical, không gửi JSON number.

### 3.2 Tiền

- Không đổi regex, scale hay canonical decimal hiện có.
- Tiền chỉ được format khi đọc; không dùng `parseFloat` hoặc `number` cho kết
  quả tài chính authoritative.

## 4. Lớp bảo vệ

Việc giới hạn số lượng nguyên phải được đặt ở tất cả các lớp, với PostgreSQL là
nguồn quyết định cuối:

1. `NumericField`, form và thao tác tăng/giảm chỉ chấp nhận số nguyên; input
   không tự định dạng bằng dấu `.`.
2. Parser import/template từ chối ô có phần thập phân ngay ở preview, đồng thời
   giữ lỗi theo hàng/cột để người nhập sửa.
3. Schema client/RPC chỉ nhận chuỗi số nguyên canonical; so sánh và cộng/trừ
   dùng helper chuỗi an toàn, không dùng JavaScript `number`.
4. Database chuyển các cột số lượng vận hành sang `numeric(18,0)` và các hàm
   private/wrapper kiểm tra grammar tương ứng.
5. Migration kiểm tra trước mọi cột hiện hữu: nếu phát hiện giá trị không phải
   số nguyên thì dừng toàn bộ transaction với lỗi rõ ràng. Không làm tròn,
   truncate hay tự sửa dữ liệu mock.

Sau khi type vật lý là `numeric(18,0)`, PostgreSQL/DTO sẽ biểu diễn một đơn vị
là `1`; giao diện đọc-only chỉ áp dụng `formatViNumber` lên giá trị đó.

## 5. Các cột và luồng dữ liệu

Migration chỉ thay đổi các trường quantity của dữ liệu vận hành, gồm sản phẩm,
tồn/bút toán kho, mở sổ, mua hàng, kiểm kho, dòng bán và dòng trả hàng. Các cột
tiền (đơn giá, giảm giá, tổng tiền, cost) không đổi. Trước khi tạo migration,
triển khai phải lập danh sách cột chính xác từ schema hiện hành và kiểm tra
read-only từng cột có giá trị fractional hay không.

Không có SQL trực tiếp để chỉnh dữ liệu. Dữ liệu mock hợp lệ như `1.000` ở type
cũ chỉ được đổi representation sang `1` bởi migration sau khi chứng minh giá
trị đó là nguyên; giá trị như `1.5` sẽ khiến migration không chạy.

## 6. Trải nghiệm và lỗi

- Ô số lượng dùng `inputMode="numeric"`, nhãn ghi rõ `Số lượng (nguyên)` khi
  ngữ cảnh cần nhấn mạnh.
- Một input chứa `1.000` theo contract cũ được coi là không hợp lệ khi người
  dùng sửa/submit; UI hướng dẫn nhập `1000` nếu ý nghĩa là một nghìn.
- Message trường dùng tiếng Việt: `Số lượng chỉ được là số nguyên.`
- Lỗi server có mã ổn định riêng cho quantity format/positive/non-negative;
  lỗi không được hiện raw SQL/PostgREST.
- Product picker, giỏ hàng, hóa đơn, trả hàng, tồn kho và báo cáo hiển thị số
  lượng qua formatter chung, không render trực tiếp canonical string.

## 7. Tương thích và an toàn dữ liệu

- Không đổi route, quyền, lifecycle `OWNER_PILOT`, policy nhân viên, hình thức
  thanh toán, proof ảnh, contract tiền tệ hoặc báo cáo ledger.
- Không chạy cleanup, backup/restore, synthetic Cloud runner hay tạo dữ liệu
  thử trong lúc Owner Pilot.
- Không migration `legacy_sales`; archive tiếp tục bị loại khỏi dashboard và
  report.
- Migration mới được tạo bằng Supabase CLI, review SQL và chạy `db push
  --dry-run` trước khi đẩy Cloud. Private implementation giữ `security
  definer`, `search_path = ''`; API wrapper giữ `security invoker`.

## 8. Kiểm thử và tiêu chí hoàn thành

- Unit: grammar input, parse integer, helper tăng/giảm/so sánh không mất chính
  xác, formatter `1`/`1000`.
- Component: POS, trả hàng, mở sổ, mua hàng, kiểm kho và catalog từ chối
  decimal; hiển thị không còn `1.000` cho một đơn vị.
- Import: preview báo đúng row/cell cho `1.5`, chấp nhận `1` và `1000`.
- SQL assertions: signature/grant/private boundary, type `numeric(18,0)`,
  validation server và không được làm tròn dữ liệu fractional.
- E2E: tạo/nhập/bán/trả với quantity `1` và `1000`; xác nhận tồn, ledger và
  báo cáo vẫn cân đối.
- Sau mỗi lát: targeted tests, `pnpm check`, `git diff --check`; trước Cloud
  migration: review SQL, read-only integrity query và `db push --dry-run`.

## 9. Không thuộc thay đổi này

- Không thêm đơn vị đo quy đổi như kg/lít/cái hoặc cho phép decimal theo từng
  sản phẩm. Nếu cần trong tương lai, đó là một feature riêng với model đơn vị
  đo, conversion và thay đổi nghiệp vụ rõ ràng.
- Không làm sạch hay thay thế dữ liệu mock hiện có.
- Không merge `main`, deploy Production hay thay đổi lifecycle.
