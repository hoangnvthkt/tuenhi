# Audit nghiệp vụ Tuệ Nhi — kho, bán hàng, thanh toán, công nợ

Ngày: 07/11/2026 · Mã nguồn: `main` `f1217a8` · Cloud: 63/63 migration · Không sửa mã, không ghi dữ liệu Cloud trong đợt này.

## 1. Kết luận

- **Luồng xuôi, ngược và rẽ nhánh của kho, bán, trả, hủy, công nợ đều chạy đúng** trong mọi kịch bản giả lập: 14/14 bộ SQL, 3/3 bộ chạy đồng thời, 12/12 test trình duyệt POS/dashboard, 742/742 unit test.
- **Số liệu thật trên Cloud khớp tuyệt đối** ở 18/20 phép đối soát (tồn, sổ kho, giá vốn, hóa đơn, công nợ). 2 điểm lệch đều có nguyên nhân rõ (mục 3).
- **5 điểm cần sửa về tiền và log** (nhóm A, L). Nặng nhất: thanh toán kết hợp bị lưu thành một dòng "Chuyển khoản", và chưa có sổ quỹ theo ngày thu để thu ngân đối chiếu két.
- **So với chuẩn app bán thuốc, còn thiếu các nghiệp vụ nền**: lô và hạn sử dụng, đơn vị quy đổi hộp/vỉ/viên, công nợ nhà cung cấp, trả hàng nhập, xuất hủy, sổ quỹ, kết ca.
- Dashboard: 17 thẻ số, **chưa có biểu đồ tròn**; 7 số chưa dẫn tới danh sách đã lọc.

## 2. Bằng chứng kiểm thử

| Lớp                        | Kết quả                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                       | 136 tệp / **742 test** đạt                                                                                                                                                                              |
| SQL giả lập (PG 17 cô lập) | **14/14** đạt: chốt giá khi thanh toán, form kho, vòng đời trả hàng, phân trang, công nợ, nhắc nợ, settlement, tồn thấp, tồn âm + FIFO, ảnh chuyển khoản, giá vốn mặc định, hủy nhập, in tạm, quyền kho |
| Đồng thời                  | **3/3** đạt: bán âm + nhập bù đồng thời, trả + nhập, hủy + nhập (không deadlock, bảo toàn giá vốn); trả hàng đồng thời; thu nợ cùng khóa/khác version, trả + thu, hủy                                   |
| Trình duyệt                | POS + dashboard mobile 360/390: **12/12** đạt; CI smoke 2/2; phục hồi asset 3/3. Test dashboard drilldown chập chờn 2/5 lần do test bắt request cuối, không phải lỗi app                                |
| Cloud chỉ đọc              | 20 phép đối soát trên dữ liệu thật, trong transaction `READ ONLY`                                                                                                                                       |
| Kịch bản mới               | 4 probe tái hiện: thanh toán kết hợp, thu nợ đơn cũ, hủy đơn nợ đã thu một phần, hủy đơn kết hợp                                                                                                        |

Database giả lập dựng từ bản **chỉ cấu trúc** của Cloud (không có dòng dữ liệu nào) cộng danh mục quyền. Log lưu ngoài repo tại `~/.local/share/tuenhi/audits/2026-11-07/`.

Chưa kiểm: Safari/iPhone thật, máy in nhiệt, máy quét, mạng chập chờn trên thiết bị.

## 3. Đối soát số liệu thật trên Cloud

Quy mô hiện tại: 1.102 sản phẩm, 13 biến động kho, 6 hóa đơn đã chốt (3 hoàn tất, 1 trả hết, 2 hủy), 6 phiếu nhập, 2 bút toán công nợ, 110 sự kiện log. Có **1 sản phẩm tồn âm** và **1 phần bán thiếu kho chưa có giá vốn** (lợi nhuận đơn đó còn tạm tính).

