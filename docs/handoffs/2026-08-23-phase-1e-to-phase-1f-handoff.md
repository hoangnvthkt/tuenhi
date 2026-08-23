# Handoff Tuệ Nhi POS — từ Phase 1E sang Phase 1F

Ngày bàn giao: 2026-08-23

Workspace: `/Users/admin/tuenhi`

Repository: `https://github.com/hoangnvthkt/tuenhi.git`

## 1. Mục tiêu của tài liệu

Tài liệu này là nguồn khởi động cho một phiên Codex mới. Phiên mới cần đọc tài liệu này, kiểm tra trạng thái thực tế trong repository rồi tiếp tục từ Phase 1F theo roadmap. Không làm lại các phase đã hoàn thành và không suy đoán secret từ nội dung tài liệu.

Hai đặc tả gốc vẫn là nguồn yêu cầu chính:

- `docs/superpowers/specs/2026-08-21-internal-single-store-pos-design.md`
- `docs/superpowers/specs/2026-08-22-cloud-platform-data-entry-design.md`

Workbook bán hàng cũ chỉ là nguồn tham khảo nghiệp vụ và không được commit:

- `/Users/admin/Downloads/BAN_HANG_Q237_21082026(copy).xlsx`

## 2. Chỉ dẫn cố định từ chủ dự án

- Chỉ agent chính Codex thực hiện. Không dùng sub-agent cho tới khi chủ dự án yêu cầu.
- Không dùng Superpowers skill cho tới khi chủ dự án yêu cầu.
- Supabase Cloud là môi trường duy nhất; không dùng Supabase local hoặc Docker.
- Project Supabase hiện tại: `ccfhkhtxoruyniwxowrz`.
- URL công khai: `https://ccfhkhtxoruyniwxowrz.supabase.co`.
- `.env` trong workspace đã có thông tin cần thiết. Không in giá trị, không đưa secret vào lệnh/log/tài liệu và không commit `.env`.
- Vercel vẫn để sau; chưa tự tạo, liên kết hoặc deploy dự án.
- Mọi lỗi/toast/thông báo cho người dùng phải rõ ràng bằng tiếng Việt và có mã lỗi ổn định ở tầng command.
- Số lượng, tiền, điện thoại và dữ liệu Excel phải dùng bộ chuẩn hóa hiện có; không cho phép Unicode digit hoặc định dạng mơ hồ lọt vào command.
- Không push, không merge nhánh phase vào `main` trước khi chủ dự án nghiệm thu.
- Nếu chạy frontend/E2E cục bộ, không dùng cổng 3000. Playwright hiện dùng preview ở cổng 4173.
- UI tiếp tục bám design system nội bộ; taste skill đã được cài và có thể dùng cho công việc UI khi phù hợp, nhưng không tự redesign ngoài phạm vi.

## 3. Trạng thái Git hiện tại

Tại thời điểm tạo handoff:

- Nhánh đang làm việc: `codex/phase-1e-returns-cancel-stock-count`.
- Commit triển khai Phase 1E: `8e3b8bf feat: add returns cancellation and stock counts`.
- Local `main`: `e3783e5 feat: add POS sales and invoice workflows`.
- Nhánh Phase 1D `codex/phase-1d-pos-invoices` cũng đang ở `e3783e5`.
- Phase 1E chưa được merge vào local `main` và chưa push.
- Worktree sạch trước khi thêm tài liệu handoff này.

Phiên mới phải bắt đầu bằng các kiểm tra đọc-only:

```bash
cd /Users/admin/tuenhi
git status --short --branch
git branch --show-current
git log --oneline --decorate -8
```

Không reset, checkout đè hoặc xóa worktree nếu chưa xác nhận trạng thái thực tế.

## 4. Những phần đã hoàn thành

### Phase 0–1A — Nền tảng, Auth và quyền

- React/Vite/TypeScript/Tailwind/PWA, app shell responsive và routing.
- Supabase Auth, profile, role template, permission definitions/overrides.
- Đổi mật khẩu lần đầu, quản trị nhân viên bằng Edge Functions.
- Notification, audit, idempotency envelope và correlation ID.

### Phase 1B — Danh mục, Excel và dữ liệu cũ

- Danh mục nhóm hàng, sản phẩm, khách hàng, nhà cung cấp, kênh bán và giá bán.
- Ảnh sản phẩm private, signed URL và Realtime invalidation.
- Import Excel có versioned template, mapping/validation và error workbook.
- Adapter workbook cũ `LEGACY_Q237_V1`; dữ liệu cũ chỉ để tra cứu, không ảnh hưởng sổ vận hành.

### Phase 1C — Nhập hàng, giá vốn và mở sổ

- Phiếu nhập hai bước, owner nhập cost/post/reverse.
- Quantity balance, inventory value và moving weighted-average cost.
- Opening stock nhiều đợt, import `opening-balances-v1.xlsx` và gợi ý từ dữ liệu cũ.
- Cost DTO/private ledger chỉ owner được đọc.

