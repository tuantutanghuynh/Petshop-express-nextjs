# 📘 Buổi 3-4 (tiếp) — Nhật ký: Middleware, Auth JWT, chú thích chi tiết

> Theo plan: [docs/superpowers/plans/2026-08-21-miniecom-month1-mvp.md](superpowers/plans/2026-08-21-miniecom-month1-mvp.md) — Task 3, Task 4

## 1. Mục tiêu

Hoàn thành Buổi 3 (middleware chuẩn) và Buổi 4 (auth JWT access+refresh), review code
người học tự viết, sửa lỗi phát hiện được, sau đó chú thích chi tiết (dạng pseudocode
tiếng Anh, numbered section) cho toàn bộ `middlewares/` và `utils/` theo đúng format
`authenticate.js` đã có sẵn.

## 2. Review Buổi 4 — lỗi phát hiện trong code người học tự viết

### 2.1 `services/token.service.js`: `hasToken` → `hashToken`
Gõ nhầm thiếu chữ "h" ở tên hàm (định nghĩa + 3 lần gọi trong `issueRefreshToken`,
`rotateRefreshToken`, `revokeRefreshToken`). Không gãy chức năng (dùng nhất quán trong
file) nhưng sai nghĩa — `hasToken` đọc như "có token hay không", còn hàm thật sự làm là
băm (hash) token. `sed` trên macOS (BSD sed) không hỗ trợ `\b` word-boundary như GNU sed
— thử sửa bằng `sed 's/\bhasToken\b/hashToken/g'` chỉ khớp trong comment, không khớp code
thật. Phải sửa lại bằng Edit tool trực tiếp (string match chính xác).

### 2.2 `controllers/auth.controller.js`: sai mã lỗi trong `refresh`
Dùng `ApiError(401, 'INVALID_CREDENTIALS', ...)` cho trường hợp refresh token không hợp
lệ — đúng ra phải là `'INVALID_REFRESH_TOKEN'` (khác `login` sai password). 2 tình huống
khác nhau cần 2 mã khác nhau để client (frontend) xử lý đúng: sai password → hiện lỗi
ngay form login; refresh token hỏng (thường xảy ra ngầm, không phải do user thao tác) →
tự động logout toàn bộ, điều hướng về trang login.

### 2.3 Sự cố môi trường: Prisma Client rỗng sau khi pin version
Sau khi xoá `node_modules/@prisma` + `node_modules/prisma` để pin cứng version (fix lỗi
Prisma bị regress về 6.12.0 — xem log trước), `npm install` lại KHÔNG tự chạy `prisma
generate`. Hệ quả: `prisma.user`, `prisma.category`... đều `undefined`, gây lỗi
`TypeError: Cannot read properties of undefined (reading 'findUnique')` ở MỌI endpoint
dùng DB. Fix: chạy tay `npx prisma generate`. **Bài học**: sau bất kỳ thao tác nào đụng
tới `node_modules/@prisma` hoặc `node_modules/prisma` (cài lại, xoá cache, đổi version),
luôn chạy lại `npx prisma generate` trước khi test — đừng mặc định `npm install` tự làm
việc này.

### 2.4 Verify end-to-end (đã chạy thật, pass toàn bộ)
register → login (nhận access+refresh) → refresh bằng token vừa nhận (rotation, token cũ
bị revoke) → dùng lại token cũ → đúng `401 INVALID_REFRESH_TOKEN` → login sai password →
đúng `401 INVALID_CREDENTIALS` → logout → dùng lại token sau logout → đúng
`401 INVALID_REFRESH_TOKEN`.

## 3. Chú thích chi tiết middlewares/ + utils/

Theo yêu cầu: thêm comment dạng pseudocode tiếng Anh (numbered section: IMPORT →
DEFINE FUNCTION (từng step) → EXPORT) cho các file sau, đúng format đã có sẵn ở
`middlewares/authenticate.js`:

- `middlewares/errorHandler.js` — giải thích rõ vì sao Express nhận diện error-handler
  qua đúng 4 tham số, phân biệt nhánh `ApiError` (lỗi biết trước) vs lỗi lạ (log +
  trả 500 chung, không lộ chi tiết).
- `middlewares/notFound.js` — catch-all cuối chuỗi route.
- `middlewares/validate.js` — cách `validationResult` đọc lại rule đã khai ở route,
  không tự throw.
- `utils/ApiError.js` — vì sao extend `Error`, ý nghĩa từng field `status`/`code`/`details`.
- `utils/ApiResponse.js` — lý do tồn tại `sendSuccess` (thống nhất shape response).
- `utils/asyncHandler.js` — vì sao Express không tự bắt được Promise reject trong route
  async, và cách wrapper giải quyết (`.catch(next)`).

Đã verify lại toàn bộ: `require()` thành công cả 6 file, server chạy bình thường,
`/health`, 404, và luồng auth đầy đủ vẫn đúng sau khi thêm comment — không có gì bị gãy.

## 4. Commit đã tạo hôm nay

- `feat(buoi-4): auth register/login/refresh/logout voi jwt access + refresh` — fix 2 lỗi
  review từ code người học tự viết (commit `464899d authentication` trước đó).
- `docs(buoi-3): chu thich chi tiet errorHandler/notFound/validate theo format authenticate.js`
- (tiếp theo) chú thích `utils/` — xem commit log.

## 5. Quiz tự ôn

1. Vì sao `hashToken`/`hasToken` là loại lỗi chính tả nguy hiểm hơn lỗi cú pháp thông
   thường — JS có báo lỗi ngay khi chạy không? Tại sao có/không?
2. Trình bày lại đúng use case cần phân biệt `INVALID_CREDENTIALS` và
   `INVALID_REFRESH_TOKEN` ở phía frontend.
3. Sau khi đổi version 1 package trong `node_modules`, vì sao Prisma cần chạy riêng lệnh
   `generate` thay vì tự động theo `npm install`? Prisma Client "sinh code" nghĩa là gì?
4. `asyncHandler` bọc quanh handler async để làm gì — nếu bỏ nó đi, viết 1 đoạn code cụ
   thể minh hoạ tình huống request bị "treo" (không response, không lỗi).

---
*Buổi tiếp theo: [Buổi 5 — RBAC role thô + review tuần 1](superpowers/plans/2026-08-21-miniecom-month1-mvp.md#task-5-buổi-5-rbac-role-thô--review-tuần-1)*