| Nhóm     | Phép kiểm                                                                   | Kết quả |
| -------- | --------------------------------------------------------------------------- | ------- |
| Kho      | Tồn = tổng biến động; tồn = "sau biến động" cuối; chuỗi biến động liền mạch | 0 lệch  |
| Kho      | SL bán trên hóa đơn = SL xuất kho                                           | 0 lệch  |
| Hóa đơn  | Tổng tiền = Σ dòng; giảm giá dòng + đơn; thành tiền dòng = SL × giá − giảm  | 0 lệch  |
| Thu tiền | Tiền mặt + CK + nợ ban đầu = tổng đơn; phân bổ hiện tại = tổng đơn          | 0 lệch  |
| Trả hàng | Tiền hoàn ≤ giá trị phiếu trả                                               | 0 lệch  |
| Công nợ  | Dư nợ = Σ bút toán; = số dư bút toán cuối; = Σ nợ hóa đơn mở + nợ nhập tay  | 0 lệch  |
| Giá vốn  | Giá trị tồn = Σ biến động giá trị; tồn ≤ 0 thì giá trị và bình quân = 0     | 0 lệch  |
| Log      | Mọi hóa đơn đã chốt có sự kiện log; mọi biến động kho có biến động giá vốn  | 0 lệch  |
| Thu tiền | Hóa đơn hoàn tất không có bảng phân bổ                                      | **1**   |
| Thu tiền | Dòng thanh toán ≠ phân bổ tiền mặt/CK                                       | **1**   |

- **HD000002** (02/10) bán trước khi có công nợ (06/10), nên không có bảng phân bổ. Thiết kế chủ động không bổ sung ngược; dashboard đã tự lấy từ dòng thanh toán. Không phải lỗi.
- **HD000005**: 25.000 tiền mặt + 30.000 CK, nhưng dòng thanh toán ghi "Chuyển khoản 55.000". Đây là lỗi A1.

## 4. Lỗi cần sửa

### Nhóm A — tiền và số liệu

| Mã  | Mức | Tình huống (đã tái hiện)                                                                                                                                                                                                                                                                                     | Đề xuất                                                                                                                                                                   |
| --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | P1  | Thanh toán kết hợp 40.000 TM + 60.000 CK lưu **một dòng "Chuyển khoản 100.000"**. Hóa đơn trả `paymentMethod = BANK_TRANSFER`; thu nợ sau đó **cộng dồn vào chính dòng này** (ghi đè số tiền). Màn hình và dashboard đang tự bù bằng bảng phân bổ, nên chưa hiện sai, nhưng sổ thanh toán gốc không đáng tin | Mỗi phương thức một dòng thanh toán; thu nợ là phiếu thu riêng, không sửa dòng cũ. Migration additive, bổ sung ngược từ `initial_cash/bank`. Kiểm: Σ dòng TM/CK = phân bổ |
| A2  | P1  | Đơn bán nợ hôm trước, **hôm nay thu 30.000 tiền mặt: không có màn nào hiện khoản 30.000 này theo ngày thu**. Dashboard tính theo ngày bán (đúng thiết kế 16/10), nên thu ngân không đối chiếu được két cuối ngày                                                                                             | Sổ quỹ theo ngày thu: tự sinh phiếu thu/chi từ bán, thu nợ, hoàn tiền, hủy; tổng TM/CK theo ngày và theo người; kết ca                                                    |
| A3  | P2  | Hủy đơn nợ 100.000 đã thu 30.000: hệ thống ghi **đã hoàn 30.000 tiền mặt** (dòng thanh toán thành REVERSED), nhưng màn xác nhận chỉ ghi "Tồn kho và thanh toán sẽ được đảo"                                                                                                                                  | Trước khi xác nhận hiện "Trả lại khách: 30.000 tiền mặt"; sau khi hủy sinh phiếu chi trong sổ quỹ                                                                         |
| A4  | P2  | Giảm giá đơn chia cho các dòng làm tròn tới 2 số lẻ (1.000 chia 3 dòng = 333,33 + 333,33 + 333,34). Tiền trên POS/danh sách hiển thị bằng `Number()` và **bỏ phần lẻ**, nên tổng các dòng hiển thị có thể lệch tổng đơn 1 đ. App có 2 kiểu định dạng tiền khác nhau                                          | Chia giảm giá theo đồng nguyên (dòng cuối nhận phần dư). Một helper tiền duy nhất, không qua `Number()`                                                                   |
| A5  | P2  | Ô nhập tiền chỉ nhận dạng `55000` hoặc `55000.5`. Gõ `50.000` theo thói quen bị từ chối; gõ `50.00` được hiểu là **50 đồng**                                                                                                                                                                                 | Theo quy tắc khotienthinh (mục 6)                                                                                                                                         |

### Nhóm L — log giao dịch