### Phase 1D — POS, thanh toán và hóa đơn

- POS, tìm/quét hàng, giỏ theo user, draft server/local và thanh toán đủ bằng tiền mặt hoặc chuyển khoản.
- Hai tầng chiết khấu, cạnh tranh tồn cuối và idempotent completion.
- Payment, stock/cost/revenue ledgers và snapshot hóa đơn bất biến.
- Danh sách/chi tiết hóa đơn, K80 và PDF/chia sẻ.
- Store settings và logo hóa đơn.

### Phase 1E — Trả hàng, hủy hóa đơn và kiểm kho định kỳ

- Trả hàng theo hóa đơn gốc, partial/full, kiểm nhận và hoàn tiền.
- Owner hủy hóa đơn đủ điều kiện và đảo tồn, giá trị tồn, payment, revenue/COGS.
- Kiểm kho từng phần: nhân viên lập/đếm/submit, owner post/cancel/refresh snapshot.
- Stale inventory version chặn ghi sổ; tăng từ tồn 0 yêu cầu estimated cost owner-only.
- Invoice DTO v2 hiển thị vòng đời, lịch sử trả/hủy và số lượng còn được trả, không chứa cost/profit.
- Audit, notification, idempotency và Cloud cleanup cho dữ liệu test tổng hợp.

Các migration Phase 1E đã áp dụng lên Supabase Cloud:

- `supabase/migrations/20260823082506_phase_1e_returns_cancel_stock_count.sql`
- `supabase/migrations/20260823083729_phase_1e_security_test_cleanup.sql`

Các route mới của Phase 1E:

- `/returns`, `/returns/new`, `/returns/:returnId`
- `/sales/:saleId/return`
- `/stock-counts`, `/stock-counts/new`, `/stock-counts/:countId`

Hai lỗi tích hợp được phát hiện và sửa trong vòng nghiệm thu Phase 1E:

- `AuthProvider` giữ một API client ổn định, tránh vòng lặp tải session khi mở trực tiếp URL.
- Invoice parser đã đồng bộ với DTO snapshot công khai, không còn đòi `productId` không thuộc invoice DTO.

## 5. Trạng thái Supabase Cloud

- Migration history local/remote đã khớp tới `20260823083729`.
- Schema ứng dụng được expose là `api`; `app_private` không expose.
- Browser không có direct write tới bảng nghiệp vụ; command đi qua wrapper security-invoker trong `api` và implementation security-definer trong `app_private` với `search_path = ''`.
- Các bảng exposed có RLS/force RLS theo thiết kế; cost, valuation và financial ledger không được cấp trực tiếp cho JWT nhân viên.
- Phase 1E Cloud JWT test đã chứng minh nhân viên không đọc được cost/private ledger.
- Security Advisor còn một cảnh báo cấu hình Auth: leaked-password protection đang tắt. Đây là cấu hình project có sẵn và chưa được tự ý thay đổi.
- Performance Advisor không báo lỗi Phase 1E; `supabase db lint --linked` không có schema error.

Không áp dụng thêm migration hoặc thay đổi Dashboard Supabase chỉ để “đồng bộ lại” nếu chưa có yêu cầu Phase 1F đã được duyệt.

## 6. Kiểm thử gần nhất đã đạt

Các kết quả được xác nhận ngay trước handoff:

```text
pnpm check
  Prettier: pass
  ESLint: pass
  TypeScript: pass
  Vitest: 50 files, 233 tests pass
  Production build: pass

pnpm test:e2e:phase1e
  desktop-chromium: pass
  mobile-chromium: pass
  preview port: 4173

pnpm test:cloud:phase1e
  return flow and cost boundary: pass
  owner sale cancellation/payment reversal: pass
  stock count and private-cost denial: pass

pnpm cloud:verify:phase1e
  SQL assertions: pass

pnpm exec supabase migration list --linked
  local/remote history: match

pnpm exec supabase db lint --linked
  no schema errors
```

Runner Cloud/E2E chỉ tạo dữ liệu tổng hợp có tiền tố `codex-phase1e-*`, dùng JWT thật và tự dọn profile, sale, return, payment, movement, count, notification, audit và idempotency record. Không dùng workbook hoặc dữ liệu thật.

## 7. Điểm bắt đầu Phase 1F theo roadmap

Phase 1F tương ứng Phase 6 — Báo cáo và bàn giao trong đặc tả. Chưa có plan triển khai được chủ dự án phê duyệt. Phiên mới nên đọc code/schema hiện tại rồi lập plan trước, không triển khai ngay.

Phạm vi roadmap dự kiến:

