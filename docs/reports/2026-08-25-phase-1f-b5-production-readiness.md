# Phase 1F-B5 — Production-readiness report

**Trạng thái:** Technical readiness đạt; đang chờ Owner hoàn tất UAT Preview.
Chưa đủ điều kiện Production.

**Nhánh/commit khởi đầu:** `codex/phase-1f-b5-pilot-release-readiness` từ
`1a83ff6` (B4 staff access waiver).

**Preview cần nghiệm thu:**
`https://tuenhi-git-codex-phase-1f-b4-free-e06312-hoangnvthkts-projects.vercel.app`

## Ranh giới đã xác nhận

- Cloud giữ `OWNER_PILOT`; policy nhân viên hiện là `OWNER_WAIVER` có audit.
- Không tạo nhân viên, không merge `main`, không deploy Production và không
  chuyển lifecycle trong B5.
- Dữ liệu Cloud hiện là mock để Owner test. B5 không cleanup, backup, restore,
  import dữ liệu thật hoặc chạy Cloud runner.

## Evidence kỹ thuật

| Hạng mục               | Kết quả                             | Bằng chứng                                                          |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| Local quality gate     | Đạt baseline; chạy lại trước commit | `pnpm check`: 68 files / 285 tests                                  |
| App-shell E2E          | Đạt                                 | `pnpm test:e2e:ci`: 2/2 desktop/mobile                              |
| Preview route/PWA      | Chờ Owner kiểm trong phiên Vercel   | HTTP ẩn danh bị Vercel SSO chuyển về login                          |
| Browser-safe config    | Đạt trên build local                | Không source map/server credential; contract chỉ nhận hai `VITE_*`  |
| Cloud lifecycle/policy | Đạt                                 | `cutover:verify`: `OWNER_PILOT`, `OWNER_WAIVER`, audit còn hiệu lực |
| DB state               | Đạt                                 | 35 migrations khớp; DB lint và advisors không có lỗi                |

## B5 bổ sung — chứng từ chuyển khoản

Hai migration B5 (`20260825075636`, `20260825080119`) đã tạo bucket private
`payment-proofs`, metadata immutable cho thanh toán/hoàn tiền và guard RPC.
Mọi giao dịch chuyển khoản mới phải có ảnh JPEG/PNG/WebP ≤ 5 MiB; cash không
được đính kèm ảnh. Object chỉ được liên kết sau command thành công và chỉ xem
qua signed URL. Lịch sử/mock cũ không bị hồi tố.

Owner cần UAT thêm: bán chuyển khoản và hoàn tiền chuyển khoản không thể xác
nhận khi thiếu ảnh; có thể chụp/tải ảnh, hoàn tất và xem lại chứng từ. Khi trả
hàng, số lượng `1.000` phải được gửi canonical thành `1` và hoàn tất được.

## UAT Owner

Owner ký kết quả theo
[runbook B5](../runbooks/phase-1f-b5-owner-pilot-readiness.md): Auth, danh
mục, tồn kho, POS, hủy/trả, Dashboard/Reports/XLSX, deep-link/PWA và
desktop/mobile/offline. Chỉ UAT do Owner thực hiện mới được đánh dấu hoàn tất;
không thay bằng Cloud runner.

Do Preview được Vercel Deployment Protection bảo vệ, Owner thực hiện các kiểm
tra route/PWA sau khi đăng nhập Vercel. Nếu Preview cần cho người ngoài team
Vercel, việc thay đổi Deployment Protection là quyết định vận hành riêng,
không nằm trong B5.

## Blocker Production còn hiệu lực

Dữ liệu mock (bao gồm hàng hóa, tồn kho và chứng từ mock) còn ở Cloud. Trước
go-live phải có phase cutover riêng do Owner duyệt để quyết định và thực hiện
xử lý mock theo phương án an toàn, sau đó mới nhập dữ liệu thật, tạo baseline
backup, đối soát và xét Production deployment.