| Mã  | Mức | Hiện trạng                                                                                                                                                                                                                                            | Đề xuất                                                            |
| --- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| L1  | P2  | 4 lệnh **không ghi nhật ký**: gửi phiếu mở sổ, hủy phiếu mở sổ, hủy phiếu kiểm kho, cập nhật tồn để đếm lại. Chứng từ có cột người/giờ nhưng không có lịch sử. Các lệnh còn lại (bán, trả, hủy, nhập, đảo, kiểm, thu/chỉnh nợ, giá, quyền) đều có log | Thêm sự kiện log cho 4 lệnh                                        |
| L2  | P2  | Các sổ (biến động kho, thanh toán, công nợ, nhật ký) **không có chốt chặn sửa/xóa ở database**, chỉ dựa vào quyền truy cập. Dòng thanh toán đang bị sửa số tiền khi thu nợ (A1)                                                                       | Trigger chặn UPDATE/DELETE trên sổ; mọi điều chỉnh là bút toán mới |
| L3  | P3  | Chưa có màn xem nhật ký cho chủ cửa hàng                                                                                                                                                                                                              | Màn "Lịch sử thao tác" lọc theo người, ngày, chứng từ (P2.5)       |

## 5. Đánh giá chức năng so với chuẩn app bán thuốc

Tham chiếu: nghiệp vụ phổ biến của KiotViet, Sapo, MISA eShop cho nhà thuốc; quy định hóa đơn điện tử cho hộ kinh doanh.

| Nghiệp vụ                        | Tuệ Nhi                                              | Chuẩn thường có                                                    | Đánh giá                                  |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- |
| Bán hàng, nháp, in tạm, hóa đơn  | Có, chống trùng lệnh, chốt giá                       | Như trên                                                           | Đạt                                       |
| Thanh toán TM/CK/kết hợp/ghi nợ  | Có                                                   | Như trên + nhiều dòng thanh toán                                   | Đạt, sửa A1                               |
| Trả hàng bán                     | Yêu cầu → nhận thực tế → hoàn/cấn trừ, trả nhiều lần | Như trên                                                           | Đạt                                       |
| Hủy hóa đơn                      | Có, đảo kho/tiền/nợ/giá vốn                          | Như trên + phiếu chi hoàn tiền                                     | Đạt, sửa A3                               |
| Nhập hàng                        | Nháp → gửi → nhập giá → ghi sổ; hủy; đảo cả phiếu    | Như trên + **trả hàng nhập một phần**                              | Thiếu trả một phần                        |
| Kiểm kho, mở sổ                  | Có, chênh lệch tự ghi sổ                             | Như trên                                                           | Đạt                                       |
| Xuất hủy (hết hạn, hỏng)         | Chỉ qua kiểm kho                                     | Phiếu xuất hủy có lý do                                            | **Thiếu**                                 |
| Tồn âm, giá vốn bổ sung          | Có, FIFO                                             | Thường chặn bán âm                                                 | Hơn chuẩn                                 |
| Công nợ khách                    | Có, thu, chỉnh, nhắc quá 7 ngày                      | Như trên                                                           | Đạt                                       |
| **Lô và hạn sử dụng**            | Không có                                             | Nhập theo lô/HSD, bán hết hạn gần trước (FEFO), cảnh báo cận hạn   | **Thiếu — quan trọng nhất với nhà thuốc** |
| **Đơn vị quy đổi**               | Mỗi sản phẩm một đơn vị                              | Hộp ↔ vỉ ↔ viên, giá theo từng đơn vị                              | **Thiếu**                                 |
| Công nợ nhà cung cấp             | Không có                                             | Cần trả, đã trả, lịch sử trả NCC                                   | **Thiếu**                                 |
| Sổ quỹ, kết ca                   | Không có                                             | Phiếu thu/chi, tồn quỹ, kết ca thu ngân                            | **Thiếu** (A2)                            |
| Hóa đơn điện tử                  | Không có                                             | Hộ kinh doanh doanh thu trên 1 tỷ/năm phải dùng HĐĐT (NĐ 254/2026) | Cần chủ SP xác định nghĩa vụ              |
| Liên thông Dược quốc gia         | Không có                                             | Có ở một số phần mềm nhà thuốc                                     | Cần chủ SP xác định                       |
| Phân quyền, chống trùng, offline | Quyền chặn ở server, đối soát lệnh mất phản hồi      | Thường chỉ chặn ở giao diện                                        | Hơn chuẩn                                 |

Thông tin quy định là từ nguồn thứ cấp; cần đối chiếu Nghị định 254/2026/NĐ-CP và Thông tư 91/2026/TT-BTC trước khi làm.