1. Dashboard theo quyền, thời gian, kênh bán và phương thức thanh toán.
2. Báo cáo doanh thu cho nhân viên theo quyền `own/all`.
3. Báo cáo owner về net revenue, net COGS, gross profit và đối soát financial-event ledger.
4. Inventory valuation owner-only và đối soát quantity/value movement với balances.
5. Chỉ tiêu: số đơn, số lượng sản phẩm, doanh thu gộp, giảm dòng, giảm toàn đơn, doanh thu thuần, giá trị đơn trung bình, trả hàng và hủy.
6. Loại hoàn toàn `legacy_sales` khỏi báo cáo chính thức; return/cancel ghi nhận theo ngày sự kiện, không sửa ngược ngày bán.
7. UAT, security/performance audit, backup/runbook và hướng dẫn vận hành.
8. Nhập danh mục thật, mở sổ tồn/cost và dữ liệu cũ chỉ đọc chỉ khi chủ dự án cung cấp/chấp thuận dữ liệu.
9. Vercel/production vẫn cần quyết định riêng của chủ dự án; không tự deploy trong bước lập plan.

Những câu hỏi cần được chốt trong plan Phase 1F nếu code/spec không đủ rõ:

- Bộ lọc thời gian mặc định và cách chốt ngày theo `Asia/Ho_Chi_Minh`.
- Dashboard cần realtime gần tức thời hay refetch theo thao tác/khoảng thời gian.
- Định dạng xuất báo cáo: chỉ màn hình, CSV/XLSX hay thêm PDF.
- Phạm vi UAT và thời điểm chuyển project Cloud hiện tại thành staging/production tách biệt.
- Thời điểm bật leaked-password protection và kế hoạch Vercel/backup.

## 8. Ranh giới kỹ thuật phải giữ ở Phase 1F

- Báo cáo phải tổng hợp từ authoritative ledgers/snapshots, không tính COGS bằng average cost hiện tại.
- `SALE_COMPLETED` mang revenue/COGS dương; `RETURN_COMPLETED` và `SALE_CANCELLED` mang delta âm tại thời điểm sự kiện.
- Nhân viên không được nhận, render, fetch hoặc cache cost/profit DTO.
- Báo cáo cost/profit owner-only không persist vào localStorage, IndexedDB hoặc service-worker runtime cache.
- Tiền dùng `numeric`/canonical decimal string; không dùng JavaScript floating point cho đối soát tài chính authoritative.
- Pagination/filtering phải thực hiện server-side và có giới hạn; tránh tải toàn bộ ledger về browser.
- Mọi RPC mới dùng error envelope/correlation ID, expected version/idempotency khi là command, thông báo tiếng Việt và kiểm tra bằng JWT thật.
- Không thêm lô, hạn dùng, thuế, công nợ, split payment, hóa đơn điện tử hoặc đa cửa hàng nếu chưa có yêu cầu mới.

## 9. Quy trình đề nghị cho phiên Codex mới

1. Đọc toàn bộ handoff này và hai đặc tả gốc liên quan đến báo cáo/triển khai.
2. Chạy các kiểm tra Git đọc-only ở mục 3.
3. Kiểm tra migration list và các RPC/ledger hiện có; không thay đổi Cloud trong bước lập plan.
4. Đối chiếu UI dashboard placeholder, quyền báo cáo, financial events, inventory valuation và test infrastructure.
5. Viết plan Phase 1F có schema/RPC/DTO/UI/test/UAT/deployment boundary rõ ràng.
6. Chờ chủ dự án phê duyệt plan trước khi tạo branch/migration hoặc triển khai.
7. Khi triển khai: chỉ agent chính, Cloud-only, migration review trước khi push, regenerate types và chạy đầy đủ quality gates.

## 10. Prompt ngắn để mở phiên chat mới

Có thể gửi nguyên văn nội dung sau trong phiên mới:

> Tiếp tục dự án Tuệ Nhi tại `/Users/admin/tuenhi`. Hãy đọc `docs/handoffs/2026-08-23-phase-1e-to-phase-1f-handoff.md` và hai đặc tả được dẫn trong đó. Kiểm tra trạng thái Git/Supabase bằng thao tác đọc-only, sau đó lập kế hoạch Phase 1F đúng roadmap. Chỉ dùng agent chính Codex, không dùng sub-agent hoặc Superpowers skill, không dùng Supabase local/Docker, chưa deploy Vercel, không push/merge và chưa thay đổi Supabase Cloud trong bước lập plan.

## 11. Điều không được làm khi tiếp quản

- Không dùng `git reset --hard`, checkout đè hoặc xóa nhánh/worktree.
- Không commit `.env`, workbook thật, PDF test, secret, dữ liệu nhận diện hoặc artifact Playwright.
- Không chạy test phá dữ liệu trên dữ liệu cửa hàng thật.
- Không coi dữ liệu cũ là dữ liệu tài chính chính thức.
- Không merge/push/deploy khi chưa có xác nhận của chủ dự án.
- Không đánh dấu Phase 1F hoàn tất nếu chưa qua JWT security tests, reconciliation, desktop/mobile E2E và UAT theo phạm vi được duyệt.
