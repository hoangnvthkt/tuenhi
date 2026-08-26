# Phase 1F-B6 — Real-data readiness report

**Trạng thái:** B6-A đã có manifest chỉ-đọc. Chưa có phê duyệt manifest, chưa
xóa mock, chưa nhập dữ liệu thật và chưa tạo backup.

**Nhánh:** `codex/phase-1f-b6-real-data-baselines` từ `838ac1c`.

## Baseline read-only — 2026-08-26

| Hạng mục                             | Giá trị                             |
| ------------------------------------ | ----------------------------------- |
| Lifecycle                            | `OWNER_PILOT`                       |
| Staff policy                         | `OWNER_WAIVER` (audit còn hiệu lực) |
| Profiles                             | 1 Owner                             |
| Categories / suppliers / customers   | 1 / 1 / 0                           |
| Products / product images            | 1 / 1                               |
| Inventory balances / stock movements | 1 / 6                               |
| Sales / returns / stock counts       | 3 / 1 / 0                           |
| Import runs / legacy sales           | 0 / 0                               |

Nguồn: `node --env-file=.env scripts/cutover-verify.mjs`. Các giá trị trên là
mock Owner Pilot và chưa được coi là dữ liệu Production.

## Receipt và phê duyệt

| Mốc              | Manifest SHA-256                                                   | Owner approval | Receipt | Kết quả   |
| ---------------- | ------------------------------------------------------------------ | -------------- | ------- | --------- |
| Mock disposition | `a7e3b1e8fc88095d23ce9afe6801898f9c54e28cbe2463ed1c77125a3b1d831d` | Chưa có        | Chưa có | Chưa chạy |
| Baseline 1       | Chưa có                                                            | Chưa có        | Chưa có | Chưa chạy |
| Baseline 2       | Chưa có                                                            | Chưa có        | Chưa có | Chưa chạy |

## Manifest B6-A — 2026-08-26T08:42:06.616Z

Tệp manifest nằm ngoài repository: `tuenhi-owner-pilot-mock-manifest-2026-08-26T084206616Z.json`.
Manifest dùng lựa chọn **giữ cấu hình cửa hàng** và **giữ kênh bán**. Nó liệt kê:

| Nhóm                                         | Số record/object |
| -------------------------------------------- | ---------------: |
| Nhóm hàng / nhà cung cấp / sản phẩm / ảnh    |    1 / 1 / 1 / 1 |
| Phiếu mua / hóa đơn / trả hàng               |        1 / 3 / 1 |
| Biến động tồn / thông báo người dùng         |           6 / 47 |
| Khách hàng / kiểm kho / import / legacy sale |    0 / 0 / 0 / 0 |
| Object Storage cần xóa                       |                1 |

Hash và các số lượng này chỉ là bằng chứng xem xét. Chúng không phải phê duyệt
xóa. Mọi thao tác ghi sau thời điểm tạo manifest sẽ làm hash hết hiệu lực và cần
tạo manifest mới.

Mọi dữ liệu thực tế, manifest, archive, receipt, ảnh và passphrase lưu ngoài
repository. B6 không chuyển `PRODUCTION`, không tạo nhân viên và không deploy
Production.
