# Phase 1F-B6 — Real-data readiness report

**Trạng thái:** B6-A đang triển khai. Chưa tạo manifest, chưa xóa mock, chưa
nhập dữ liệu thật và chưa tạo backup.

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

| Mốc              | Manifest SHA-256 | Owner approval | Receipt | Kết quả   |
| ---------------- | ---------------- | -------------- | ------- | --------- |
| Mock disposition | Chưa tạo         | Chưa có        | Chưa có | Chưa chạy |
| Baseline 1       | Chưa có          | Chưa có        | Chưa có | Chưa chạy |
| Baseline 2       | Chưa có          | Chưa có        | Chưa có | Chưa chạy |

Mọi dữ liệu thực tế, manifest, archive, receipt, ảnh và passphrase lưu ngoài
repository. B6 không chuyển `PRODUCTION`, không tạo nhân viên và không deploy
Production.
