# Thiết kế: Tháng 1 — Nền tảng Ecommerce (MVP học sâu)

Ngày: 2026-08-21
Trạng thái: Đã duyệt, chuyển sang lập kế hoạch triển khai (writing-plans)

## Bối cảnh

- Dự án đích: `Miniecom-nextjs-expess` — tài liệu khởi tạo tại
  `docs/learning/tai-lieu-khoi-tao-du-an-ecommerce (1).md` mô tả một nền tảng ecommerce
  đa ngành production-grade (NestJS/Next.js, PostgreSQL + Prisma, Redis,
  BullMQ, Meilisearch, VNPay/MoMo, RBAC permission-based, event tracking,
  outbox pattern...). Tài liệu tự ước tính ~15.5 tuần full-time cho
  MVP→production, và ghi rõ part-time có thể gấp 3-4 lần.
- Dự án mẫu tham khảo phong cách học: `~/Programming/nodejs/MiniProject-CoffeeShop-Express`
  — Node/Express/MongoDB/Mongoose, JWT+Redis, client React/Vite/Zustand.
  Có `mentor_guide.md` (phong cách mentor) và `docs/01-12_*.md` (giải thích
  cú pháp từng dòng) + file quiz phỏng vấn riêng — đây là khuôn mẫu tài liệu
  cần lặp lại cho dự án này.
- Người học có 1 tháng, nhịp độ ~2-3h/ngày, các ngày trong tuần (~20-22 buổi).
- Kết luận: làm toàn bộ tài liệu gốc trong 1 tháng là không khả thi. Tháng 1
  là sub-project đầu tiên (MVP nền tảng), các phần hạ tầng nặng để lại cho
  các giai đoạn sau.

## Quyết định đã chốt

| Hạng mục | Quyết định |
|---|---|
| Ngôn ngữ | JavaScript thuần (CommonJS), giống dự án mẫu |
| Backend framework | Express (không dùng NestJS như tài liệu gốc đề xuất) |
| Database | PostgreSQL, chạy local qua Docker Compose |
| Data access | Prisma ORM; dùng `$transaction` + raw `FOR UPDATE` cho phần row-lock tồn kho |
| Auth | JWT access + refresh; refresh token hash lưu trong bảng Postgres riêng (không dùng Redis ở tháng 1) |
| RBAC | Cột `role` thô trên `users` (`customer`/`staff`/`admin`) + middleware `requireRole()`; permission model chi tiết hoãn lại |
| Giỏ hàng | Client-side (Next.js state/localStorage), không có bảng `cart_items` |
| Thanh toán | Gateway giả lập nội bộ (`POST /api/v1/payments/fake-webhook`), không tích hợp VNPay/MoMo thật |
| Job hết hạn reservation | `setInterval` trong process (ghi chú rõ: production nên dùng queue) |
| Frontend | Next.js App Router, JavaScript, frontend cơ bản (không admin UI) |
| Admin | Chỉ test CRUD qua Postman/Thunder Client trong tháng 1 |
| Learning loop | Mỗi buổi: giải thích khái niệm → code mẫu có chú thích để tự chép và tự tìm hiểu thêm. Không có bước đặt câu hỏi thử thách/chờ phản hồi. |
| Tài liệu sinh ra | Cuối mỗi tuần: 1 file `docs/NN_*.md` giải thích cú pháp chi tiết (theo mẫu `01_app_and_db_setup.md`) + bổ sung vào 1 file quiz phỏng vấn chung |

## Phạm vi Data model tháng 1

Giữ lại (rút gọn từ `docs/schema.sql`, khai báo trong `prisma/schema.prisma`):
`users`, `refresh_tokens`, `categories`, `category_attributes`, `products`,
`product_variants`, `product_images`, `orders`, `order_items`,
`order_reservations`, `payment_webhook_logs`, `order_status_history`.

Hoãn lại (không tạo bảng trong tháng 1): `permissions`/`role_permissions`,
`blog_posts`, `gallery_items`, `outbox_events`, `events` (analytics),
`product_reviews`, `cart_items`.

## Kiến trúc thư mục

```
backend/
  bin/www
  config/ (db.js — Prisma client, env.js)
  prisma/schema.prisma
  routes/ → middlewares/ → controllers/ → services/
frontend/
  app/(shop)/...
```

## Lộ trình 4 tuần (~20 buổi, thứ 2-6, 2-3h/buổi)

