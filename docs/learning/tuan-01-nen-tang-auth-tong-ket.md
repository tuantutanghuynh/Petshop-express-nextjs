# 📅 Tổng kết Tuần 1 — Nền tảng & Auth (Buổi 1-5)

> Chi tiết từng buổi: [buoi-01](buoi-01-setup-express-docker-prisma.md) ·
> [buoi-02](buoi-02-schema-prisma-migrate.md) ·
> [buoi-03-04](buoi-03-04-middleware-auth-annotations.md) · Buổi 5 (tổng hợp ở file này).
> Theo plan: [docs/superpowers/plans/2026-08-21-miniecom-month1-mvp.md](../superpowers/plans/2026-08-21-miniecom-month1-mvp.md)

## 1. Mục tiêu Tuần 1

Dựng xong toàn bộ hạ tầng nền tảng cho backend: Express chạy được, Postgres kết nối qua
Prisma, middleware chuẩn (error handling, response format, validation), auth JWT
access+refresh, RBAC role thô — mọi tính năng sau này (Blog & Gallery từ Tuần 2, Ecommerce
core ở Giai đoạn 2) đều xây trên nền này.

## 2. Kết quả cuối tuần — cây file backend hiện tại

```
backend/
├── app.js                          Express app: middleware, mount /api/v1, error handler
├── config/env.js                   Đọc biến môi trường tập trung
├── controllers/auth.controller.js  register/login/refresh/logout
├── middlewares/
│   ├── authenticate.js             Verify access token, gắn req.user
│   ├── errorHandler.js             Error handler tập trung, format {data,meta,error}
│   ├── notFound.js                 Catch-all 404
│   ├── requireRole.js              RBAC role thô
│   └── validate.js                 Đọc kết quả express-validator, ném ApiError 422
├── routes/
│   ├── auth.route.js                /auth/register, /login, /refresh, /logout
│   └── index.js                     Router gốc /api/v1
├── scripts/seedAdmin.js            Tạo tài khoản admin đầu tiên (chạy tay, không qua HTTP)
├── services/
│   ├── jwt.service.js              Ký/verify access token (JWT)
│   ├── prisma.js                   Prisma Client singleton + driver adapter
│   └── token.service.js            Issue/rotate/revoke refresh token (opaque, hash trong DB)
└── utils/
    ├── ApiError.js                 Class lỗi chuẩn (status, code, message, details)
    ├── ApiResponse.js              sendSuccess() — format response thành công thống nhất
    └── asyncHandler.js             Bọc controller async, tự forward lỗi tới errorHandler
```

Database (`prisma/schema.prisma`): `User`, `RefreshToken`, `Category`,
`CategoryAttribute`, `Product`, `ProductVariant`, `ProductImage` — 3 model catalog cuối
tạo sẵn từ Buổi 2 nhưng chưa dùng tới (dành cho Giai đoạn 2, không phải lãng phí).

## 3. Buổi 1 — Setup Express + Docker Postgres + Prisma

Xem chi tiết: [buoi-01-setup-express-docker-prisma.md](buoi-01-setup-express-docker-prisma.md).

Tóm tắt: `bin/www` tách khỏi `app.js`; Postgres chạy qua Docker Compose ở **port 5434**
(5432 đã bị chiếm sẵn trên máy); phát hiện Prisma 7 bắt buộc driver adapter
(`@prisma/adapter-pg`), không còn hỗ trợ `datasource.url` trong schema.

## 4. Buổi 2 — Schema Prisma rút gọn & migrate

Xem chi tiết: [buoi-02-schema-prisma-migrate.md](buoi-02-schema-prisma-migrate.md).

Tóm tắt: 6 model catalog ban đầu; dùng JSONB (`attributes`) cho thuộc tính sản phẩm thay
vì cột cứng theo ngành hàng; bài học paste-đè mất `datasource`/`generator` block khi copy
code vào file đã có nội dung sẵn.

## 5. Buổi 3-4 — Middleware chuẩn, Auth JWT, chú thích chi tiết

Xem chi tiết: [buoi-03-04-middleware-auth-annotations.md](buoi-03-04-middleware-auth-annotations.md).

Tóm tắt: `ApiError`/`asyncHandler`/`sendSuccess` là bộ 3 nền tảng dùng lại xuyên suốt
toàn dự án; JWT access (15 phút) + refresh (7 ngày, opaque, hash SHA-256 lưu DB, rotation
khi dùng); 2 lỗi review được từ code tự viết (`hasToken`→`hashToken`,
`INVALID_CREDENTIALS`→`INVALID_REFRESH_TOKEN`); sự cố Prisma Client bị rỗng sau khi pin
version (quên chạy lại `prisma generate`); toàn bộ `middlewares/` + `utils/` đã được chú
thích chi tiết dạng pseudocode tiếng Anh theo format `authenticate.js`.

