# Runbook Phase 1F-B6 — Dữ liệu thật và hai baseline

## Mục đích và giới hạn

B6 thay thế dữ liệu mock trong Cloud bằng dữ liệu thật sau một phê duyệt có
kiểm soát của Owner. Project phải giữ `OWNER_PILOT`; B6 không tạo nhân viên,
không chuyển lifecycle, không merge `main` và không deploy Production.

Không chạy `cutover:preflight`, `cutover:cleanup-tests`, Cloud runner,
Cloud E2E, restore hoặc lệnh lifecycle. Công cụ B6 không được dùng để dọn bất
kỳ dữ liệu nào ngoài manifest đã duyệt.

## Duyệt manifest trước khi xóa mock

`cutover:mock-manifest` chỉ đọc Cloud và tạo manifest ngoài repository. Manifest
liệt kê ID/chứng từ/object Storage mock và có **manifest SHA-256**. Không sao lưu
dữ liệu mock theo quyết định hiện tại của Owner.

Owner xem file, chọn giữ hay thay cấu hình cửa hàng và kênh bán, rồi xác nhận
đúng một câu sau, thay `<sha256>` bằng giá trị được in bởi script:

```text
Tôi duyệt manifest <sha256>; cấu hình cửa hàng: <retain|replace>; kênh bán: <retain|replace>.
```

Một thay đổi Cloud sau khi tạo file làm manifest cũ hết hiệu lực. Khi đó phải
tạo lại manifest và Owner duyệt SHA-256 mới. Không xem lời đồng ý xóa mock ở
phiên trước là thay thế cho phê duyệt manifest mới.

Sau phê duyệt, script chỉ xóa record trong manifest, xóa đúng object private đã
trả về, rồi ghi receipt audit. Owner Auth/profile, migration, lifecycle/policy
và audit history luôn được giữ lại. Nếu xóa Storage không hoàn tất, script dừng
và giữ receipt chờ hoàn tất; không chạy lại phần xóa database.

## Nhập dữ liệu thật và Baseline 1

Sau khi `cutover:verify-real-data -- --expect-empty-operational-data` xác nhận
không còn nghiệp vụ mock, Owner nhập trực tiếp trên Preview theo thứ tự:

1. Cấu hình cửa hàng và kênh bán, nếu Owner chọn replace.
2. Nhóm hàng.
3. Nhà cung cấp.
4. Sản phẩm, SKU/barcode, giá bán và ngưỡng tồn.
5. Khách hàng.
6. Ảnh sản phẩm.

Số lượng hàng hóa là số nguyên canonical; tiền tệ là decimal canonical. Không
dùng SQL trực tiếp, không nhập partial tài chính, không đưa workbook hay ảnh
thật vào repository.

Đối soát SKU, barcode, nhóm, nhà cung cấp, khách hàng và ảnh. Sau đó tạo
**Baseline 1** tại `/Users/admin/TueNhi-Backups`: database archive và export
ảnh private đều phải mã hóa AES-256 bằng passphrase nhập tương tác, có receipt
SHA-256, được xác minh bằng `cutover:verify-backup` trên máy và bản copy ổ ngoài.

## Mở sổ, Baseline 2 và gate trước bán thật

Owner tạo, kiểm tra và ghi sổ tồn/giá vốn bằng ứng dụng. Trước bán thật, dùng
`cutover:verify-real-data -- --stage=opening` để xác nhận:

- số SKU/barcode và tồn từng sản phẩm khớp nguồn Owner;
- valuation bằng tổng chứng từ mở sổ server trả về;
- opening movements khớp số dòng ghi sổ;
- financial events, revenue report, profit report đều bằng `0`;
- `legacy_sales` không có đóng góp báo cáo.

Sau đối soát, tạo **Baseline 2** trong `/Users/admin/TueNhi-Backups`, mã hóa,
copy ổ ngoài và xác minh giống Baseline 1. Owner ký báo cáo B6 trước giao dịch
bán thật đầu tiên.

## Lệnh được dùng trong B6

```bash
# B6-A: chỉ đọc, chưa xóa
CUTOVER_MANIFEST_DIR=/Users/admin/TueNhi-Backups \
pnpm cutover:mock-manifest -- --keep-store-settings --keep-sales-channels

# B6-B: chỉ sau xác nhận Owner với SHA-256 chính xác
CUTOVER_MANIFEST_DIR=/Users/admin/TueNhi-Backups \
CUTOVER_MOCK_DISPOSITION=OWNER_APPROVED \
pnpm cutover:dispose-mock -- --manifest /Users/admin/TueNhi-Backups/<manifest>.json --confirm

# Đối soát dữ liệu thật, chỉ đọc
pnpm cutover:verify-real-data -- --stage=catalog
pnpm cutover:verify-real-data -- --stage=opening
```

Không đưa passphrase, service key, database password hay đường dẫn archive thật
vào chat, CLI argument, Vercel hoặc Git.