**Tuần 1 — Nền tảng & Auth**
- B1: Setup Express + Docker Compose Postgres + kết nối Prisma
- B2: Thiết kế & migrate schema Prisma rút gọn (users/categories/products)
- B3: Middleware chuẩn (error handler, response format `{data, meta, error}`, validation)
- B4: Auth — đăng ký/đăng nhập, JWT access + refresh
- B5: RBAC role thô + review tuần 1

**Tuần 2 — Catalog**
- B6: Category CRUD + `category_attributes` CRUD
- B7: Product CRUD + validate JSONB `attributes` theo `category_attributes`
- B8: Product variants (SKU, giá, `variant_key` canonicalize)
- B9: Upload ảnh sản phẩm (multer, lưu local)
- B10: List/filter/phân trang sản phẩm + review tuần 2

**Tuần 3 — Cart → Order → Payment giả lập**
- B11: Luồng giỏ hàng client-side + API tính tổng đơn
- B12: Order + order_items (snapshot bất biến — không tham chiếu giá/tên hiện tại)
- B13: Reservation tồn kho (transaction + row lock, chống race condition)
- B14: State machine order/payment/fulfillment + fake payment webhook
- B15: Idempotency-Key cho `POST /orders` + job hết hạn reservation + review tuần 3

**Tuần 4 — Next.js Frontend**
- B16: Setup Next.js + fetch danh mục/sản phẩm
- B17: Trang chi tiết sản phẩm + giỏ hàng client
- B18: Trang checkout gọi API tạo order
- B19: Test concurrency (script gửi nhiều request đồng thời mua 1 SP tồn kho thấp)
- B20: Tổng kết — README, đối chiếu tài liệu gốc, quiz phỏng vấn tổng hợp

Rõ ràng ngoài phạm vi tháng 1: Meilisearch, Redis/BullMQ, VNPay/MoMo thật,
Blog & Gallery, event tracking/analytics, permission model chi tiết, admin UI,
object storage (R2/S3), CI/CD, deploy production, monitoring, DR/backup,
outbox pattern, reconciliation worker.

## Roadmap sau tháng 1 (mức phác thảo — không lập kế hoạch chi tiết ngay)

| Giai đoạn | Nội dung | Ước tính (2-3h/ngày) |
|---|---|---|
| 2. Thanh toán thật & hoàn thiện Order | VNPay/MoMo sandbox thật, verify checksum, reconciliation worker, tách rõ order/payment/fulfillment status | ~3-4 tuần |
| 3. Admin dashboard + RBAC nâng cao | Trang quản trị Next.js CSR, bảng `permissions`/`role_permissions`, Idempotency-Key phủ hết endpoint | ~3-4 tuần |
| 4. SEO & Performance | Metadata động, structured data, ISR, sitemap, tối ưu ảnh | ~2 tuần |
| 5. Blog & Gallery | Schema, CRUD, trang blog/gallery, rich text editor, internal linking | ~2-3 tuần |
| 6. Search & filter đa ngành | Meilisearch, đồng bộ qua BullMQ | ~2 tuần |
| 7. Redis & Queue hoá hạ tầng | Chuyển job sang BullMQ, cache Redis, retry/backoff/dead-letter | ~1.5-2 tuần |
| 8. Analytics & event tracking | Bảng `events`, lớp trung gian `track()`, PostHog | ~1.5-2 tuần |
| 9. Bảo mật & upload nâng cao | Signed upload URL R2/S3, security checklist | ~1.5-2 tuần |
| 10. Go-live: hạ tầng, test, DR | CI/CD, Docker, staging, health check, backup/restore, test concurrency/load | ~2-3 tuần |
| 11. Mở rộng (tuỳ chọn) | Outbox pattern, audit log, observability, shipping domain, promotion/coupon, optimistic locking | Khi có nhu cầu thực tế |

Tổng ước tính giai đoạn 2→10: ~19-24 tuần (~4.5-6 tháng). Cộng tháng 1:
toàn hành trình đến sát tài liệu gốc ước tính **~5.5-7 tháng**, chưa tính
giai đoạn 11 (tuỳ chọn, tài liệu gốc xác nhận đây là điểm chừa chỗ kiến
trúc chứ không bắt buộc).

## Ngoài phạm vi (toàn dự án, không riêng tháng 1)

Không dùng NestJS/monorepo Turborepo như tài liệu gốc đề xuất — dùng Express
đơn giản để nhất quán với kỹ năng đã có từ dự án mẫu.