## 6. Quy tắc số nguyên/thập phân (theo khotienthinh)

Hiện tại: **hiển thị** đã theo chuẩn Việt Nam (`1.234.567,5`), nhưng **ô nhập** dùng dạng máy (`1234567.5`) và tiền có 2 kiểu định dạng.

Đề xuất áp dụng chung:

| Loại               | Nhập                                                                            | Hiển thị                |
| ------------------ | ------------------------------------------------------------------------------- | ----------------------- |
| Số lượng           | Số nguyên; khi có đơn vị quy đổi thì quy về đơn vị nhỏ nhất là số nguyên        | `1.250`                 |
| Tiền bán, thu, chi | Tự thêm dấu chấm nghìn khi gõ (`50000` → `50.000`); nhận cả `50.000` và `50000` | `50.000 ₫`, không số lẻ |
| Giá vốn, bình quân | Dấu phẩy thập phân, tối đa 2 số lẻ (`12.345,67`)                                | Giữ số lẻ có nghĩa      |
| Phần trăm          | 1 số lẻ                                                                         | `12,5%`                 |

- Giữ chuỗi đang gõ dở (`35.680,`) như `formatViLiveInput` của khotienthinh.
- Bên dưới vẫn chuyển về chuỗi chuẩn và BigInt như hiện nay, không dùng số thực.

## 7. Dashboard: biểu đồ tròn và số bấm được

Hiện trạng: 17 thẻ, đều là link. 10 số đã dẫn đúng danh sách lọc: tiền mặt, CK, nợ còn lại, số đơn, sắp hết, hết hàng, 3 loại phiếu chờ xử lý, giá trị tồn. 7 số chỉ dẫn tới trang chung:

| Số                   | Đang dẫn tới         | Nên dẫn tới                                    |
| -------------------- | -------------------- | ---------------------------------------------- |
| Sản phẩm hoạt động   | `/products` (tất cả) | Danh sách lọc đang bán                         |
| Tổng tồn             | `/products`          | Danh sách có tồn, sắp theo tồn                 |
| Doanh thu gộp, thuần | Trang báo cáo        | Danh sách hóa đơn trong kỳ                     |
| Trả hàng             | Báo cáo `#returns`   | Danh sách phiếu trả hoàn tất trong kỳ          |
| Giá vốn, lợi nhuận   | Báo cáo `#profit`    | Danh sách dòng lợi nhuận theo hóa đơn trong kỳ |

Đề xuất 3 biểu đồ tròn, chỉ tên + số + %, bấm lát nào mở danh sách lát đó:

1. **Thu tiền các đơn trong kỳ**: Tiền mặt / Chuyển khoản / Còn nợ → danh sách settlement theo phương thức.
2. **Tình trạng hàng**: Đủ hàng / Sắp hết / Hết hàng / Âm kho → danh sách sản phẩm đã lọc.
3. **Doanh thu theo nhóm hàng**: 5 nhóm lớn nhất + Khác → hóa đơn có nhóm đó (cần thêm bộ lọc nhóm).

Thẻ tổng giữ ở trên cùng; mobile một cột. Làm mockup với dữ liệu thật trước khi code.

## 8. Thứ tự đề xuất

| Đợt | Nội dung                                                                            | Loại                         |
| --- | ----------------------------------------------------------------------------------- | ---------------------------- |
| 1   | A1 thanh toán theo phương thức, A3 thông báo hoàn tiền khi hủy, A4 làm tròn, L1, L2 | Migration + UI nhỏ           |
| 2   | A5 nhập số chuẩn Việt Nam; dashboard biểu đồ tròn + drilldown đủ 17 số              | UI, mockup trước             |
| 3   | Sổ quỹ + kết ca (A2)                                                                | Phân hệ mới                  |
| 4   | Lô/hạn sử dụng (FEFO, cảnh báo cận hạn) + đơn vị quy đổi                            | Phân hệ lớn, mockup          |
| 5   | Công nợ NCC, trả hàng nhập một phần, xuất hủy                                       | Phân hệ mới                  |
| —   | Hóa đơn điện tử, liên thông Dược                                                    | Chờ chủ SP xác định nghĩa vụ |

Mỗi đợt có test giả lập riêng (SQL cô lập + đồng thời), chạy lại phép đối soát Cloud ở mục 3 sau khi phát hành.
