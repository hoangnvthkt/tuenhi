# Kiến trúc frontend Tuệ Nhi

Ứng dụng dùng mô hình feature-first lai. `app` sở hữu composition, provider,
layout và URL; `features` sở hữu nghiệp vụ; `shared` chỉ chứa hạ tầng và thành
phần thật sự dùng chung.

## Dependency direction

```text
app ───────> features ───────> shared
 │                              ▲
 └──────────────────────────────┘
```

- `shared` không import từ `features` hoặc `app`.
- `features` không import từ `app`.
- Import liên feature phải dùng `@/features/<domain>`; không import file nội bộ.
- `app` chỉ import feature qua public `index.ts`.
- Import xuyên layer dùng alias `@/*`; import trong cùng module dùng đường dẫn
  tương đối ngắn.

## Cấu trúc feature

Mỗi feature chỉ tạo các thư mục có nội dung thực tế:

- `api`: Supabase/RPC client và Zod response schema.
- `model`: type, validation, query key và logic thuần.
- `hooks`: query, mutation và orchestration state.
- `components`: UI nghiệp vụ có thể tái sử dụng trong feature.
- `pages`: route-level composition, không chứa transport hoặc schema.
- `index.ts`: public surface tối thiểu cho router và feature khác.

Test đặt cạnh module được kiểm thử. Component/page/API thông thường nên được
tách khi vượt khoảng 250–300 dòng; generated types và parser chuyên biệt là
ngoại lệ được ghi rõ khi review.

## Quy tắc tương thích

Refactor cấu trúc không được đổi URL, permission guard, RPC signature, DTO
version, canonical decimal string, query parameter hoặc error code. Query key
đang dùng phải giữ ổn định để không thay đổi cache behavior.

Owner-only cost/profit code phải tách khỏi revenue code cho nhân viên. Hook
owner-only dùng permission gate, `enabled` và `gcTime: 0`; dữ liệu không được
persist vào localStorage, IndexedDB hoặc service-worker runtime cache.

## Định nghĩa hoàn thành một lát cắt

Một lát cắt chỉ hoàn thành khi targeted tests, TypeScript, ESLint và format đều
đạt; không còn compatibility import của vị trí cũ; route/RPC/DTO không đổi; và
full gate đạt trước khi push checkpoint lên Preview.
