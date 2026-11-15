# 📘 Buổi 2 — Nhật ký: Schema Prisma rút gọn & migrate

> Theo plan: [docs/superpowers/plans/2026-08-21-miniecom-month1-mvp.md](superpowers/plans/2026-08-21-miniecom-month1-mvp.md) — Task 2

## 1. Mục tiêu buổi học

Khai báo 6 model lõi (User, Category, CategoryAttribute, Product, ProductVariant,
ProductImage) trong `prisma/schema.prisma`, migrate xuống Postgres, và viết
`services/prisma.js` — Prisma Client singleton dùng driver adapter đã chốt ở Buổi 1.

## 2. Kiến thức cốt lõi

### 2.1 Vì sao dùng cột `Json` (`attributes`) thay vì cột cứng cho từng ngành hàng?

Đây là ý tưởng cốt lõi của mục 4.1 tài liệu gốc: pet food cần "trọng lượng", mỹ phẩm cần
"dung tích" — nếu tạo cột riêng cho từng ngành, thêm ngành mới = phải sửa schema liên
tục (migration liên tục, downtime, rủi ro). JSONB cho phép thêm ngành hàng mới chỉ bằng
cách insert thêm dòng `CategoryAttribute`, không đụng tới schema.

### 2.2 Vì sao `@@unique([productId, variantKey])`?

Chống trùng biến thể sản phẩm — 1 sản phẩm không thể có 2 biến thể với cùng bộ thuộc
tính (vd 2 dòng "Hạt cho chó Adult 3kg" trùng nhau). `variantKey` sẽ được tính từ
`variantAttributes` đã canonicalize (chuẩn hoá thứ tự key) — việc này để dành Buổi 8.

### 2.3 Prisma Client singleton — vì sao không `new PrismaClient()` ở mỗi file?

Mỗi lần gọi `new PrismaClient()` sẽ mở 1 connection pool riêng tới Postgres. Nếu mỗi
controller tự tạo instance, ứng dụng có thể mở hàng chục connection pool không cần
thiết, dễ làm cạn kết nối (`max_connections`) của Postgres khi app lớn dần. Giải pháp:
tạo **một lần duy nhất** trong `services/prisma.js`, mọi nơi khác `require()` lại cùng
1 instance.

## 3. Sự cố gặp phải & cách xử lý

### 3.1 Paste đè mất `generator`/`datasource` block

Khi copy 6 model vào `schema.prisma`, thao tác chọn-hết-rồi-paste đã **xoá mất** 2 khối
`generator client {}` và `datasource db {}` vốn đã có sẵn từ Buổi 1. Prisma báo lỗi rõ
ràng: `Error: Schema must contain a datasource block` — vì Prisma bắt buộc phải có
`datasource` block dù (ở Prisma 7) nó không chứa `url` bên trong.

Fix: chèn lại đúng 2 block vào đầu file.

**Bài học thao tác quan trọng**: khi copy code mẫu vào 1 file **đã có nội dung sẵn**
(không phải file trống), luôn **chèn/nối thêm** vào đúng vị trí, không chọn hết
(Cmd+A) rồi paste đè — dễ mất phần code cũ mà không nhận ra ngay, đặc biệt với file cấu
hình (`.prisma`, `.json`, `.env`) nơi lỗi chỉ lộ ra khi chạy CLI/build, không phải lỗi
cú pháp hiện ngay trong editor.

### 3.2 Docker daemon chưa chạy (sau khi máy khởi động lại)

`npx prisma migrate dev` báo `Error: P1001: Can't reach database server at
localhost:5434`. Nguyên nhân: Docker.app (không phải Docker Desktop — máy này cài dưới
tên `Docker.app`) chưa được mở lại sau khi restart máy, nên daemon không chạy, container
Postgres cũng không tự khởi động cùng.

Fix: `open -a "Docker"` để mở app, đợi daemon sẵn sàng (`docker info` trả về không lỗi),
rồi `docker compose up -d` để container Postgres chạy lại (data trong volume `pgdata`
vẫn còn nguyên — không mất gì).