## 6. Buổi 5 — RBAC role thô + review Tuần 1

### 6.1 Nội dung đã làm
- `middlewares/requireRole.js`: middleware nhận danh sách role cho phép
  (`requireRole('admin')`), kiểm tra `req.user.role` — phải đứng SAU `authenticate` trong
  chuỗi middleware vì cần `req.user` đã được gắn sẵn. Phân biệt rõ 401 (chưa xác thực) và
  403 (đã xác thực nhưng không đủ quyền).
- `scripts/seedAdmin.js`: script chạy tay tạo tài khoản admin đầu tiên
  (`admin@miniecom.local` / `admin123456`) — không có endpoint public nào được phép tự
  đăng ký role `admin`, tránh việc client tự phong quyền cho mình.

### 6.2 Sự cố gặp phải & cách xử lý
- **Docker daemon chưa chạy** sau khi máy khởi động lại (tái diễn, đã gặp ở Buổi 2) —
  luôn kiểm tra `docker compose ps` đầu buổi trước khi chạy lệnh liên quan DB.
- **`MODULE_NOT_FOUND` khi chạy `seedAdmin.js`**: chạy `node backend/scripts/seedAdmin.js`
  trong khi terminal đã đứng sẵn trong thư mục `backend/` → đường dẫn bị lặp thành
  `backend/backend/scripts/...` không tồn tại. Bài học: câu lệnh trong tài liệu hướng dẫn
  thường giả định chạy từ thư mục gốc project — luôn để ý đang đứng ở đâu (`pwd`) trước
  khi copy lệnh có đường dẫn tương đối.

### 6.3 Checklist review Tuần 1 (đã xác nhận đạt)
- [x] `docker compose ps` → Postgres chạy ổn định.
- [x] Đăng ký/đăng nhập/refresh/logout qua curl trả đúng format `{data, meta, error}`.
- [x] Route không tồn tại → 404 đúng format.
- [x] Phân biệt được 401 (chưa xác thực) vs 403 (không đủ quyền).
- [x] Admin đầu tiên đã seed thành công, sẵn sàng dùng cho Tuần 2 (bảo vệ endpoint tạo
  bài blog/gallery).

## 7. Toàn bộ commit Tuần 1 (theo thứ tự)

```
feat(buoi-1): setup express, docker postgres, prisma init
fix(buoi-1): prisma7 driver adapter (@prisma/adapter-pg) + docs buoi 1
feat(buoi-2): prisma schema rut gon (user/category/product) + migrate
docs: spec doi huong - blog & gallery + deploy truoc ecommerce core
docs: cap nhat plan theo huong moi - blog&gallery+deploy truoc, ecommerce archive lam sau
chore: gitignore docs/, khong push thu muc docs len GitHub (giu project-docs)
feat(buoi-3): error handler, response format chuan, validate middleware
docs: them README mo ta project, stack, huong dan chay backend
authentication (buoi-4, cam bang tay)
feat(buoi-4): auth register/login/refresh/logout voi jwt access + refresh
docs(buoi-3): chu thich chi tiet errorHandler/notFound/validate theo format authenticate.js
docs(buoi-4): chu thich chi tiet utils/ theo format authenticate.js
feat(buoi-5): rbac requireRole middleware + seed admin script
```

## 8. Quiz tổng hợp Tuần 1 (tự ôn trước khi qua Tuần 2)

1. Vẽ lại luồng đầy đủ 1 request `POST /api/v1/categories` (giả định đã có ở Giai đoạn 2)
   đi qua bao nhiêu middleware theo thứ tự nào, tới khi chạm controller?
2. Vì sao access token và refresh token cần 2 cơ chế lưu trữ/verify khác nhau hoàn toàn
   (JWT tự chứa thông tin vs opaque token phải tra DB)?
3. `asyncHandler` giải quyết vấn đề gì của Express với hàm `async` — không có nó thì gì
   sẽ xảy ra khi 1 `await prisma.xxx()` bên trong controller bị lỗi?
4. Kể lại 2 lỗi thực tế đã tự viết sai ở Buổi 4 (đặt tên hàm, mã lỗi) — vì sao mỗi lỗi lại
   nguy hiểm/gây khó chịu ở mức độ khác nhau?
5. RBAC role thô (`requireRole`) khác gì permission model chi tiết (bảng
   `permissions`/`role_permissions`) mà tài liệu gốc đề cập? Vì sao Tuần 1 chưa cần làm
   permission model chi tiết?

---
*Tuần tiếp theo: Tuần 2 — Blog & Gallery (Schema + API), bắt đầu từ
[Buổi 6](../superpowers/plans/2026-08-21-miniecom-month1-mvp.md#task-6-buổi-6-schema-blogpost--galleryitem--migrate)*
