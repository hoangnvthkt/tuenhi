# P2.0 — Single-project Controlled Development

Ngày hiệu lực: 2026-08-31

## Vai trò môi trường

Project Supabase Free hiện tại có vai trò vận hành
`CONTROLLED_DEVELOPMENT_UAT`: Owner dùng để development/UAT với dữ liệu test tự
nhập, trong khi lifecycle kỹ thuật vẫn là `PRODUCTION` và staff access policy
phải là `OWNER_WAIVER` hoặc `LEAKED_PASSWORD_PROTECTED`.

Không hạ lifecycle về `PRE_PRODUCTION`. Guard automation chỉ cho phép
`PRE_PRODUCTION`; tại project hiện tại mọi runner tạo/dọn dữ liệu phải dừng với
mã an toàn `PRODUCTION_TEST_DATA_FORBIDDEN`.

P2.0 không tạo Staging, không đổi Supabase plan, không thêm migration/RPC/schema
và không sửa dữ liệu Cloud.

## Lệnh vận hành

| Phạm vi         | Được phép                                                                            | Bị cấm trong P2.0                                                                              |
| --------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Local quality   | `pnpm check`, targeted Vitest, `git diff --check`                                    | Bỏ qua test/build guard                                                                        |
| Cloud read-only | `pnpm p2:verify:cloud`, `pnpm cloud:verify:phase1f`, migration list, DB lint/advisor | `pnpm test:cloud:*`, `cloud:verify:all`, Cloud E2E có credential                               |
| Cutover/data    | `pnpm cutover:verify` chỉ khi cần đối chiếu read-only                                | `cutover:preflight`, `cutover:cleanup-tests`, cleanup RPC, lifecycle mutation, bootstrap Owner |
| Database        | SQL assertions chỉ đọc                                                               | `db push`, DML trực tiếp, backfill, rewrite ledger hoặc reset database                         |
| Deployment      | Public production smoke không credential và Owner smoke chỉ đọc                      | Giao dịch synthetic, nhập workbook/ảnh/chứng từ tự động                                        |

Lệnh release chuẩn cho mọi thay đổi không có migration trong giai đoạn này:

```bash
pnpm p2:release:verify
```

Gate phải trả đúng `environmentRole: CONTROLLED_DEVELOPMENT_UAT`, lifecycle
`PRODUCTION`, policy hợp lệ, migration local/remote khớp, application counts và
trạng thái từng kiểm tra. Gate không được in email, payload chứng từ, raw
Supabase error, private ledger hoặc secret.

## Quy trình migration additive cho increment sau

P2.0 không có migration. Khi một increment Phase 2 sau đã có spec và plan riêng,
thực hiện theo thứ tự:

1. Tạo migration bằng Supabase CLI, chỉ thêm contract mới; không xóa/đổi tên
   contract đang được frontend hiện hành dùng.
2. Review precondition, RLS/grants, private function, transaction boundary và
   khả năng frontend cũ tiếp tục chạy.
3. Chạy local tests, `pnpm check`, production-build verifier và
   `git diff --check`.
4. Chỉ sau phê duyệt của increment đó mới dry-run/apply migration Cloud. Quyền
   này không phải là quyền chạy `db push` trong P2.0.
5. Chạy migration list, SQL assertions chỉ đọc, DB lint/advisor và xác nhận
   application counts không đổi ngoài thay đổi đã duyệt.
6. Deploy frontend tương thích ngược, chờ blocking public smoke, rồi Owner UAT.
7. Cleanup contract cũ chỉ ở release riêng sau khi không còn consumer.

Không ghép rename/drop, rewrite ledger hoặc backfill tài chính vào cùng release
với UI mới. Nếu precondition hoặc assertion fail, dừng release; không chỉnh SQL
trực tiếp để bỏ qua gate.

## Checklist release

### Trước deployment

- Branch chỉ chứa phạm vi increment đã duyệt; không có secret hoặc dữ liệu test.
- `pnpm p2:release:verify` đạt và migration local/remote khớp.
- Application counts được ghi từ output scrubbed; không copy row-level data.
- Với migration additive: frontend cũ vẫn tương thích và rollback path đã rõ.
- Không chạy runner/cleanup/bootstrap/lifecycle command bị cấm.

### Deployment và sau deployment

1. Deploy từ `main` và chờ check cố định
   `Vercel - tuenhi: production-smoke` đạt trước khi domain được cập nhật.
2. Chạy public smoke mobile/desktop trên deployment URL:

   ```bash
   PRODUCTION_BASE_URL=<deployment-url> pnpm test:e2e:production
   ```

3. Owner đăng nhập và smoke chỉ đọc các route `/`, `/products`, `/reports`,
   `/more/inventory/valuation`, `/staff`.
4. Xác nhận application counts sau release không đổi nếu increment không được
   phép tạo dữ liệu.
5. Chỉ sau các bước trên mới tiếp tục UAT thủ công của increment.

## Quy tắc dữ liệu test của Owner

- Chỉ Owner nhập test qua UI như người dùng thật; không dùng script tạo dữ liệu.
- Không nhập dữ liệu khách hàng thật, workbook thật, ảnh thật hoặc chứng từ thật.
- Chứng từ tài chính đã hoàn tất không được “clear” trực tiếp, xóa row hoặc sửa
  ledger để làm sạch UAT. Dùng command reverse/cancel/return hợp lệ khi nghiệp vụ
  cho phép, hoặc để nguyên đến khi chuyển project.
- Dữ liệu test, Auth user test, Storage object, audit và command deduplication
  không được copy sang Production sạch.

## Rollback

- Frontend: dùng Vercel Instant Rollback về deployment tốt gần nhất còn tương
  thích với schema additive.
- Database: dùng expand/contract; phát hành bản sửa additive tiếp theo. Không
  dùng down migration phá dữ liệu hoặc reset database.
- Khi gate fail, giữ frontend hiện hành, ghi lại mã lỗi an toàn và điều tra qua
  log được kiểm soát. Không nới guard để release tiếp.

## P2.6 — Clean Production go-live

Khi Owner bắt đầu vận hành thật, tạo project Supabase Free thứ hai hoàn toàn
sạch, áp dụng toàn bộ migration history, cấu hình Auth/Storage/Realtime/secret,
bootstrap đúng một Owner rồi chuyển Vercel qua blocking deployment check.

Không copy dữ liệu test từ project hiện tại và không reset tại chỗ project hiện
tại. Project cũ được giữ nguyên để đối chiếu, sau đó mới chuyển thành môi trường
test hoặc pause khi Owner xác nhận Production mới ổn định.