**Bài học**: container Docker không tự "sống lại" khi bật máy nếu Docker daemon chưa
chạy — luôn kiểm tra `docker compose ps` đầu mỗi buổi học trước khi chạy lệnh liên quan
DB, tránh nhầm lẫn "lỗi kết nối" với "lỗi code".

## 4. Toàn bộ source code cuối buổi (đã verify chạy được)

**`backend/prisma/schema.prisma`**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  fullName     String?
  role         String   @default("customer")
  createdAt    DateTime @default(now())
}

model Category {
  id          String   @id @default(uuid())
  parentId    String?
  name        String
  slug        String   @unique
  description String?
  createdAt   DateTime @default(now())
  attributes  CategoryAttribute[]
  products    Product[]
}

model CategoryAttribute {
  id              String   @id @default(uuid())
  categoryId      String
  category        Category @relation(fields: [categoryId], references: [id])
  attributeKey    String
  attributeLabel  String
  attributeType   String
  isRequired      Boolean  @default(false)
  isFilterable    Boolean  @default(true)
  options         Json?
  validationRules Json?
}

model Product {
  id          String   @id @default(uuid())
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])
  name        String
  slug        String   @unique
  description String?
  brand       String?
  status      String   @default("draft")
  attributes  Json     @default("{}")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  variants    ProductVariant[]
  images      ProductImage[]
}

model ProductVariant {
  id                String  @id @default(uuid())
  productId         String
  product           Product @relation(fields: [productId], references: [id])
  sku               String  @unique
  price             BigInt
  compareAtPrice    BigInt?
  stockQuantity     Int     @default(0)
  reservedQuantity  Int     @default(0)
  variantAttributes Json    @default("{}")
  variantKey        String
  imageUrl          String?

  @@unique([productId, variantKey])
}

model ProductImage {
  id        String  @id @default(uuid())
  productId String
  product   Product @relation(fields: [productId], references: [id])
  url       String
  altText   String?
  position  Int     @default(0)
}
```

**`backend/services/prisma.js`**
```javascript
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { databaseUrl } = require('../config/env');

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
```

## 5. Verify cuối buổi (đã chạy thật, có kết quả)

```bash
$ npx prisma migrate dev --name init_core_catalog
Applying migration `20260831030322_init_core_catalog`
Your database is now in sync with your schema.

$ docker compose exec -T postgres psql -U miniecom -d miniecom -c "\dt"
               List of relations
 Schema |        Name        | Type  |  Owner
--------+--------------------+-------+----------
 public | Category           | table | miniecom
 public | CategoryAttribute  | table | miniecom
 public | Product            | table | miniecom
 public | ProductImage       | table | miniecom
 public | ProductVariant     | table | miniecom
 public | User               | table | miniecom
 public | _prisma_migrations | table | miniecom
(7 rows)
```

## 6. Quiz tự ôn

1. Vì sao mô hình JSONB + `category_attributes` (schema động) được coi là cân bằng tốt
   hơn EAV thuần (bảng `attribute_values` tách riêng từng dòng) khi cần filter nhiều
   điều kiện? (gợi ý: đọc lại mục 4.3 tài liệu gốc)
2. Nếu 2 request tạo `ProductVariant` cùng lúc với cùng `variantAttributes`, điều gì xảy
   ra ở tầng database nhờ `@@unique([productId, variantKey])`? Postgres trả lỗi gì?
3. Prisma Client singleton giải quyết vấn đề gì về connection pool? Thử hình dung nếu
   1 request tạo `new PrismaClient()` mới rồi không bao giờ `$disconnect()` — điều gì
   xảy ra sau hàng nghìn request?
4. Vì sao lỗi "mất `datasource` block" chỉ lộ ra khi chạy `npx prisma migrate dev` chứ
   không phải ngay khi lưu file? Editor có "biết" đây là file `.prisma` không hợp lệ
   không?
5. Docker volume (`pgdata:`) và Docker daemon là 2 khái niệm khác nhau thế nào? Vì sao
   daemon không chạy không có nghĩa là data trong volume bị mất?

---
*Buổi tiếp theo: [Buổi 3 — Middleware chuẩn](superpowers/plans/2026-08-21-miniecom-month1-mvp.md#task-3-buổi-3-middleware-chuẩn--error-handler-response-format-validation)*
