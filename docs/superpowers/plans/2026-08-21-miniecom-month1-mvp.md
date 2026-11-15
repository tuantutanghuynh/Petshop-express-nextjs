# Miniecom Implementation Plan — Blog & Gallery + Deploy (đợt hiện tại), Ecommerce core (Giai đoạn 2)

> **Ghi chú vận hành (khác plan agent thông thường):** Đây là **giáo trình học từng buổi**,
> không phải plan để dispatch subagent tự viết code. Người thực thi = người học.
> Ở mỗi Task/Buổi, mentor (Claude) giải thích khái niệm rồi đưa code mẫu trong task đó;
> **người học tự tay chép code vào file, tự chạy lệnh verify**. KHÔNG dùng
> `superpowers:subagent-driven-development` hay `superpowers:executing-plans` để tự động
> viết code hộ — làm vậy sẽ triệt tiêu mục đích học. Claude chỉ đóng vai trò dẫn dắt buổi
> học tiếp theo trong hội thoại, dùng nội dung task tương ứng làm kịch bản.

> **Cập nhật 2026-08-22:** Đổi thứ tự ưu tiên theo
> `docs/superpowers/specs/2026-08-22-blog-gallery-deploy-reorder-design.md` — làm
> **Blog & Gallery + deploy web thật** trước (để bắt đầu tích luỹ SEO sớm), lõi ecommerce
> (cart/order/reservation/payment) dời thành **Giai đoạn 2**, đặt ở cuối file này dưới dạng
> archive (nội dung giữ nguyên, không mất gì). Buổi 1-5 (nền tảng, không đổi) đã hoàn thành.

**Goal:** Sau Buổi 1-5 (nền tảng đã xong), xây Blog + Gallery (schema, API, trang public,
trang admin đăng bài tối giản) rồi **deploy web thật** (Vercel + Render) để bắt đầu tích
luỹ SEO/traffic sớm — theo đúng phạm vi đã chốt ở
`docs/superpowers/specs/2026-08-22-blog-gallery-deploy-reorder-design.md`. Lõi ecommerce
(cart/order/reservation/payment) làm ở Giai đoạn 2, nội dung đã có sẵn ở cuối file này.

**Architecture:** MVC — `routes → middlewares → controllers → services → Prisma`, giống
cấu trúc dự án mẫu `MiniProject-CoffeeShop-Express`. Next.js App Router phục vụ cả trang
public (SEO-critical, cần responsive) lẫn `/admin` (nội bộ, không cần SEO nhưng vẫn phải
dùng được trên mobile cơ bản).

**Tech Stack:** Node.js, Express 5, JavaScript (CommonJS), PostgreSQL 15 (Docker Compose
local / Render+Neon khi deploy), Prisma ORM 7.x (driver adapter `@prisma/adapter-pg` + `pg`
— xem Global Constraints), JWT (`jsonwebtoken`) cho access token, refresh token opaque lưu
hash trong DB, `express-validator`, `multer` (upload ảnh — filesystem local, xem lưu ý
Task 13 về giới hạn khi deploy), Next.js (App Router, JavaScript), `marked` (render Markdown
→ HTML) + `isomorphic-dompurify` (sanitize HTML trước khi render, chống XSS).

## Global Constraints

- Mọi route API mount dưới prefix `/api/v1`.
- Response format thống nhất mọi endpoint: thành công `{ data, meta, error: null }`,
  lỗi `{ data: null, meta: null, error: { code, message, details } }` — không bao giờ trả
  raw exception ra client (spec mục "Auth"/tài liệu gốc mục 9.4).
- RBAC: middleware `requireRole()` kiểm tra `req.user.role` thô (`customer`/`staff`/
  `admin`) — không có bảng permission trong đợt này.
- Commit message theo dạng `feat(buoi-N): <mô tả ngắn>`, mỗi buổi commit ít nhất 1 lần
  ở cuối, rồi `git push` lên
  `https://github.com/tuantutanghuynh/Galery-blog-miniecom-nextjs-express.git`.
- **Prisma 7 driver adapter (phát hiện ở Buổi 1):** bản Prisma đang dùng (7.9.1) KHÔNG
  còn hỗ trợ `datasource.url` trong `schema.prisma`, và `new PrismaClient()` không có
  adapter sẽ throw `PrismaClientInitializationError` ngay khi gọi query. Bắt buộc:
  `schema.prisma` → datasource chỉ có `provider = "postgresql"`, không có dòng `url`;
  `prisma.config.ts` (đã tự sinh) giữ nguyên `datasource: { url: env("DATABASE_URL") }`
  để CLI (`migrate`/`studio`) dùng; runtime `services/prisma.js` phải khởi tạo qua
  `@prisma/adapter-pg` (đã dùng từ Buổi 2, giữ nguyên pattern).
- **SEO (bắt buộc — lý do chính của đợt này, spec mục "SEO"):** mọi trang public phải có
  `generateMetadata` (title/description/OG image) động theo dữ liệu thật; `alt` bắt buộc
  trên mọi ảnh; URL slug thân thiện; H1 duy nhất mỗi trang; `sitemap.xml` + `robots.txt`;
  structured data `BlogPosting` trên trang chi tiết blog.
- **Mobile-friendly (bắt buộc — spec mục "Mobile-friendly"):** mọi trang public dùng CSS
  responsive (flex/grid co giãn, không fix width cứng), test tối thiểu ở breakpoint 375px
  trước khi coi 1 trang là "xong". Dùng `next/image` (không dùng `<img>` thường) để tự có
  responsive `srcset`. Trang `/admin` không cần tối ưu chặt nhưng không được vỡ layout hoàn
  toàn trên mobile.
- Nội dung Markdown từ blog phải được sanitize (`isomorphic-dompurify`) trước khi render
  bằng `dangerouslySetInnerHTML` — kể cả khi chỉ admin (chính bạn) là người viết, đây là
  thói quen bắt buộc để chống XSS nếu tài khoản admin có ngày bị lộ (tài liệu gốc mục 9.5).
- Không cài đặt Meilisearch, Redis/BullMQ, VNPay/MoMo thật, analytics event tracking,
  permission model chi tiết, object storage (R2/S3), CI/CD — vẫn ngoài phạm vi đợt này.

---

## Cấu trúc file (đợt hiện tại — Blog & Gallery + Deploy, Buổi 6-15)

```
backend/
  (Buổi 1-5 đã có: package.json, docker-compose.yml, app.js, bin/www, config/env.js,
   prisma/schema.prisma, services/prisma.js, utils/*, middlewares/errorHandler.js,
   middlewares/notFound.js, middlewares/validate.js, middlewares/authenticate.js,
   middlewares/requireRole.js, services/jwt.service.js, services/token.service.js,
   controllers/auth.controller.js, routes/auth.route.js, routes/index.js)
  prisma/schema.prisma             (B6, thêm BlogPost/GalleryItem)
  controllers/blog.controller.js   (B7)
  routes/blog.route.js             (B7)
  middlewares/upload.js            (B8)
  controllers/upload.controller.js (B8)
  routes/upload.route.js           (B8)
  controllers/gallery.controller.js(B8)
  routes/gallery.route.js          (B8)
  public/uploads/                  (B8, ảnh upload — lưu ý ephemeral khi deploy, xem B13)

frontend/
  package.json, next.config.js     (B9, cấu hình next/image remote patterns)
  lib/apiClient.js                 (B9)
  lib/markdown.js                  (B9, render + sanitize Markdown)
  lib/adminAuth.js                 (B10, quản lý token localStorage)
  app/layout.js                    (B9, nav responsive)
  app/blog/page.js                 (B9)
  app/blog/[slug]/page.js          (B9, generateMetadata + JSON-LD)
  app/gallery/page.js              (B10)
  app/admin/login/page.js          (B10)
  app/admin/posts/page.js          (B10)
  app/admin/posts/new/page.js      (B11)
  app/admin/gallery/new/page.js    (B11)
  app/sitemap.js                   (B12)
  public/robots.txt                (B12)
  components/SeoJsonLd.js          (B12)
```

---

# TUẦN 1 — NỀN TẢNG & AUTH (đã hoàn thành, giữ nguyên)
# TUẦN 1 — NỀN TẢNG & AUTH

### Task 1 (Buổi 1): Setup Express + Docker Postgres + kết nối Prisma

**Files:**
- Create: `backend/package.json`, `backend/.env`, `backend/.env.example`,
  `backend/docker-compose.yml`, `backend/bin/www`, `backend/app.js`, `backend/config/env.js`

**Interfaces:**
- Produces: biến môi trường `DATABASE_URL`, `PORT`; app Express lắng nghe tại `PORT`
  (mặc định 4000); lệnh `docker compose up -d` khởi động Postgres tại `localhost:5432`.

**Khái niệm cần nắm:** vì sao tách `bin/www` (khởi động HTTP server) khỏi `app.js`
(định nghĩa Express app) — giống hệt dự án mẫu (`docs/01_app_and_db_setup.md`), giúp
`app.js` test được độc lập (import app mà không tự listen port). Vì sao dùng Docker cho
Postgres thay vì cài native: môi trường nhất quán, xoá sạch bằng `docker compose down -v`
khi cần làm lại từ đầu.

- [ ] **Step 1: Khởi tạo project & cài dependencies**

```bash
mkdir -p backend && cd backend
npm init -y
npm install express@^5 dotenv cors cookie-parser morgan http-errors
npm install --save-dev nodemon prisma
npm install @prisma/client
```

- [ ] **Step 2: Viết `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:15
    restart: unless-stopped
    environment:
      POSTGRES_USER: miniecom
      POSTGRES_PASSWORD: miniecom
      POSTGRES_DB: miniecom
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

- [ ] **Step 3: `.env` và `.env.example`**

```env
PORT=4000
DATABASE_URL="postgresql://miniecom:miniecom@localhost:5432/miniecom?schema=public"
JWT_ACCESS_SECRET=change_me_access
JWT_REFRESH_SALT=change_me_refresh
```

Copy y hệt sang `.env.example` nhưng thay giá trị secret bằng chuỗi giả — `.env` sẽ
được `.gitignore` sau, `.env.example` để người khác biết cần khai báo gì.

- [ ] **Step 4: `config/env.js`**

```javascript
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 4000,
  databaseUrl: process.env.DATABASE_URL,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSalt: process.env.JWT_REFRESH_SALT,
};
```

- [ ] **Step 5: `app.js` (khung tối thiểu, mở rộng dần các buổi sau)**

```javascript
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const logger = require('morgan');

const app = express();

app.use(logger('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
```

- [ ] **Step 6: `bin/www`**

```javascript
#!/usr/bin/env node
const app = require('../app');
const { port } = require('../config/env');

app.listen(port, () => {
  console.log(`Server đang chạy tại http://localhost:${port}`);
});
```

- [ ] **Step 7: Thêm script vào `package.json`**

```json
"scripts": {
  "start": "node ./bin/www",
  "dev": "nodemon ./bin/www"
}
```

- [ ] **Step 8: Chạy Postgres & khởi tạo Prisma**

```bash
docker compose up -d
npx prisma init --datasource-provider postgresql
```

Lệnh này tạo `prisma/schema.prisma` và ghi đè `.env` với `DATABASE_URL` mẫu — mở lại
`.env`, đảm bảo giá trị đúng như Step 3 (Prisma init có thể ghi đè comment, không đè giá
trị nếu key đã tồn tại).

- [ ] **Step 9: Verify**

```bash
docker compose ps          # Expected: postgres đang "Up"
npm run dev                # Expected: log "Server đang chạy tại http://localhost:4000"
curl http://localhost:4000/health   # Expected: {"status":"ok"}
```

- [ ] **Step 10: Commit**

```bash
cd backend
cat > .gitignore << 'EOF'
node_modules/
.env
EOF
git add -A
git commit -m "feat(buoi-1): setup express, docker postgres, prisma init"
```

(Nếu thư mục gốc chưa phải git repo: chạy `git init` ở root project trước khi commit.)

---

### Task 2 (Buổi 2): Schema Prisma rút gọn & migrate

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/services/prisma.js`

**Interfaces:**
- Produces: Prisma Client models `User`, `Category`, `CategoryAttribute`, `Product`,
  `ProductVariant`, `ProductImage` — dùng xuyên suốt các buổi sau qua
  `const prisma = require('../services/prisma')`.

**Khái niệm cần nắm:** vì sao dùng `Json` column cho `attributes` thay vì cột cứng cho
từng ngành hàng (tài liệu gốc mục 4.1/4.3) — JSONB cho phép thêm ngành hàng mới mà không
migrate; `@@unique([productId, variantKey])` chống trùng biến thể sản phẩm.

- [ ] **Step 1: Viết `prisma/schema.prisma` (phần model — giữ nguyên phần `generator`/
`datasource` Prisma đã sinh sẵn ở Buổi 1)**

```prisma
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

- [ ] **Step 2: Cài driver adapter & viết `services/prisma.js` — Prisma Client singleton**

```bash
npm install @prisma/adapter-pg pg
```

```javascript
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { databaseUrl } = require('../config/env');

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
```

(Singleton tránh việc mỗi file tự `new PrismaClient()` — mở nhiều connection pool
lãng phí, một lỗi phổ biến khi mới dùng Prisma. `adapter` là bắt buộc ở Prisma 7 — xem
Global Constraints — không dùng `new PrismaClient()` trơn như tài liệu Prisma cũ.)

- [ ] **Step 3: Chạy migration**

```bash
cd backend
npx prisma migrate dev --name init_core_catalog
```

Expected: log "Your database is now in sync with your schema", tạo thư mục
`prisma/migrations/<timestamp>_init_core_catalog/migration.sql`.

- [ ] **Step 4: Verify bằng Prisma Studio**

```bash
npx prisma studio
```

Expected: mở browser thấy 5 bảng rỗng: User, Category, CategoryAttribute, Product,
ProductVariant, ProductImage.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(buoi-2): prisma schema rut gon (user/category/product) + migrate"
```

---

### Task 3 (Buổi 3): Middleware chuẩn — error handler, response format, validation

**Files:**
- Create: `backend/utils/ApiError.js`, `backend/utils/ApiResponse.js`,
  `backend/utils/asyncHandler.js`, `backend/middlewares/errorHandler.js`,
  `backend/middlewares/notFound.js`, `backend/middlewares/validate.js`,
  `backend/routes/index.js`
- Modify: `backend/app.js`

**Interfaces:**
- Produces: `ApiError` (class), `sendSuccess(res, data, meta, status)`,
  `asyncHandler(fn)`, `validate(req, res, next)` — mọi controller từ Buổi 4 trở đi dùng
  các hàm này.

**Khái niệm cần nắm:** vì sao Express nhận diện error-handling middleware qua đúng
4 tham số `(err, req, res, next)`; vì sao bọc mọi controller async bằng `asyncHandler`
(nếu không, một `Promise` reject bên trong route async không tự động rơi vào
`errorHandler`, Express 4 sẽ treo request — Express 5 có cải thiện nhưng vẫn nên tường
minh để code portable).

- [ ] **Step 1: `utils/ApiError.js`**

```javascript
class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = ApiError;
```

- [ ] **Step 2: `utils/ApiResponse.js`**

```javascript
function sendSuccess(res, data, meta = null, status = 200) {
  return res.status(status).json({ data, meta, error: null });
}

module.exports = { sendSuccess };
```

- [ ] **Step 3: `utils/asyncHandler.js`**

```javascript
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = asyncHandler;
```

- [ ] **Step 4: `middlewares/validate.js`** (dùng chung với `express-validator` từ
Buổi 6 trở đi)

```bash
npm install express-validator
```

```javascript
const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new ApiError(422, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', errors.array())
    );
  }
  next();
}

module.exports = validate;
```

- [ ] **Step 5: `middlewares/notFound.js` và `middlewares/errorHandler.js`**

```javascript
// middlewares/notFound.js
const ApiError = require('../utils/ApiError');

module.exports = function notFound(req, res, next) {
  next(new ApiError(404, 'NOT_FOUND', `Route ${req.originalUrl} không tồn tại`));
};
```

```javascript
// middlewares/errorHandler.js
const ApiError = require('../utils/ApiError');

module.exports = function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      data: null,
      meta: null,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  console.error(err);
  return res.status(500).json({
    data: null,
    meta: null,
    error: { code: 'INTERNAL_ERROR', message: 'Đã có lỗi xảy ra', details: null },
  });
};
```

- [ ] **Step 6: `routes/index.js`** (router gốc, mỗi buổi sau sẽ `router.use('/xxx', ...)`
thêm vào đây)

```javascript
const router = require('express').Router();

module.exports = router;
```

- [ ] **Step 7: Gắn vào `app.js`** (thêm vào cuối file, sau các `app.use` đã có ở
Buổi 1, TRƯỚC dòng `module.exports = app;`)

```javascript
const routes = require('./routes');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

app.use('/api/v1', routes);
app.use(notFound);
app.use(errorHandler);
```

- [ ] **Step 8: Verify**

```bash
npm run dev
curl -i http://localhost:4000/api/v1/khong-ton-tai
```

Expected: HTTP 404, body `{"data":null,"meta":null,"error":{"code":"NOT_FOUND",...}}`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(buoi-3): error handler, response format chuan, validate middleware"
```

---

### Task 4 (Buổi 4): Auth — đăng ký, đăng nhập, JWT access + refresh

**Files:**
- Create: `backend/services/jwt.service.js`, `backend/services/token.service.js`,
  `backend/middlewares/authenticate.js`, `backend/controllers/auth.controller.js`,
  `backend/routes/auth.route.js`
- Modify: `backend/prisma/schema.prisma` (thêm model `RefreshToken`),
  `backend/routes/index.js`

**Interfaces:**
- Consumes: `ApiError`, `sendSuccess`, `asyncHandler`, `prisma` (từ Task 2/3).
- Produces: `signAccessToken(payload)`, `verifyAccessToken(token)` (jwt.service);
  `issueRefreshToken(userId)`, `rotateRefreshToken(rawToken)`,
  `revokeRefreshToken(rawToken)` (token.service) — Buổi 5 dùng
  `req.user = { id, role }` do `authenticate` middleware gắn vào.

**Khái niệm cần nắm:** vì sao access token ký JWT (tự chứa thông tin, verify không cần
query DB, sống ngắn ~15 phút) còn refresh token là chuỗi ngẫu nhiên đối lập (opaque,
PHẢI tra DB mới biết còn hiệu lực không, sống dài ~7 ngày) — đánh đổi giữa tốc độ verify
và khả năng thu hồi (revoke) ngay lập tức. Vì sao chỉ lưu **hash** của refresh token
trong DB (giống lưu password) chứ không lưu bản rõ: nếu DB bị lộ, kẻ tấn công vẫn không
dùng được token vì không đảo ngược hash được.

- [ ] **Step 1: Cài dependencies**

```bash
npm install bcrypt jsonwebtoken
```

- [ ] **Step 2: Thêm model `RefreshToken` vào `prisma/schema.prisma`**

```prisma
model RefreshToken {
  id         String    @id @default(uuid())
  userId     String
  tokenHash  String
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())
}
```

```bash
npx prisma migrate dev --name add_refresh_token
```

- [ ] **Step 3: `services/jwt.service.js`**

```javascript
const jwt = require('jsonwebtoken');
const { jwtAccessSecret } = require('../config/env');

const ACCESS_TOKEN_TTL = '15m';

function signAccessToken(payload) {
  return jwt.sign(payload, jwtAccessSecret, { expiresIn: ACCESS_TOKEN_TTL });
}

function verifyAccessToken(token) {
  return jwt.verify(token, jwtAccessSecret); // throws JsonWebTokenError nếu invalid/expired
}

module.exports = { signAccessToken, verifyAccessToken };
```

- [ ] **Step 4: `services/token.service.js`**

```javascript
const crypto = require('crypto');
const prisma = require('./prisma');

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

async function issueRefreshToken(userId) {
  const rawToken = crypto.randomBytes(40).toString('hex');
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return rawToken;
}

async function rotateRefreshToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.refreshToken.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!record) return null; // caller quyết định trả lỗi 401

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });
  const newRawToken = await issueRefreshToken(record.userId);
  return { userId: record.userId, rawToken: newRawToken };
}

async function revokeRefreshToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

module.exports = { issueRefreshToken, rotateRefreshToken, revokeRefreshToken };
```

- [ ] **Step 5: `middlewares/authenticate.js`**

```javascript
const ApiError = require('../utils/ApiError');
const { verifyAccessToken } = require('../services/jwt.service');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'UNAUTHENTICATED', 'Thiếu access token'));
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new ApiError(401, 'UNAUTHENTICATED', 'Access token không hợp lệ hoặc hết hạn'));
  }
}

module.exports = authenticate;
```

- [ ] **Step 6: `controllers/auth.controller.js`**

```javascript
const bcrypt = require('bcrypt');
const prisma = require('../services/prisma');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { signAccessToken } = require('../services/jwt.service');
const { issueRefreshToken, rotateRefreshToken, revokeRefreshToken } = require('../services/token.service');

const register = asyncHandler(async (req, res) => {
  const { email, password, fullName } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(409, 'EMAIL_TAKEN', 'Email đã được sử dụng');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName, role: 'customer' },
  });

  sendSuccess(res, { id: user.id, email: user.email, role: user.role }, null, 201);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu sai');

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu sai');

  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = await issueRefreshToken(user.id);

  sendSuccess(res, { accessToken, refreshToken, role: user.role });
});

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const rotated = await rotateRefreshToken(refreshToken);
  if (!rotated) throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token không hợp lệ');

  const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
  const accessToken = signAccessToken({ sub: user.id, role: user.role });

  sendSuccess(res, { accessToken, refreshToken: rotated.rawToken });
});

const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  await revokeRefreshToken(refreshToken);
  sendSuccess(res, { message: 'Đã đăng xuất' });
});

module.exports = { register, login, refresh, logout };
```

- [ ] **Step 7: `routes/auth.route.js`**

```javascript
const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const ctrl = require('../controllers/auth.controller');

router.post(
  '/register',
  [body('email').isEmail(), body('password').isLength({ min: 6 }), validate],
  ctrl.register
);
router.post(
  '/login',
  [body('email').isEmail(), body('password').notEmpty(), validate],
  ctrl.login
);
router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);

module.exports = router;
```

- [ ] **Step 8: Gắn vào `routes/index.js`**

```javascript
const router = require('express').Router();

router.use('/auth', require('./auth.route'));

module.exports = router;
```

- [ ] **Step 9: Verify**

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"a@test.com","password":"123456","fullName":"A"}'
# Expected: data chứa id/email/role, status 201

curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"a@test.com","password":"123456"}'
# Expected: data chứa accessToken, refreshToken
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(buoi-4): auth register/login/refresh/logout voi jwt access + refresh"
```

---

### Task 5 (Buổi 5): RBAC role thô + review tuần 1

**Files:**
- Create: `backend/middlewares/requireRole.js`, `backend/scripts/seedAdmin.js`

**Interfaces:**
- Consumes: `req.user` (từ `authenticate` middleware, Task 4).
- Produces: `requireRole(...roles)` — Buổi 6 trở đi mọi route admin-only dùng
  `[authenticate, requireRole('admin'), ...]`.

**Khái niệm cần nắm:** vì sao `requireRole` phải đứng SAU `authenticate` trong chuỗi
middleware (cần `req.user` đã được gắn); phân biệt lỗi 401 (chưa xác thực — không biết
là ai) và 403 (đã xác thực nhưng không đủ quyền) — một lỗi rất hay bị hỏi khi phỏng vấn.

- [ ] **Step 1: `middlewares/requireRole.js`**

```javascript
const ApiError = require('../utils/ApiError');

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'UNAUTHENTICATED', 'Chưa đăng nhập'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'FORBIDDEN', 'Không đủ quyền truy cập'));
    }
    next();
  };
}

module.exports = requireRole;
```

- [ ] **Step 2: `scripts/seedAdmin.js`** (script chạy tay để tạo tài khoản admin đầu
tiên — không có endpoint public nào được phép tự đăng ký role admin)

```javascript
const bcrypt = require('bcrypt');
const prisma = require('../services/prisma');

async function main() {
  const email = 'admin@miniecom.local';
  const passwordHash = await bcrypt.hash('admin123456', 10);
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, fullName: 'Admin', role: 'admin' },
  });
  console.log('Admin sẵn sàng:', admin.email);
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Verify**

```bash
node backend/scripts/seedAdmin.js
# Expected: "Admin sẵn sàng: admin@miniecom.local"
```

- [ ] **Step 4: Review tuần 1 (tự kiểm tra, không cần code thêm)**

Checklist tự chấm trước khi qua Tuần 2:
- [ ] `docker compose ps` → Postgres đang chạy.
- [ ] Đăng ký/đăng nhập qua curl trả đúng format `{data, meta, error}`.
- [ ] Gọi route không tồn tại → 404 đúng format.
- [ ] Đọc lại `prisma/schema.prisma`, giải thích được vì sao `RefreshToken` không có
  quan hệ `@relation` tới `User` trong bản hiện tại (đơn giản hoá — có thể để ý bổ
  sung sau nếu muốn cascade delete).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(buoi-5): rbac requireRole middleware + seed admin script"
```

---
# TUẦN 2 (MỚI) — BLOG & GALLERY: SCHEMA + API

### Task 6 (Buổi 6): Schema `BlogPost` + `GalleryItem` + migrate

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma Client models `BlogPost`, `GalleryItem` — Buổi 7/8 dùng qua
  `prisma.blogPost` / `prisma.galleryItem`.

**Khái niệm cần nắm:** `categoryId` trên cả `BlogPost` và `GalleryItem` trỏ lại đúng
model `Category` đã có sẵn từ Buổi 2 (không tạo bảng category riêng cho blog như tài
liệu gốc mục 4.4 làm — thống nhất 1 nguồn category cho toàn hệ thống, sau này category
"chăm sóc thú cưng" có thể vừa gắn bài blog vừa gắn sản phẩm pet food, đúng tinh thần
internal linking mục 6.5 tài liệu gốc). `content` lưu Markdown thuần (String) — không
dùng kiểu rich-text/JSON phức tạp ở đợt này.

- [ ] **Step 1: Thêm 2 model vào `prisma/schema.prisma`**

```prisma
model BlogPost {
  id             String    @id @default(uuid())
  title          String
  slug           String    @unique
  excerpt        String?
  content        String
  coverImageUrl  String?
  authorId       String
  author         User      @relation(fields: [authorId], references: [id])
  categoryId     String?
  category       Category? @relation(fields: [categoryId], references: [id])
  status         String    @default("draft")
  seoTitle       String?
  seoDescription String?
  publishedAt    DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}

model GalleryItem {
  id         String    @id @default(uuid())
  title      String?
  imageUrl   String
  altText    String
  categoryId String?
  category   Category? @relation(fields: [categoryId], references: [id])
  position   Int       @default(0)
  createdAt  DateTime  @default(now())
}
```

- [ ] **Step 2: Thêm quan hệ ngược vào model `User` đã có** (tìm `model User {` trong
file, thêm 1 dòng trước dấu `}` đóng model)

```prisma
  blogPosts BlogPost[]
```

- [ ] **Step 3: Thêm quan hệ ngược vào model `Category` đã có** (tìm `model Category {`,
thêm 2 dòng trước dấu `}` đóng model)

```prisma
  blogPosts    BlogPost[]
  galleryItems GalleryItem[]
```

- [ ] **Step 4: Migrate**

```bash
cd backend
npx prisma migrate dev --name add_blog_gallery
```

Expected: "Your database is now in sync with your schema".

- [ ] **Step 5: Verify**

```bash
npx prisma studio
```

Expected: thấy thêm 2 bảng `BlogPost`, `GalleryItem`, rỗng.

- [ ] **Step 6: Commit & push**

```bash
git add -A
git commit -m "feat(buoi-6): schema BlogPost + GalleryItem + migrate"
git push
```

---

### Task 7 (Buổi 7): Blog CRUD API (admin, auth+RBAC) + validate

**Files:**
- Create: `backend/controllers/blog.controller.js`, `backend/routes/blog.route.js`
- Modify: `backend/routes/index.js`

**Interfaces:**
- Consumes: `authenticate`, `requireRole` (Buổi 4-5), `sendSuccess`, `ApiError`,
  `asyncHandler` (Buổi 3).
- Produces: `GET/POST /api/v1/blog`, `GET /api/v1/blog/:slug`,
  `PATCH/DELETE /api/v1/blog/:id`, `GET /api/v1/blog/admin/list` — Buổi 9/11 gọi lại các
  endpoint này từ Next.js.

**Khái niệm cần nắm:** vì sao endpoint public (`GET /blog`, `GET /blog/:slug`) chỉ trả
bài `status = "published"` — khách không được thấy bài `draft` chưa hoàn thiện. Vì sao
`publishedAt` chỉ được set **một lần duy nhất** khi chuyển từ `draft` sang `published`
(không ghi đè lại mỗi lần update sau đó) — nếu không, ngày xuất bản hiển thị sẽ sai lệch
mỗi lần admin sửa lỗi chính tả trong bài.

- [ ] **Step 1: `controllers/blog.controller.js`**

```javascript
const prisma = require('../services/prisma');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { page = '1', pageSize = '10' } = req.query;
  const take = Math.min(Number(pageSize) || 10, 50);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const where = { status: 'published' };
  const [items, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      include: { category: true },
      skip,
      take,
    }),
    prisma.blogPost.count({ where }),
  ]);

  sendSuccess(res, items, { page: Number(page), pageSize: take, total });
});

const getBySlug = asyncHandler(async (req, res) => {
  const post = await prisma.blogPost.findUnique({
    where: { slug: req.params.slug },
    include: { category: true, author: { select: { id: true, fullName: true } } },
  });
  if (!post || post.status !== 'published') {
    throw new ApiError(404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết');
  }
  sendSuccess(res, post);
});

const adminList = asyncHandler(async (req, res) => {
  const posts = await prisma.blogPost.findMany({
    orderBy: { createdAt: 'desc' },
    include: { category: true },
  });
  sendSuccess(res, posts);
});

const create = asyncHandler(async (req, res) => {
  const { title, slug, excerpt, content, coverImageUrl, categoryId, seoTitle, seoDescription } = req.body;

  const post = await prisma.blogPost.create({
    data: {
      title,
      slug,
      excerpt,
      content,
      coverImageUrl,
      categoryId: categoryId || null,
      seoTitle,
      seoDescription,
      authorId: req.user.id,
      status: 'draft',
    },
  });
  sendSuccess(res, post, null, 201);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết');

  const data = { ...req.body };
  // publishedAt chỉ set 1 lần, đúng lúc chuyển draft -> published
  if (data.status === 'published' && existing.status !== 'published') {
    data.publishedAt = new Date();
  }

  const post = await prisma.blogPost.update({ where: { id }, data });
  sendSuccess(res, post);
});

const remove = asyncHandler(async (req, res) => {
  await prisma.blogPost.delete({ where: { id: req.params.id } });
  sendSuccess(res, { message: 'Đã xoá bài viết' });
});

module.exports = { list, getBySlug, adminList, create, update, remove };
```

- [ ] **Step 2: `routes/blog.route.js`**

```javascript
const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const authenticate = require('../middlewares/authenticate');
const requireRole = require('../middlewares/requireRole');
const ctrl = require('../controllers/blog.controller');

router.get('/', ctrl.list);
router.get('/admin/list', authenticate, requireRole('admin'), ctrl.adminList);
router.get('/:slug', ctrl.getBySlug);

router.post(
  '/',
  authenticate,
  requireRole('admin'),
  [body('title').notEmpty(), body('slug').notEmpty(), body('content').notEmpty(), validate],
  ctrl.create
);
router.patch('/:id', authenticate, requireRole('admin'), ctrl.update);
router.delete('/:id', authenticate, requireRole('admin'), ctrl.remove);

module.exports = router;
```

> Lưu ý thứ tự route: `/admin/list` phải khai báo TRƯỚC `/:slug`, nếu không Express sẽ
> khớp `/admin/list` vào route `/:slug` (coi "admin" là giá trị `slug`) vì route được
> match theo thứ tự khai báo từ trên xuống.

- [ ] **Step 3: Gắn vào `routes/index.js`**

```javascript
router.use('/blog', require('./blog.route'));
```

- [ ] **Step 4: Verify**

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@miniecom.local","password":"admin123456"}' | jq -r '.data.accessToken')

curl -s -X POST http://localhost:4000/api/v1/blog \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Cách chọn hạt cho chó theo độ tuổi","slug":"cach-chon-hat-cho-cho-theo-do-tuoi","content":"## Giới thiệu\nNội dung..."}'
# Expected: 201, status "draft"

curl -s http://localhost:4000/api/v1/blog
# Expected: [] rỗng — vì bài vừa tạo còn "draft", chưa "published"

curl -s -X PATCH http://localhost:4000/api/v1/blog/<id> \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"published"}'
curl -s http://localhost:4000/api/v1/blog
# Expected: thấy bài viết, có publishedAt
```

- [ ] **Step 5: Commit & push**

```bash
git add -A
git commit -m "feat(buoi-7): blog crud api voi auth+rbac"
git push
```

---

### Task 8 (Buổi 8): Upload ảnh chung + Gallery CRUD API

**Files:**
- Create: `backend/middlewares/upload.js`, `backend/controllers/upload.controller.js`,
  `backend/routes/upload.route.js`, `backend/controllers/gallery.controller.js`,
  `backend/routes/gallery.route.js`
- Modify: `backend/app.js` (serve static `/uploads`), `backend/routes/index.js`

**Interfaces:**
- Produces: `POST /api/v1/uploads/image` (admin, multipart, field `image`) → trả
  `{ url }`; `GET/POST/DELETE /api/v1/gallery` — Buổi 11 (form admin) gọi 2 endpoint này
  theo thứ tự: upload ảnh trước lấy `url`, rồi mới `POST /gallery` với `url` đó.

**Khái niệm cần nắm:** tách riêng "upload file" (`POST /uploads/image`) khỏi "tạo resource"
(`POST /gallery`, và sau này `POST /blog` cũng dùng lại endpoint upload này cho
`coverImageUrl`) — giúp admin UI có thể cho xem trước ảnh đã upload trước khi bấm submit
form, không phải submit cả file lẫn dữ liệu cùng lúc. `multer` xử lý `multipart/form-data`
(khác `express.json()` chỉ đọc JSON) — `fileFilter`/`limits` chặn file sai định dạng/quá
lớn NGAY tại middleware (tài liệu gốc mục 9.3).

- [ ] **Step 1: Cài `multer`**

```bash
npm install multer
```

- [ ] **Step 2: `middlewares/upload.js`**

```javascript
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = crypto.randomBytes(16).toString('hex'); // không giữ tên gốc từ client
    cb(null, `${safeName}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new ApiError(422, 'INVALID_FILE_TYPE', 'Chỉ chấp nhận jpeg/png/webp'));
    }
    cb(null, true);
  },
});

module.exports = upload;
```

- [ ] **Step 3: Tạo thư mục lưu file & serve static**

```bash
mkdir -p backend/public/uploads
touch backend/public/uploads/.gitkeep
```

Thêm vào `app.js` (cạnh các `app.use` khác, cần `const path = require('path');` ở đầu
file nếu chưa có):
```javascript
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
```

- [ ] **Step 4: `controllers/upload.controller.js`**

```javascript
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(422, 'FILE_REQUIRED', 'Thiếu file ảnh');
  sendSuccess(res, { url: `/uploads/${req.file.filename}` }, null, 201);
});

module.exports = { uploadImage };
```

- [ ] **Step 5: `routes/upload.route.js`**

```javascript
const router = require('express').Router();
const authenticate = require('../middlewares/authenticate');
const requireRole = require('../middlewares/requireRole');
const upload = require('../middlewares/upload');
const ctrl = require('../controllers/upload.controller');

router.post('/image', authenticate, requireRole('admin'), upload.single('image'), ctrl.uploadImage);

module.exports = router;
```

- [ ] **Step 6: `controllers/gallery.controller.js`**

```javascript
const prisma = require('../services/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const { categorySlug } = req.query;
  const where = {};
  if (categorySlug) {
    const category = await prisma.category.findUnique({ where: { slug: categorySlug } });
    if (category) where.categoryId = category.id;
  }

  const items = await prisma.galleryItem.findMany({
    where,
    orderBy: { position: 'asc' },
    include: { category: true },
  });
  sendSuccess(res, items);
});

const create = asyncHandler(async (req, res) => {
  const { title, imageUrl, altText, categoryId, position } = req.body;
  const item = await prisma.galleryItem.create({
    data: { title, imageUrl, altText, categoryId: categoryId || null, position: position ?? 0 },
  });
  sendSuccess(res, item, null, 201);
});

const remove = asyncHandler(async (req, res) => {
  await prisma.galleryItem.delete({ where: { id: req.params.id } });
  sendSuccess(res, { message: 'Đã xoá ảnh' });
});

module.exports = { list, create, remove };
```

- [ ] **Step 7: `routes/gallery.route.js`**

```javascript
const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const authenticate = require('../middlewares/authenticate');
const requireRole = require('../middlewares/requireRole');
const ctrl = require('../controllers/gallery.controller');

router.get('/', ctrl.list);
router.post(
  '/',
  authenticate,
  requireRole('admin'),
  [body('imageUrl').notEmpty(), body('altText').notEmpty(), validate],
  ctrl.create
);
router.delete('/:id', authenticate, requireRole('admin'), ctrl.remove);

module.exports = router;
```

- [ ] **Step 8: Gắn vào `routes/index.js`**

```javascript
router.use('/uploads', require('./upload.route'));
router.use('/gallery', require('./gallery.route'));
```

- [ ] **Step 9: Verify**

```bash
curl -s -X POST http://localhost:4000/api/v1/uploads/image \
  -H "Authorization: Bearer $TOKEN" -F "image=@/duong/dan/anh.jpg"
# Expected: 201, { "url": "/uploads/<random-hex>.jpg" }

curl -s -X POST http://localhost:4000/api/v1/gallery \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Ảnh minh hoạ","imageUrl":"/uploads/<random-hex>.jpg","altText":"Chó Golden Retriever đang ăn hạt"}'
# Expected: 201
```

- [ ] **Step 10: Commit & push**

```bash
echo "public/uploads/*" >> .gitignore
echo "!public/uploads/.gitkeep" >> .gitignore
git add -A
git commit -m "feat(buoi-8): upload anh chung + gallery crud api"
git push
```

---

# TUẦN 3 (MỚI) — STOREFRONT PUBLIC + ADMIN

### Task 9 (Buổi 9): Next.js setup + trang blog public (list/detail) + SEO động + responsive

**Files:**
- Create: `frontend/package.json`, `frontend/next.config.js`,
  `frontend/lib/apiClient.js`, `frontend/lib/markdown.js`, `frontend/app/layout.js`,
  `frontend/app/blog/page.js`, `frontend/app/blog/[slug]/page.js`

**Interfaces:**
- Consumes: `GET /api/v1/blog`, `GET /api/v1/blog/:slug` (Task 7).
- Produces: `apiFetch(path, options)` (fetch gốc, KHÔNG dùng axios — xem cập nhật
  2026-09-11: axios không tham gia được cơ chế cache `next: { revalidate, tags }` của
  Next.js vì không chạy qua hàm `fetch` đã được Next.js "độ" lại), `renderMarkdown(content)`
  — Task 10/11 dùng lại `apiFetch`, KHÔNG dùng axios kể cả cho upload multipart
  (`fetch(url, { method: 'POST', body: formData, headers: {...} })` thay
  `axios.post(url, formData, {...})`).

**Khái niệm cần nắm:** Server Component (mặc định App Router) fetch dữ liệu trực tiếp
trong `async function Page()` chạy trên server — quan trọng cho SEO vì HTML đã có sẵn nội
dung khi Google crawl, không phải đợi JS chạy xong như CSR thuần. `generateMetadata` chạy
song song, cũng trên server, set `<title>`/`<meta>` động theo từng bài viết — đây là phần
kỹ thuật quan trọng nhất của cả đợt học này.

- [ ] **Step 1: Khởi tạo Next.js**

```bash
npx create-next-app@latest frontend --js --app --no-tailwind --no-src-dir --eslint
cd frontend
npm install axios marked isomorphic-dompurify
```

- [ ] **Step 2: `.env.local`**

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_BACKEND_ORIGIN=http://localhost:4000
```

- [ ] **Step 3: `next.config.js`** — cho phép `next/image` load ảnh từ backend
(bắt buộc, nếu không next/image sẽ báo lỗi "hostname not configured")

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '4000', pathname: '/uploads/**' },
    ],
  },
};

module.exports = nextConfig;
```

- [ ] **Step 4: `lib/apiClient.js`**

```javascript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

export default apiClient;
```

- [ ] **Step 5: `lib/markdown.js`** — render + sanitize (chống XSS, xem Global Constraints)

```javascript
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

export function renderMarkdown(content) {
  const rawHtml = marked.parse(content || '');
  return DOMPurify.sanitize(rawHtml);
}
```

- [ ] **Step 6: `app/layout.js`** — layout responsive tối thiểu (mobile-first)

```javascript
import './globals.css';

export const metadata = {
  title: { default: 'Miniecom Blog', template: '%s | Miniecom Blog' },
  description: 'Chia sẻ kiến thức chăm sóc thú cưng, làm đẹp và đồ gia dụng.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>
        <nav style={{ padding: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <a href="/blog">Blog</a>
          <a href="/gallery">Gallery</a>
        </nav>
        <main style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>{children}</main>
      </body>
    </html>
  );
}
```

`maxWidth` + `margin: 0 auto` co giãn tự nhiên trên mobile (không có unit cố định lớn hơn
viewport) — đủ responsive cơ bản cho nội dung dạng bài viết, chưa cần framework CSS riêng.

- [ ] **Step 7: `app/blog/page.js`**

```javascript
import Link from 'next/link';
import Image from 'next/image';
import apiClient from '../../lib/apiClient';

export const metadata = { title: 'Blog' };

export default async function BlogListPage() {
  const { data } = await apiClient.get('/blog');
  const posts = data.data;

  return (
    <div>
      <h1>Blog</h1>
      <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {posts.map((post) => (
          <article key={post.id}>
            {post.coverImageUrl && (
              <Image
                src={`${process.env.NEXT_PUBLIC_BACKEND_ORIGIN}${post.coverImageUrl}`}
                alt={post.title}
                width={400}
                height={250}
                style={{ width: '100%', height: 'auto' }}
              />
            )}
            <h2><Link href={`/blog/${post.slug}`}>{post.title}</Link></h2>
            <p>{post.excerpt}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
```

`gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))'` tự động co giãn số cột
theo bề rộng màn hình — đây chính là kỹ thuật responsive grid không cần media query.

- [ ] **Step 8: `app/blog/[slug]/page.js`** — SEO metadata động + JSON-LD

```javascript
import apiClient from '../../../lib/apiClient';
import { renderMarkdown } from '../../../lib/markdown';

export async function generateMetadata({ params }) {
  const { data } = await apiClient.get(`/blog/${params.slug}`);
  const post = data.data;
  return {
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt,
    openGraph: {
      title: post.seoTitle || post.title,
      description: post.seoDescription || post.excerpt,
      images: post.coverImageUrl ? [`${process.env.NEXT_PUBLIC_BACKEND_ORIGIN}${post.coverImageUrl}`] : [],
      type: 'article',
    },
  };
}

export default async function BlogDetailPage({ params }) {
  const { data } = await apiClient.get(`/blog/${params.slug}`);
  const post = data.data;
  const html = renderMarkdown(post.content);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { '@type': 'Person', name: post.author?.fullName || 'Miniecom' },
  };

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
```

- [ ] **Step 9: Verify**

```bash
npm run dev   # frontend tại http://localhost:3000, backend (Buổi 1-8) chạy song song ở 4000
# Mở http://localhost:3000/blog -> thấy bài đã publish ở Buổi 7
# Mở DevTools > Toggle device toolbar > chọn iPhone SE (375px) -> layout không vỡ, grid co về 1 cột
# View Page Source (Cmd+U) -> xác nhận thấy sẵn nội dung bài viết trong HTML (không rỗng chờ JS)
```

- [ ] **Step 10: Commit & push**

```bash
cd frontend
git add -A
git commit -m "feat(buoi-9): setup nextjs, trang blog public + seo metadata + responsive"
git push
```

---

### Task 10 (Buổi 10): Trang gallery public (responsive) + `/admin` login + danh sách bài viết

**Files:**
- Create: `frontend/app/gallery/page.js`, `frontend/lib/adminAuth.js`,
  `frontend/app/admin/login/page.js`, `frontend/app/admin/posts/page.js`

**Interfaces:**
- Consumes: `GET /api/v1/gallery`, `POST /api/v1/auth/login`,
  `GET /api/v1/blog/admin/list` (Task 7, 8).
- Produces: `getToken()`, `setTokens(access, refresh)`, `clearTokens()`,
  `authFetch(path, options)` (adminAuth.js) — Task 11 dùng lại để gọi API có xác thực.

**Khái niệm cần nắm:** token JWT lưu ở `localStorage` chỉ đọc/ghi được ở Client Component
(`'use client'`) — khác các trang public ở Buổi 9 vốn là Server Component. Trang
`/admin/*` vì vậy phải là Client Component ngay từ đầu, tự fetch dữ liệu bằng
`useEffect`/state thay vì `async function Page()`.

- [ ] **Step 1: `app/gallery/page.js`**

```javascript
import Image from 'next/image';
import apiClient from '../../lib/apiClient';

export const metadata = { title: 'Gallery' };

export default async function GalleryPage() {
  const { data } = await apiClient.get('/gallery');
  const items = data.data;

  return (
    <div>
      <h1>Gallery</h1>
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {items.map((item) => (
          <Image
            key={item.id}
            src={`${process.env.NEXT_PUBLIC_BACKEND_ORIGIN}${item.imageUrl}`}
            alt={item.altText}
            width={300}
            height={300}
            style={{ width: '100%', height: 'auto', objectFit: 'cover' }}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `lib/adminAuth.js`**

```javascript
'use client';

const ACCESS_KEY = 'miniecom_access_token';
const REFRESH_KEY = 'miniecom_refresh_token';

export function setTokens(accessToken, refreshToken) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export async function authFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  return res.json();
}
```

- [ ] **Step 3: `app/admin/login/page.js`**

```javascript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '../../../lib/apiClient';
import { setTokens } from '../../../lib/adminAuth';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      const { data } = await apiClient.post('/auth/login', { email, password });
      setTokens(data.data.accessToken, data.data.refreshToken);
      router.push('/admin/posts');
    } catch {
      setError('Email hoặc mật khẩu sai');
    }
  }

  return (
    <div style={{ maxWidth: '360px', margin: '2rem auto' }}>
      <h1>Đăng nhập Admin</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" required placeholder="Mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit">Đăng nhập</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: `app/admin/posts/page.js`**

```javascript
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, getToken } from '../../../lib/adminAuth';

export default function AdminPostsPage() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = '/admin/login';
      return;
    }
    authFetch('/blog/admin/list').then((res) => setPosts(res.data || []));
  }, []);

  return (
    <div>
      <h1>Bài viết</h1>
      <Link href="/admin/posts/new">+ Viết bài mới</Link>
      <ul>
        {posts.map((post) => (
          <li key={post.id}>{post.title} — <em>{post.status}</em></li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Verify**

```bash
# Mở http://localhost:3000/gallery -> thấy ảnh đã tạo ở Buổi 8, kiểm tra alt qua Inspect Element
# Mở http://localhost:3000/admin/login -> đăng nhập bằng admin@miniecom.local -> chuyển sang
#   /admin/posts, thấy danh sách bài (kể cả draft)
# Thử mở /admin/posts trực tiếp khi chưa đăng nhập (xoá localStorage trước) -> tự redirect về /admin/login
```

- [ ] **Step 6: Commit & push**

```bash
git add -A
git commit -m "feat(buoi-10): trang gallery public + admin login + danh sach bai viet"
git push
```

---

### Task 11 (Buổi 11): Form tạo/sửa bài viết + upload ảnh gallery trong `/admin`

**Files:**
- Create: `frontend/app/admin/posts/new/page.js`, `frontend/app/admin/gallery/new/page.js`

**Interfaces:**
- Consumes: `authFetch` (Task 10), `POST /api/v1/uploads/image`, `POST /api/v1/blog`,
  `POST /api/v1/gallery` (Task 7, 8).

**Khái niệm cần nắm:** upload file qua `fetch` phải gửi `FormData`, KHÔNG set header
`Content-Type` thủ công (trình duyệt tự set kèm `boundary` — set tay sẽ làm hỏng request
multipart). Vì vậy form upload ảnh gọi trực tiếp bằng `fetch` riêng (chỉ set header
`Authorization`), không tái dùng `authFetch` (vốn tự set `Content-Type: application/json`,
không phù hợp `FormData`). Không dùng axios (đã bỏ từ Buổi 9 — xem cập nhật 2026-09-11).

- [ ] **Step 1: `app/admin/posts/new/page.js`**

```javascript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch, getToken } from '../../../../lib/adminAuth';

async function uploadImage(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/uploads/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  });
  const json = await res.json();
  return json.data.url;
}

export default function NewPostPage() {
  const router = useRouter();
  const [form, setForm] = useState({ title: '', slug: '', excerpt: '', content: '', coverImageUrl: '' });
  const [submitting, setSubmitting] = useState(false);

  async function handleCoverUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const url = await uploadImage(file);
    setForm((f) => ({ ...f, coverImageUrl: url }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    await authFetch('/blog', { method: 'POST', body: JSON.stringify(form) });
    setSubmitting(false);
    router.push('/admin/posts');
  }

  return (
    <div style={{ maxWidth: '600px' }}>
      <h1>Viết bài mới</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <input required placeholder="Tiêu đề" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input required placeholder="Slug (vd: cach-chon-hat-cho-cho)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
        <input placeholder="Tóm tắt" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
        <input type="file" accept="image/*" onChange={handleCoverUpload} />
        {form.coverImageUrl && <img src={`${process.env.NEXT_PUBLIC_BACKEND_ORIGIN}${form.coverImageUrl}`} alt="preview" style={{ maxWidth: '200px' }} />}
        <textarea required rows={12} placeholder="Nội dung (Markdown)" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        <button type="submit" disabled={submitting}>{submitting ? 'Đang lưu...' : 'Lưu nháp'}</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: `app/admin/gallery/new/page.js`**

```javascript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch, getToken } from '../../../../lib/adminAuth';

export default function NewGalleryItemPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [altText, setAltText] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/uploads/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });
    const json = await res.json();
    setImageUrl(json.data.url);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await authFetch('/gallery', { method: 'POST', body: JSON.stringify({ title, altText, imageUrl }) });
    router.push('/gallery');
  }

  return (
    <div style={{ maxWidth: '400px' }}>
      <h1>Thêm ảnh Gallery</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <input type="file" accept="image/*" required onChange={handleUpload} />
        <input placeholder="Tiêu đề (tuỳ chọn)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input required placeholder="Mô tả ảnh (alt text — bắt buộc cho SEO)" value={altText} onChange={(e) => setAltText(e.target.value)} />
        <button type="submit" disabled={!imageUrl}>Lưu</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Verify — chạy full luồng đăng bài**

```
1. /admin/login -> đăng nhập
2. /admin/posts -> "+ Viết bài mới"
3. Điền tiêu đề, slug, upload ảnh cover (xem preview hiện ra), viết nội dung Markdown -> Lưu nháp
4. Quay lại /admin/posts -> thấy bài mới với status "draft"
5. (Chưa có nút publish trên UI — dùng lại curl PATCH như Buổi 7 để publish, hoặc để dành
   thêm nút "Publish" nếu còn thời gian, không bắt buộc trong phạm vi buổi này)
6. /admin/gallery/new -> upload ảnh, nhập alt text bắt buộc -> Lưu -> quay lại /gallery thấy ảnh mới
```

- [ ] **Step 4: Commit & push**

```bash
git add -A
git commit -m "feat(buoi-11): form dang bai + upload anh gallery trong admin"
git push
```

---

# TUẦN 4 (MỚI) — SEO, DEPLOY & TỔNG KẾT

### Task 12 (Buổi 12): `sitemap.xml` + `robots.txt` + structured data + review SEO/mobile

**Files:**
- Create: `frontend/app/sitemap.js`, `frontend/public/robots.txt`

**Interfaces:**
- Consumes: `GET /api/v1/blog` (Task 7).

**Khái niệm cần nắm:** Next.js App Router có quy ước đặc biệt `app/sitemap.js` — export
1 hàm mặc định trả về mảng `{ url, lastModified }`, Next.js tự build ra `/sitemap.xml`
đúng chuẩn, không cần viết XML tay. `robots.txt` chỉ cần đặt trong `public/` — Next.js tự
serve tại `/robots.txt`.

- [ ] **Step 1: `app/sitemap.js`**

```javascript
import apiClient from '../lib/apiClient';

export default async function sitemap() {
  const { data } = await apiClient.get('/blog', { params: { pageSize: 50 } });
  const posts = data.data;

  const staticUrls = [
    { url: 'https://miniecom-blog.vercel.app/', lastModified: new Date() },
    { url: 'https://miniecom-blog.vercel.app/blog', lastModified: new Date() },
    { url: 'https://miniecom-blog.vercel.app/gallery', lastModified: new Date() },
  ];

  const postUrls = posts.map((post) => ({
    url: `https://miniecom-blog.vercel.app/blog/${post.slug}`,
    lastModified: post.updatedAt,
  }));

  return [...staticUrls, ...postUrls];
}
```

> Thay `https://miniecom-blog.vercel.app` bằng domain thật sau khi deploy xong ở Task 14
> — Vercel cho biết domain chính xác lúc đó.

- [ ] **Step 2: `public/robots.txt`**

```
User-agent: *
Allow: /
Disallow: /admin

Sitemap: https://miniecom-blog.vercel.app/sitemap.xml
```

- [ ] **Step 3: Review checklist SEO + mobile (tự kiểm, không cần code thêm)**

- [ ] Mọi trang blog/gallery có `<title>` và `<meta description>` khác nhau (không trùng
  lặp) — kiểm bằng View Page Source.
- [ ] Mọi ảnh gallery có `alt` không rỗng.
- [ ] Mỗi trang chỉ có đúng 1 thẻ `<h1>`.
- [ ] Chrome DevTools > Lighthouse > chạy report ở chế độ Mobile cho trang `/blog/<slug>`
  — ghi lại điểm Performance/SEO, không cần đạt 100 nhưng không được có lỗi đỏ nghiêm
  trọng (missing alt, viewport meta thiếu...).
- [ ] Thu nhỏ trình duyệt xuống 375px, kiểm tra `/blog`, `/blog/<slug>`, `/gallery` không
  có thanh cuộn ngang (horizontal scroll) — dấu hiệu rõ nhất của lỗi responsive.

- [ ] **Step 4: Commit & push**

```bash
git add -A
git commit -m "feat(buoi-12): sitemap.xml + robots.txt + review seo/mobile"
git push
```

---

### Task 13 (Buổi 13): Tách `frontend/` thành `frontend-petshop/` + `frontend-gomsu/` — ĐÃ XONG

> **Cập nhật 2026-09-12** — xem
> `docs/superpowers/specs/2026-09-12-business-split-white-label-design.md`. Buổi 13-14 cũ
> (deploy generic lên Render/Vercel) đã HOÃN, thay bằng lộ trình "tách business" dưới đây.
> Dự án giờ phục vụ 2 business (Gốm sứ trang trí & Petshop) qua white-label clone — 1 repo,
> `backend/` dùng chung, 2 thư mục frontend riêng.

**Files:**
- `git mv frontend frontend-petshop`, copy sang `frontend-gomsu/` (loại trừ
  `node_modules`/`.next`), `npm install` lại cho `frontend-gomsu`.
- Sửa `package.json` mỗi bên: `"name"` riêng, `frontend-gomsu` chạy `next dev -p 3001`
  (tránh đụng port 3000 của `frontend-petshop`).

**Đã hoàn thành và verify**: cả 2 chạy song song đúng (petshop :3000, gomsu :3001), cùng
gọi vào 1 backend chung (:4000). Database local vẫn dùng chung (dữ liệu test), sẽ tách
2 database riêng thật khi tới lúc deploy từng business (xem spec).

---

### Task 14 (Buổi 14): Theme Tailwind cho `frontend-gomsu/` (Gốm sứ trang trí)

**Files:**
- Modify: `frontend-gomsu/tailwind.config.*` (hoặc `app/globals.css` nếu Tailwind v4 dùng
  `@theme`), `frontend-gomsu/app/layout.js`.

**Khái niệm cần nắm:** Tailwind v4 cấu hình theme trực tiếp trong CSS qua `@theme` block
(khác v3 dùng file `tailwind.config.js` riêng) — kiểm tra `frontend-gomsu/app/globals.css`
xem đang ở bản nào trước khi sửa (dự án đang dùng Tailwind v4, xem `package.json`).

- [ ] Chọn font Serif phù hợp ngành gốm sứ (vd Playfair Display, Cormorant) qua
  `next/font/google`.
- [ ] Đổi bảng màu: tông đất nung/be/pastel trầm thay vì màu mặc định (đen/trắng/xám hiện
  tại) — cập nhật biến `--color-background`/`--color-foreground` hoặc thêm biến màu mới
  trong `@theme`.
- [ ] Cập nhật `app/layout.js`: đổi `title`/`description` mặc định cho đúng thương hiệu
  Gốm sứ, áp dụng font mới vào `<body>`.
- [ ] Verify bằng mắt: `npm run dev` (port 3001), so sánh cảm giác trực quan với
  `frontend-petshop` (port 3000) — phải rõ ràng khác biệt phong cách.

*(Nội dung code mẫu chi tiết sẽ đưa trực tiếp khi bắt đầu buổi này trong hội thoại — màu/
font cụ thể phụ thuộc gu thẩm mỹ thật của thương hiệu Gốm sứ, cần thảo luận với người học
trước khi chốt giá trị hex/font cụ thể.)*

---

### Task 15 (Buổi 15): Nội dung blog/gallery thật cho Gốm sứ

**Files:**
- Xoá/thay dữ liệu test hiện có (`hạt cho chó...`) bằng category + bài viết + ảnh gallery
  thật cho ngành gốm sứ trang trí.

- [ ] Tạo `Category` mới phù hợp (vd "Bình gốm trang trí", "Chén đĩa thủ công"), có thể
  kèm `CategoryAttribute` riêng nếu cần (vd "chất liệu", "kích thước", "kỹ thuật nung").
- [ ] Viết ít nhất 1-2 bài blog thật (nội dung SEO thật, không phải placeholder) qua
  `/admin/posts/new` trên `frontend-gomsu`.
- [ ] Upload ảnh gallery thật qua `/admin/gallery/new`, `altText` mô tả đúng sản phẩm
  (quan trọng cho Google Image Search — tài liệu gốc mục 6.5).
- [ ] Xoá bài/ảnh test cũ không còn phù hợp (qua Postman/curl như đã quen từ Buổi 7-8).

---

### Task 16 (Buổi 16): Deploy `frontend-gomsu/` + backend riêng lên domain thật

**Files:** Không đổi so với nội dung Buổi 13-14 cũ (deploy backend lên Render, deploy
frontend lên Vercel) — chỉ khác: áp dụng cụ thể cho `frontend-gomsu/` (Root Directory khi
tạo project trên Vercel = `frontend-gomsu`, không phải `frontend`), và 1 database Render
riêng dành cho Gốm sứ (theo đúng Kịch bản 1 — không share DB với Petshop khi lên production).

- [ ] Tạo Postgres mới trên Render (dành riêng Gốm sứ).
- [ ] Tạo Web Service backend trên Render, Root Directory `backend`, seed category/blog/
  gallery Gốm sứ thật lên DB production (lặp lại Task 15 trên DB mới, không migrate dữ
  liệu test từ local).
- [ ] Deploy `frontend-gomsu/` lên Vercel, Root Directory `frontend-gomsu`, env trỏ đúng
  backend Render vừa tạo.
- [ ] Cập nhật `SITE_URL` trong `frontend-gomsu/app/sitemap.js` và domain trong
  `public/robots.txt` thành domain thật.
- [ ] Verify end-to-end trên domain thật (giống cách đã verify ở Buổi 9-12, đổi
  `localhost:3000` thành domain Vercel).

---

### Task 17 (Buổi 17): Tổng kết Giai đoạn 1 (Blog & Gallery x2 business)

**Files:** `README.md` (root), log tổng kết.

- [ ] Cập nhật `README.md` root: mô tả cấu trúc 2 frontend + 1 backend dùng chung, link
  domain thật của Gốm sứ (Petshop tạm chưa deploy).
- [ ] Quiz tổng hợp: vì sao chọn white-label clone thay vì multi-tenant SaaS cho trường hợp
  2 business cố định; đánh đổi giữa 2 mô hình là gì.
- [ ] Xác nhận sẵn sàng chuyển sang **Giai đoạn 2** (ecommerce core, archive bên dưới) —
  khi bắt đầu, áp dụng chiến lược "Base Template tối giản → freeze → port logic sang cả
  `frontend-petshop` lẫn `frontend-gomsu`" thay vì viết cart/checkout riêng cho từng bên.

---
# GIAI ĐOẠN 2 (ARCHIVE) — LÕI ECOMMERCE, LÀM SAU KHI XONG BLOG & GALLERY + DEPLOY

> **Quan trọng:** nội dung bên dưới là bản gốc của plan trước khi đổi hướng (xem
> `docs/superpowers/specs/2026-08-22-blog-gallery-deploy-reorder-design.md`). Numbering
> "Task 6 (Buổi 6)" ... "Task 20 (Buổi 20)" bên dưới **không phải buổi tiếp theo ngay** —
> đây là buổi sẽ làm SAU khi hoàn thành xong Buổi 6-15 (Blog & Gallery + Deploy) ở phần
> trên. Nội dung giữ nguyên 100% không chỉnh sửa gì so với bản gốc, chỉ dời vị trí trong
> file. Khi bắt đầu Giai đoạn 2, đổi số buổi thực tế sẽ tiếp nối từ Buổi 16 trở đi (không
> phải Buổi 6) — chỉ cần đọc đúng nội dung Task bên dưới theo thứ tự, bỏ qua số cũ.

# TUẦN 2 — CATALOG

### Task 6 (Buổi 6): Category CRUD + category_attributes CRUD

**Files:**
- Create: `backend/controllers/category.controller.js`, `backend/routes/category.route.js`
- Modify: `backend/routes/index.js`

**Interfaces:**
- Produces: `GET/POST /api/v1/categories`, `PATCH/DELETE /api/v1/categories/:id`,
  `POST /api/v1/categories/:id/attributes` — Buổi 7 dùng
  `category.attributes` (quan hệ Prisma `include`) để validate product.

**Khái niệm cần nắm:** vì sao endpoint đọc (`GET`) để public, endpoint ghi bắt buộc
`authenticate + requireRole('admin')` — nguyên tắc "role của User đến từ token đã ký,
không bao giờ tin `req.body.role` gửi lên từ client".

- [ ] **Step 1: `controllers/category.controller.js`**

```javascript
const prisma = require('../services/prisma');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const categories = await prisma.category.findMany({ include: { attributes: true } });
  sendSuccess(res, categories);
});

const create = asyncHandler(async (req, res) => {
  const { name, slug, description } = req.body;
  const category = await prisma.category.create({ data: { name, slug, description } });
  sendSuccess(res, category, null, 201);
});

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const found = await prisma.category.findUnique({ where: { id } });
  if (!found) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục');

  const category = await prisma.category.update({ where: { id }, data: req.body });
  sendSuccess(res, category);
});

const remove = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await prisma.category.delete({ where: { id } });
  sendSuccess(res, { message: 'Đã xoá danh mục' });
});

const addAttribute = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { attributeKey, attributeLabel, attributeType, isRequired, isFilterable, options } = req.body;

  const attribute = await prisma.categoryAttribute.create({
    data: {
      categoryId: id,
      attributeKey,
      attributeLabel,
      attributeType,
      isRequired: !!isRequired,
      isFilterable: isFilterable !== false,
      options,
    },
  });
  sendSuccess(res, attribute, null, 201);
});

module.exports = { list, create, update, remove, addAttribute };
```

- [ ] **Step 2: `routes/category.route.js`**

```javascript
const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const authenticate = require('../middlewares/authenticate');
const requireRole = require('../middlewares/requireRole');
const ctrl = require('../controllers/category.controller');

router.get('/', ctrl.list);

router.post(
  '/',
  authenticate,
  requireRole('admin'),
  [body('name').notEmpty(), body('slug').notEmpty(), validate],
  ctrl.create
);

router.patch('/:id', authenticate, requireRole('admin'), ctrl.update);
router.delete('/:id', authenticate, requireRole('admin'), ctrl.remove);

router.post(
  '/:id/attributes',
  authenticate,
  requireRole('admin'),
  [
    body('attributeKey').notEmpty(),
    body('attributeLabel').notEmpty(),
    body('attributeType').isIn(['text', 'number', 'boolean', 'select']),
    validate,
  ],
  ctrl.addAttribute
);

module.exports = router;
```

- [ ] **Step 3: Gắn vào `routes/index.js`**

```javascript
router.use('/categories', require('./category.route'));
```

- [ ] **Step 4: Verify**

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@miniecom.local","password":"admin123456"}' | jq -r '.data.accessToken')

curl -s -X POST http://localhost:4000/api/v1/categories \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Pet Food","slug":"pet-food"}'
# Expected: 201, trả về category vừa tạo

curl -s -X POST http://localhost:4000/api/v1/categories/<id>/attributes \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"attributeKey":"weight","attributeLabel":"Trọng lượng","attributeType":"select","isRequired":true,"options":["1kg","3kg","5kg"]}'
# Expected: 201
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(buoi-6): category crud + category_attributes crud"
```

---

### Task 7 (Buổi 7): Product CRUD + validate JSONB attributes theo category_attributes

**Files:**
- Create: `backend/services/attributeValidator.js`, `backend/controllers/product.controller.js`,
  `backend/routes/product.route.js`, `backend/tests/attributeValidator.test.js`
- Modify: `backend/routes/index.js`

**Interfaces:**
- Consumes: `prisma.categoryAttribute` (Task 6).
- Produces: `validateAttributes(categoryAttributes, input) -> sanitizedAttributes`
  (throws `ApiError(422, 'INVALID_ATTRIBUTES', ...)`) — Task 8 (variants) dùng lại logic
  tương tự cho `variantAttributes`.

**Khái niệm cần nắm:** đây là phần quan trọng nhất của mục 4.1 tài liệu gốc — JSONB
linh hoạt nhưng KHÔNG tự bảo vệ khỏi dữ liệu sai (`{"weight":"3kg"}` vs `{"weigth":"3kg"}`
đều là JSON hợp lệ). Backend BẮT BUỘC tự validate theo định nghĩa `category_attributes`
trước khi lưu — không được coi JSONB là "schema-free".

- [ ] **Step 1: Cài Jest**

```bash
npm install --save-dev jest
```

Thêm vào `package.json`:
```json
"scripts": {
  "test": "jest"
}
```

- [ ] **Step 2: Viết test trước — `tests/attributeValidator.test.js`**

```javascript
const { validateAttributes } = require('../services/attributeValidator');

const categoryAttributes = [
  { attributeKey: 'weight', attributeType: 'select', isRequired: true, options: ['1kg', '3kg'] },
  { attributeKey: 'petAge', attributeType: 'text', isRequired: false, options: null },
];

test('bao loi khi thieu attribute bat buoc', () => {
  expect(() => validateAttributes(categoryAttributes, {})).toThrow();
});

test('bao loi khi gia tri select khong nam trong options', () => {
  expect(() =>
    validateAttributes(categoryAttributes, { weight: '10kg' })
  ).toThrow();
});

test('loai bo key khong nam trong dinh nghia (chong loi chinh ta)', () => {
  const result = validateAttributes(categoryAttributes, { weight: '3kg', weigth: '3kg' });
  expect(result).toEqual({ weight: '3kg' });
});

test('tra ve object da sanitize khi hop le', () => {
  const result = validateAttributes(categoryAttributes, { weight: '1kg', petAge: 'adult' });
  expect(result).toEqual({ weight: '1kg', petAge: 'adult' });
});
```

- [ ] **Step 3: Chạy test, xác nhận FAIL**

```bash
npx jest tests/attributeValidator.test.js
# Expected: FAIL — Cannot find module '../services/attributeValidator'
```

- [ ] **Step 4: `services/attributeValidator.js`**

```javascript
const ApiError = require('../utils/ApiError');

function validateAttributes(categoryAttributes, input = {}) {
  const sanitized = {};

  for (const def of categoryAttributes) {
    const value = input[def.attributeKey];

    if (value === undefined || value === null || value === '') {
      if (def.isRequired) {
        throw new ApiError(
          422,
          'INVALID_ATTRIBUTES',
          `Thiếu thuộc tính bắt buộc: ${def.attributeKey}`
        );
      }
      continue;
    }

    if (def.attributeType === 'number' && typeof value !== 'number') {
      throw new ApiError(422, 'INVALID_ATTRIBUTES', `${def.attributeKey} phải là số`);
    }
    if (def.attributeType === 'boolean' && typeof value !== 'boolean') {
      throw new ApiError(422, 'INVALID_ATTRIBUTES', `${def.attributeKey} phải là boolean`);
    }
    if (def.attributeType === 'select' && Array.isArray(def.options) && !def.options.includes(value)) {
      throw new ApiError(
        422,
        'INVALID_ATTRIBUTES',
        `${def.attributeKey} phải là một trong: ${def.options.join(', ')}`
      );
    }

    sanitized[def.attributeKey] = value; // chỉ giữ key đã được định nghĩa — chống lỗi chính tả từ client
  }

  return sanitized;
}

module.exports = { validateAttributes };
```

- [ ] **Step 5: Chạy lại test, xác nhận PASS**

```bash
npx jest tests/attributeValidator.test.js
# Expected: 4 passed
```

- [ ] **Step 6: `controllers/product.controller.js`** (phần list/getBySlug/create —
`addVariant`/`addImages` viết ở Buổi 8/9)

```javascript
const prisma = require('../services/prisma');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { validateAttributes } = require('../services/attributeValidator');

const list = asyncHandler(async (req, res) => {
  const products = await prisma.product.findMany({
    where: { status: 'active' },
    include: { images: true, variants: true },
  });
  sendSuccess(res, products);
});

const getBySlug = asyncHandler(async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { slug: req.params.slug },
    include: { images: true, variants: true, category: true },
  });
  if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm');
  sendSuccess(res, product);
});

const create = asyncHandler(async (req, res) => {
  const { categoryId, name, slug, description, brand, attributes } = req.body;

  const categoryAttributes = await prisma.categoryAttribute.findMany({ where: { categoryId } });
  const sanitizedAttributes = validateAttributes(categoryAttributes, attributes);

  const product = await prisma.product.create({
    data: { categoryId, name, slug, description, brand, attributes: sanitizedAttributes },
  });
  sendSuccess(res, product, null, 201);
});

module.exports = { list, getBySlug, create };
```

- [ ] **Step 7: `routes/product.route.js`**

```javascript
const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const authenticate = require('../middlewares/authenticate');
const requireRole = require('../middlewares/requireRole');
const ctrl = require('../controllers/product.controller');

router.get('/', ctrl.list);
router.get('/:slug', ctrl.getBySlug);

router.post(
  '/',
  authenticate,
  requireRole('admin'),
  [body('categoryId').notEmpty(), body('name').notEmpty(), body('slug').notEmpty(), validate],
  ctrl.create
);

module.exports = router;
```

- [ ] **Step 8: Gắn vào `routes/index.js`**

```javascript
router.use('/products', require('./product.route'));
```

- [ ] **Step 9: Verify thủ công**

```bash
curl -s -X POST http://localhost:4000/api/v1/products \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"categoryId":"<id-pet-food>","name":"Hạt cho chó Adult","slug":"hat-cho-cho-adult","attributes":{"weight":"3kg"}}'
# Expected: 201

curl -s -X POST http://localhost:4000/api/v1/products \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"categoryId":"<id-pet-food>","name":"SP thiếu attribute","slug":"sp-thieu","attributes":{}}'
# Expected: 422 INVALID_ATTRIBUTES (vì weight isRequired=true)
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(buoi-7): product crud + validate jsonb attributes voi jest test"
```

---

### Task 8 (Buổi 8): Product variants — SKU, giá, variant_key canonicalize

**Files:**
- Modify: `backend/controllers/product.controller.js`, `backend/routes/product.route.js`
- Modify: `backend/prisma/schema.prisma` (đã có `ProductVariant` từ Buổi 2 — buổi này
  chỉ thêm controller/route dùng model đó)

**Interfaces:**
- Consumes: `validateAttributes` (Task 7, tái dùng để validate `variantAttributes`).
- Produces: `POST /api/v1/products/:id/variants` — Task 13 (reservation) dùng
  `prisma.productVariant` với các cột `stockQuantity`/`reservedQuantity`.

**Khái niệm cần nắm:** vì sao `variantKey` phải canonicalize (sort key trước khi hash)
— tài liệu gốc mục 4.2 chỉ rõ `{"weight":"3kg","flavor":"chicken"}` và
`{"flavor":"chicken","weight":"3kg"}` phải ra cùng 1 key dù thứ tự khác nhau, nếu không
sẽ tạo ra 2 "biến thể" trùng lặp trong DB.

- [ ] **Step 1: Thêm hàm tạo `variantKey` — đặt trong `services/attributeValidator.js`**

```javascript
function buildVariantKey(variantAttributes) {
  const sortedKeys = Object.keys(variantAttributes).sort();
  const normalized = {};
  for (const key of sortedKeys) normalized[key] = variantAttributes[key];
  return JSON.stringify(normalized);
}

module.exports = { validateAttributes, buildVariantKey };
```

- [ ] **Step 2: Thêm `addVariant` vào `controllers/product.controller.js`**

```javascript
const { validateAttributes, buildVariantKey } = require('../services/attributeValidator');

const addVariant = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { sku, price, compareAtPrice, stockQuantity, variantAttributes, imageUrl } = req.body;

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm');

  const categoryAttributes = await prisma.categoryAttribute.findMany({
    where: { categoryId: product.categoryId },
  });
  const sanitized = validateAttributes(categoryAttributes, variantAttributes);
  const variantKey = buildVariantKey(sanitized);

  const existing = await prisma.productVariant.findUnique({
    where: { productId_variantKey: { productId: id, variantKey } },
  });
  if (existing) throw new ApiError(409, 'VARIANT_DUPLICATE', 'Biến thể này đã tồn tại');

  const variant = await prisma.productVariant.create({
    data: {
      productId: id,
      sku,
      price: BigInt(price),
      compareAtPrice: compareAtPrice ? BigInt(compareAtPrice) : null,
      stockQuantity: stockQuantity ?? 0,
      variantAttributes: sanitized,
      variantKey,
      imageUrl,
    },
  });

  sendSuccess(res, { ...variant, price: variant.price.toString() }, null, 201);
});

module.exports = { list, getBySlug, create, addVariant };
```

> Lưu ý: `BigInt` không tự `JSON.stringify` được — phải convert `.toString()` trước khi
> trả response, nếu không Express sẽ throw `TypeError: Do not know how to serialize a BigInt`.

- [ ] **Step 3: Thêm route**

```javascript
router.post(
  '/:id/variants',
  authenticate,
  requireRole('admin'),
  [body('sku').notEmpty(), body('price').isNumeric(), validate],
  ctrl.addVariant
);
```

- [ ] **Step 4: Verify**

```bash
curl -s -X POST http://localhost:4000/api/v1/products/<id>/variants \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"sku":"HCC-3KG","price":150000,"stockQuantity":20,"variantAttributes":{"weight":"3kg"}}'
# Expected: 201

# Gọi lại lần 2 với cùng variantAttributes -> Expected: 409 VARIANT_DUPLICATE
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(buoi-8): product variants voi variant_key canonicalize"
```

---

### Task 9 (Buổi 9): Upload ảnh sản phẩm

**Files:**
- Create: `backend/middlewares/upload.js`
- Modify: `backend/controllers/product.controller.js`, `backend/routes/product.route.js`

**Interfaces:**
- Produces: `POST /api/v1/products/:id/images` (multipart/form-data, field `image`).

**Khái niệm cần nắm:** `multer` xử lý `multipart/form-data` (khác `express.json()` chỉ
đọc JSON) — vì sao phải giới hạn `fileFilter` (chỉ nhận mime `image/*`) và `limits`
(chặn file quá lớn) NGAY tại middleware, không chờ đến tận business logic mới kiểm tra
(tài liệu gốc mục 9.3 — chống upload file độc hại/quá tải).

- [ ] **Step 1: Cài `multer`**

```bash
npm install multer
```

- [ ] **Step 2: `middlewares/upload.js`**

```javascript
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = crypto.randomBytes(16).toString('hex'); // không giữ tên gốc từ client
    cb(null, `${safeName}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new ApiError(422, 'INVALID_FILE_TYPE', 'Chỉ chấp nhận jpeg/png/webp'));
    }
    cb(null, true);
  },
});

module.exports = upload;
```

- [ ] **Step 3: Tạo thư mục lưu file & serve static**

```bash
mkdir -p backend/public/uploads
```

Thêm vào `app.js` (cạnh các `app.use` khác):
```javascript
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
```
(nhớ `const path = require('path');` ở đầu `app.js` nếu chưa có.)

- [ ] **Step 4: Thêm `addImages` vào `controllers/product.controller.js`**

```javascript
const addImages = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!req.file) throw new ApiError(422, 'FILE_REQUIRED', 'Thiếu file ảnh');

  const image = await prisma.productImage.create({
    data: {
      productId: id,
      url: `/uploads/${req.file.filename}`,
      altText: req.body.altText || null,
    },
  });
  sendSuccess(res, image, null, 201);
});

module.exports = { list, getBySlug, create, addVariant, addImages };
```

- [ ] **Step 5: Thêm route**

```javascript
const upload = require('../middlewares/upload');

router.post(
  '/:id/images',
  authenticate,
  requireRole('admin'),
  upload.single('image'),
  ctrl.addImages
);
```

- [ ] **Step 6: Verify**

```bash
curl -s -X POST http://localhost:4000/api/v1/products/<id>/images \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@/duong/dan/anh.jpg" -F "altText=Hạt cho chó Adult 3kg"
# Expected: 201, url dạng /uploads/<random-hex>.jpg
```

- [ ] **Step 7: `.gitignore` cho uploads & commit**

```bash
echo "public/uploads/*" >> backend/.gitignore
echo "!public/uploads/.gitkeep" >> backend/.gitignore
touch backend/public/uploads/.gitkeep
git add -A
git commit -m "feat(buoi-9): upload anh san pham voi multer"
```

---

### Task 10 (Buổi 10): List/filter/phân trang sản phẩm + seed data + review tuần 2

**Files:**
- Modify: `backend/controllers/product.controller.js`, `backend/routes/product.route.js`
- Create: `backend/scripts/seed.js`

**Interfaces:**
- Produces: `GET /api/v1/products?categorySlug=&page=&pageSize=&attr_weight=` —
  Buổi 16 (Next.js) gọi endpoint này để hiển thị danh mục.

**Khái niệm cần nắm:** filter theo JSONB trong Prisma dùng cú pháp
`where: { attributes: { path: ['weight'], equals: '3kg' } }` — Postgres tận dụng GIN
index (nếu có) thay vì quét toàn bảng; phân trang kiểu offset (`skip`/`take`) đơn giản,
đủ dùng cho MVP (phân trang kiểu cursor để dành khi dữ liệu lớn).

- [ ] **Step 1: Sửa `list` trong `controllers/product.controller.js`** để hỗ trợ filter
& phân trang

```javascript
const list = asyncHandler(async (req, res) => {
  const { categorySlug, page = '1', pageSize = '12' } = req.query;
  const take = Math.min(Number(pageSize) || 12, 50);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const where = { status: 'active' };
  if (categorySlug) {
    const category = await prisma.category.findUnique({ where: { slug: categorySlug } });
    if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục');
    where.categoryId = category.id;
  }

  // filter theo attribute JSONB, vd ?attr_weight=3kg
  for (const key of Object.keys(req.query)) {
    if (key.startsWith('attr_')) {
      const attrKey = key.replace('attr_', '');
      where.attributes = { path: [attrKey], equals: req.query[key] };
    }
  }

  const [items, total] = await Promise.all([
    prisma.product.findMany({ where, include: { images: true, variants: true }, skip, take }),
    prisma.product.count({ where }),
  ]);

  sendSuccess(res, items, { page: Number(page), pageSize: take, total });
});
```

- [ ] **Step 2: `scripts/seed.js`** — dữ liệu mẫu cho 2 ngành hàng (đúng gợi ý mục 13
tài liệu gốc: kiểm chứng attribute động với ít nhất 2 ngành khác nhau)

```javascript
const bcrypt = require('bcrypt');
const prisma = require('../services/prisma');
const { buildVariantKey } = require('../services/attributeValidator');

async function main() {
  const petFood = await prisma.category.upsert({
    where: { slug: 'pet-food' },
    update: {},
    create: { name: 'Pet Food', slug: 'pet-food' },
  });
  await prisma.categoryAttribute.createMany({
    data: [
      { categoryId: petFood.id, attributeKey: 'weight', attributeLabel: 'Trọng lượng', attributeType: 'select', isRequired: true, options: ['1kg', '3kg', '5kg'] },
    ],
    skipDuplicates: true,
  });

  const cosmetics = await prisma.category.upsert({
    where: { slug: 'cosmetics' },
    update: {},
    create: { name: 'Mỹ phẩm', slug: 'cosmetics' },
  });
  await prisma.categoryAttribute.createMany({
    data: [
      { categoryId: cosmetics.id, attributeKey: 'volumeMl', attributeLabel: 'Dung tích (ml)', attributeType: 'number', isRequired: true },
    ],
    skipDuplicates: true,
  });

  const dogFood = await prisma.product.upsert({
    where: { slug: 'hat-cho-cho-adult' },
    update: {},
    create: {
      categoryId: petFood.id,
      name: 'Hạt cho chó Adult',
      slug: 'hat-cho-cho-adult',
      status: 'active',
      attributes: { weight: '3kg' },
    },
  });
  const variantAttrs = { weight: '3kg' };
  await prisma.productVariant.upsert({
    where: { productId_variantKey: { productId: dogFood.id, variantKey: buildVariantKey(variantAttrs) } },
    update: {},
    create: {
      productId: dogFood.id,
      sku: 'HCC-3KG',
      price: 150000n,
      stockQuantity: 5,
      variantAttributes: variantAttrs,
      variantKey: buildVariantKey(variantAttrs),
    },
  });

  console.log('Seed xong.');
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Verify**

```bash
node backend/scripts/seed.js
curl -s "http://localhost:4000/api/v1/products?categorySlug=pet-food&attr_weight=3kg" | jq
# Expected: 1 sản phẩm "Hạt cho chó Adult", meta.total = 1
```

- [ ] **Step 4: Review tuần 2**

Checklist tự chấm: category/product/variant CRUD hoạt động qua Postman; upload ảnh
thành công; filter theo attribute JSONB trả đúng kết quả; giải thích được vì sao
`validateAttributes` chặn được lỗi chính tả key mà JSONB thuần không chặn được.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(buoi-10): list/filter/phan trang san pham + seed 2 nganh hang"
```

---

# TUẦN 3 — CART → ORDER → PAYMENT GIẢ LẬP

### Task 11 (Buổi 11): Luồng giỏ hàng client-side + API tính tổng đơn (preview)

**Files:**
- Create: `backend/controllers/order.controller.js` (chỉ hàm `previewCart` ở buổi này)
- Create: `backend/routes/order.route.js`
- Modify: `backend/routes/index.js`

**Interfaces:**
- Produces: `POST /api/v1/orders/preview` — Buổi 18 (Next.js checkout) gọi trước khi
  tạo order thật, để hiển thị tổng tiền chính xác từ server (không tin giá client gửi
  lên trực tiếp).

**Khái niệm cần nắm:** vì sao giỏ hàng ở client (Zustand/localStorage) chỉ nên lưu
`variantId` + `quantity`, KHÔNG lưu giá — giá luôn phải lấy lại từ server tại thời điểm
preview/checkout, tránh trường hợp người dùng sửa giá trong localStorage bằng DevTools.

- [ ] **Step 1: `controllers/order.controller.js` — `previewCart`**

```javascript
const prisma = require('../services/prisma');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const previewCart = asyncHandler(async (req, res) => {
  const { items } = req.body; // [{ variantId, quantity }]
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(422, 'EMPTY_CART', 'Giỏ hàng trống');
  }

  const variantIds = items.map((i) => i.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: true },
  });

  let totalAmount = 0n;
  const lines = items.map((item) => {
    const variant = variants.find((v) => v.id === item.variantId);
    if (!variant) throw new ApiError(404, 'VARIANT_NOT_FOUND', `Không tìm thấy biến thể ${item.variantId}`);
    const subtotal = variant.price * BigInt(item.quantity);
    totalAmount += subtotal;
    return {
      variantId: variant.id,
      productName: variant.product.name,
      sku: variant.sku,
      unitPrice: variant.price.toString(),
      quantity: item.quantity,
      subtotal: subtotal.toString(),
    };
  });

  sendSuccess(res, { lines, totalAmount: totalAmount.toString() });
});

module.exports = { previewCart };
```

- [ ] **Step 2: `routes/order.route.js`**

```javascript
const router = require('express').Router();
const ctrl = require('../controllers/order.controller');

router.post('/preview', ctrl.previewCart);

module.exports = router;
```

- [ ] **Step 3: Gắn vào `routes/index.js`**

```javascript
router.use('/orders', require('./order.route'));
```

- [ ] **Step 4: Verify**

```bash
curl -s -X POST http://localhost:4000/api/v1/orders/preview \
  -H "Content-Type: application/json" \
  -d '{"items":[{"variantId":"<id-variant>","quantity":2}]}'
# Expected: lines[0].subtotal = "300000" nếu giá 150000/cái
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(buoi-11): preview cart tinh tong tien tu server"
```

---

### Task 12 (Buổi 12): Order + order_items (snapshot bất biến) — bản chưa có reservation

**Files:**
- Modify: `backend/prisma/schema.prisma` (thêm `Order`, `OrderItem`),
  `backend/controllers/order.controller.js`, `backend/routes/order.route.js`

**Interfaces:**
- Produces: `POST /api/v1/orders` (bản đơn giản — CHƯA lock tồn kho, Task 13 sẽ sửa
  lại hàm này), trả về `Order` kèm `items`.

**Khái niệm cần nắm:** vì sao `OrderItem` phải copy (snapshot) `productNameSnapshot`,
`skuSnapshot`, `unitPrice` ngay tại thời điểm tạo đơn thay vì tham chiếu `Product`/
`ProductVariant` — 6 tháng sau nếu admin đổi giá/đổi tên sản phẩm, đơn hàng cũ vẫn phải
hiển thị đúng giá/tên tại thời điểm khách mua (đơn hàng là **bản ghi lịch sử**, không
phải view động).

- [ ] **Step 1: Thêm model vào `prisma/schema.prisma`**

```prisma
model Order {
  id                String      @id @default(uuid())
  orderCode         String      @unique
  userId            String?
  guestEmail        String?
  orderStatus       String      @default("pending")
  paymentStatus     String      @default("unpaid")
  fulfillmentStatus String      @default("unfulfilled")
  totalAmount       BigInt
  shippingAddress   Json?
  idempotencyKey    String?     @unique
  createdAt         DateTime    @default(now())
  items             OrderItem[]
}

model OrderItem {
  id                  String  @id @default(uuid())
  orderId             String
  order               Order   @relation(fields: [orderId], references: [id])
  variantId           String
  productNameSnapshot String
  skuSnapshot         String
  unitPrice           BigInt
  quantity            Int
  subtotal            BigInt
}
```

```bash
npx prisma migrate dev --name add_order_orderitem
```

- [ ] **Step 2: Thêm `createOrder` vào `controllers/order.controller.js`** (bản đơn
giản — Task 13 sẽ Modify lại để bọc transaction + reservation)

```javascript
function generateOrderCode() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${date}-${random}`;
}

const createOrder = asyncHandler(async (req, res) => {
  const { items, guestEmail, shippingAddress } = req.body;
  const idempotencyKey = req.headers['idempotency-key'] || null;

  if (idempotencyKey) {
    const existing = await prisma.order.findUnique({ where: { idempotencyKey }, include: { items: true } });
    if (existing) return sendSuccess(res, existing, null, 200); // trả lại kết quả lần đầu, không tạo mới
  }

  const variantIds = items.map((i) => i.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: { product: true },
  });

  let totalAmount = 0n;
  const orderItemsData = items.map((item) => {
    const variant = variants.find((v) => v.id === item.variantId);
    if (!variant) throw new ApiError(404, 'VARIANT_NOT_FOUND', `Không tìm thấy biến thể ${item.variantId}`);
    const subtotal = variant.price * BigInt(item.quantity);
    totalAmount += subtotal;
    return {
      variantId: variant.id,
      productNameSnapshot: variant.product.name,
      skuSnapshot: variant.sku,
      unitPrice: variant.price,
      quantity: item.quantity,
      subtotal,
    };
  });

  const order = await prisma.order.create({
    data: {
      orderCode: generateOrderCode(),
      userId: req.user?.id || null,
      guestEmail: req.user ? null : guestEmail,
      totalAmount,
      shippingAddress,
      idempotencyKey,
      items: { create: orderItemsData },
    },
    include: { items: true },
  });

  sendSuccess(res, order, null, 201);
});

module.exports = { previewCart, createOrder };
```

- [ ] **Step 3: Thêm route** (không bắt buộc login — hỗ trợ guest checkout)

```javascript
router.post('/', ctrl.createOrder);
```

- [ ] **Step 4: Verify** — lưu ý BigInt trả JSON sẽ lỗi, cần convert trước
`sendSuccess`. Nếu gặp `TypeError: Do not know how to serialize a BigInt`, đây chính là
bug cần sửa: thêm hàm `serializeOrder(order)` convert mọi field `BigInt` sang string
trước khi trả — bạn tự viết hàm này dựa trên kinh nghiệm đã gặp ở Task 8 (variant.price).

```bash
curl -s -X POST http://localhost:4000/api/v1/orders \
  -H "Content-Type: application/json" -H "Idempotency-Key: test-key-1" \
  -d '{"items":[{"variantId":"<id>","quantity":1}],"guestEmail":"guest@test.com"}'
# Expected: 201, order.items[0].productNameSnapshot đúng tên sản phẩm hiện tại

# Gọi lại y hệt với cùng Idempotency-Key -> Expected: 200, trả lại đúng order cũ, KHÔNG tạo order mới
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(buoi-12): tao order + order_items snapshot bat bien (chua co reservation)"
```

---

### Task 13 (Buổi 13): Reservation tồn kho — transaction + row lock chống race condition

**Files:**
- Modify: `backend/prisma/schema.prisma` (thêm `OrderReservation`, quan hệ
  `ProductVariant.reservedQuantity` đã có sẵn từ Buổi 2),
  `backend/controllers/order.controller.js`
- Create: `backend/services/reservation.js`

**Interfaces:**
- Produces: `reserveStock(tx, variantId, quantity, orderId, expiresAt)` — Task 14/15
  dùng lại `prisma.orderReservation` để confirm/release.

**Khái niệm cần nắm:** đây là phần khó nhất và giá trị học cao nhất tháng 1 — tài liệu
gốc mục 8.1/4.5. Nếu chỉ đọc `stockQuantity` rồi tính toán ở tầng Node.js rồi mới
`UPDATE`, hai request đến gần như đồng thời đều đọc thấy tồn kho còn hàng rồi cùng
`UPDATE` — dẫn đến bán vượt tồn kho (overselling). `SELECT ... FOR UPDATE` bắt request
thứ hai phải CHỜ request thứ nhất commit xong mới được đọc dòng đó, đảm bảo tuần tự hoá
đúng thứ tự.

- [ ] **Step 1: Thêm model `OrderReservation`**

```prisma
model OrderReservation {
  id        String   @id @default(uuid())
  orderId   String
  order     Order    @relation(fields: [orderId], references: [id])
  variantId String
  quantity  Int
  expiresAt DateTime
  status    String   @default("active") // active, confirmed, released
}
```

Thêm `reservations OrderReservation[]` vào model `Order`.

```bash
npx prisma migrate dev --name add_order_reservation
```

- [ ] **Step 2: `services/reservation.js`**

```javascript
const ApiError = require('../utils/ApiError');

const RESERVATION_TTL_MS = 15 * 60 * 1000; // 15 phút

async function reserveStock(tx, { variantId, quantity, orderId }) {
  // Row lock: khoá đúng dòng variant này cho tới khi transaction commit/rollback
  const rows = await tx.$queryRaw`
    SELECT "stockQuantity", "reservedQuantity"
    FROM "ProductVariant"
    WHERE id = ${variantId}
    FOR UPDATE
  `;
  const variant = rows[0];
  if (!variant) throw new ApiError(404, 'VARIANT_NOT_FOUND', `Không tìm thấy biến thể ${variantId}`);

  const available = variant.stockQuantity - variant.reservedQuantity;
  if (available < quantity) {
    throw new ApiError(409, 'INSUFFICIENT_STOCK', `Không đủ tồn kho cho biến thể ${variantId}`);
  }

  await tx.productVariant.update({
    where: { id: variantId },
    data: { reservedQuantity: { increment: quantity } },
  });

  await tx.orderReservation.create({
    data: {
      orderId,
      variantId,
      quantity,
      expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
      status: 'active',
    },
  });
}

module.exports = { reserveStock, RESERVATION_TTL_MS };
```

- [ ] **Step 3: Sửa `createOrder` trong `controllers/order.controller.js`** — bọc toàn
bộ việc tạo order + reservation trong 1 transaction. QUAN TRỌNG: transaction KHÔNG được
gọi bất kỳ API mạng nào bên trong (tài liệu gốc mục 8.1 — anti-pattern giữ transaction
mở trong lúc chờ network).

```javascript
const { reserveStock } = require('../services/reservation');

const createOrder = asyncHandler(async (req, res) => {
  const { items, guestEmail, shippingAddress } = req.body;
  const idempotencyKey = req.headers['idempotency-key'] || null;

  if (idempotencyKey) {
    const existing = await prisma.order.findUnique({ where: { idempotencyKey }, include: { items: true } });
    if (existing) return sendSuccess(res, existing, null, 200);
  }

  const order = await prisma.$transaction(async (tx) => {
    const variantIds = items.map((i) => i.variantId);
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    });

    let totalAmount = 0n;
    const orderItemsData = items.map((item) => {
      const variant = variants.find((v) => v.id === item.variantId);
      if (!variant) throw new ApiError(404, 'VARIANT_NOT_FOUND', `Không tìm thấy biến thể ${item.variantId}`);
      const subtotal = variant.price * BigInt(item.quantity);
      totalAmount += subtotal;
      return {
        variantId: variant.id,
        productNameSnapshot: variant.product.name,
        skuSnapshot: variant.sku,
        unitPrice: variant.price,
        quantity: item.quantity,
        subtotal,
      };
    });

    const created = await tx.order.create({
      data: {
        orderCode: generateOrderCode(),
        userId: req.user?.id || null,
        guestEmail: req.user ? null : guestEmail,
        totalAmount,
        shippingAddress,
        idempotencyKey,
        items: { create: orderItemsData },
      },
      include: { items: true },
    });

    // Giữ chỗ tồn kho cho từng item — nếu bất kỳ item nào không đủ hàng,
    // throw ở đây sẽ rollback TOÀN BỘ transaction (không tạo order dở dang).
    for (const item of items) {
      await reserveStock(tx, { variantId: item.variantId, quantity: item.quantity, orderId: created.id });
    }

    return created;
  });

  sendSuccess(res, order, null, 201);
});
```

- [ ] **Step 4: Verify tuần tự (chưa phải concurrency test — để dành Buổi 19)**

```bash
# Set stockQuantity = 5 cho 1 variant (qua Prisma Studio), thử đặt quantity = 10
curl -s -X POST http://localhost:4000/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{"items":[{"variantId":"<id>","quantity":10}],"guestEmail":"guest@test.com"}'
# Expected: 409 INSUFFICIENT_STOCK, và Prisma Studio xác nhận KHÔNG có order/order_items
# nào được tạo (transaction đã rollback toàn bộ)
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(buoi-13): reservation ton kho voi transaction + row lock FOR UPDATE"
```

---

### Task 14 (Buổi 14): State machine order/payment/fulfillment + fake payment webhook

**Files:**
- Create: `backend/services/orderStateMachine.js`, `backend/controllers/payment.controller.js`,
  `backend/routes/payment.route.js`, `backend/tests/orderStateMachine.test.js`
- Modify: `backend/prisma/schema.prisma` (thêm `PaymentWebhookLog`), `backend/routes/index.js`

**Interfaces:**
- Consumes: `reserveStock` pattern (Task 13), `prisma.orderReservation`.
- Produces: `transition(tx, order, field, toValue)` (throws
  `ApiError(409, 'INVALID_TRANSITION', ...)` nếu sai whitelist); `confirmReservation(tx, reservationId)`
  trong `services/reservation.js` — Buổi 15 dùng lại cho job hết hạn.

**Khái niệm cần nắm:** tài liệu gốc mục 8.2 — KHÔNG được gán trực tiếp
`order.orderStatus = "confirmed"` ở bất kỳ đâu; mọi chuyển trạng thái phải qua 1 hàm
duy nhất có whitelist. Đồng thời học "atomic state transition" (mục 8.1): dùng
`UPDATE ... WHERE status = 'active'` rồi kiểm tra `affectedRows` thay vì đọc-rồi-ghi,
để chống race giữa job hết hạn (Buổi 15) và webhook thanh toán đến cùng lúc.

- [ ] **Step 1: Thêm model `PaymentWebhookLog`**

```prisma
model PaymentWebhookLog {
  id               String   @id @default(uuid())
  orderId          String
  gateway          String   @default("fake")
  transactionRef   String
  signatureValid   Boolean
  processingStatus String   @default("received")
  rawPayload       Json?
  receivedAt       DateTime @default(now())

  @@unique([gateway, transactionRef])
}
```

```bash
npx prisma migrate dev --name add_payment_webhook_log
```

- [ ] **Step 2: Viết test trước — `tests/orderStateMachine.test.js`**

```javascript
const { getNextAllowed } = require('../services/orderStateMachine');

test('pending -> confirmed la hop le', () => {
  expect(getNextAllowed('orderStatus', 'pending')).toContain('confirmed');
});

test('confirmed -> pending la KHONG hop le', () => {
  expect(getNextAllowed('orderStatus', 'confirmed')).not.toContain('pending');
});

test('paymentStatus paid -> unpaid la KHONG hop le', () => {
  expect(getNextAllowed('paymentStatus', 'paid')).not.toContain('unpaid');
});
```

- [ ] **Step 3: Chạy test, xác nhận FAIL** (`Cannot find module`)

- [ ] **Step 4: `services/orderStateMachine.js`**

```javascript
const ApiError = require('../utils/ApiError');

const TRANSITIONS = {
  orderStatus: {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  },
  paymentStatus: {
    unpaid: ['paid', 'failed'],
    paid: ['refunded'],
    failed: [],
    refunded: [],
  },
  fulfillmentStatus: {
    unfulfilled: ['processing'],
    processing: ['shipped'],
    shipped: ['delivered'],
    delivered: [],
  },
};

function getNextAllowed(field, currentValue) {
  return TRANSITIONS[field]?.[currentValue] || [];
}

async function transition(tx, order, field, toValue) {
  const allowed = getNextAllowed(field, order[field]);
  if (!allowed.includes(toValue)) {
    throw new ApiError(
      409,
      'INVALID_TRANSITION',
      `Không thể chuyển ${field} từ "${order[field]}" sang "${toValue}"`
    );
  }

  return tx.order.update({ where: { id: order.id }, data: { [field]: toValue } });
}

module.exports = { transition, getNextAllowed };
```

- [ ] **Step 5: Chạy lại test, xác nhận PASS**

- [ ] **Step 6: Thêm `confirmReservation`/`releaseReservation` vào `services/reservation.js`**
(atomic update — kiểm tra `count` thay vì đọc trước)

```javascript
async function confirmReservation(tx, reservationId) {
  const result = await tx.orderReservation.updateMany({
    where: { id: reservationId, status: 'active' },
    data: { status: 'confirmed' },
  });
  if (result.count === 0) return false; // đã có transition khác thắng (vd job expire chạy trước)

  const reservation = await tx.orderReservation.findUnique({ where: { id: reservationId } });
  await tx.productVariant.update({
    where: { id: reservation.variantId },
    data: {
      stockQuantity: { decrement: reservation.quantity },
      reservedQuantity: { decrement: reservation.quantity },
    },
  });
  return true;
}

async function releaseReservation(tx, reservationId) {
  const result = await tx.orderReservation.updateMany({
    where: { id: reservationId, status: 'active' },
    data: { status: 'released' },
  });
  if (result.count === 0) return false;

  const reservation = await tx.orderReservation.findUnique({ where: { id: reservationId } });
  await tx.productVariant.update({
    where: { id: reservation.variantId },
    data: { reservedQuantity: { decrement: reservation.quantity } },
  });
  return true;
}

module.exports = { reserveStock, RESERVATION_TTL_MS, confirmReservation, releaseReservation };
```

- [ ] **Step 7: `controllers/payment.controller.js`**

```javascript
const prisma = require('../services/prisma');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { transition } = require('../services/orderStateMachine');
const { confirmReservation } = require('../services/reservation');

const fakeWebhook = asyncHandler(async (req, res) => {
  const { orderId, transactionRef, status } = req.body; // status: 'success' | 'failed'

  // Idempotency: log trước bằng unique constraint (gateway, transactionRef) —
  // nếu webhook gọi lại lần 2 với cùng transactionRef, insert sẽ báo lỗi unique,
  // ta bắt lỗi đó và coi như "đã xử lý, bỏ qua".
  try {
    await prisma.paymentWebhookLog.create({
      data: { orderId, gateway: 'fake', transactionRef, signatureValid: true, rawPayload: req.body },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return sendSuccess(res, { message: 'Webhook đã được xử lý trước đó (idempotent)' });
    }
    throw err;
  }

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { reservations: true } });
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng');

  if (status !== 'success') {
    await prisma.$transaction(async (tx) => {
      await transition(tx, order, 'paymentStatus', 'failed');
    });
    return sendSuccess(res, { message: 'Đã ghi nhận thanh toán thất bại' });
  }

  await prisma.$transaction(async (tx) => {
    for (const reservation of order.reservations) {
      if (reservation.status === 'active') {
        const confirmed = await confirmReservation(tx, reservation.id);
        if (!confirmed) {
          throw new ApiError(409, 'RESERVATION_EXPIRED', 'Đơn đã hết hạn giữ chỗ trước khi thanh toán tới');
        }
      }
    }
    await transition(tx, order, 'paymentStatus', 'paid');
    const refreshed = await tx.order.findUnique({ where: { id: orderId } });
    await transition(tx, refreshed, 'orderStatus', 'confirmed');
  });

  sendSuccess(res, { message: 'Thanh toán thành công, đơn đã được xác nhận' });
});

module.exports = { fakeWebhook };
```

- [ ] **Step 8: `routes/payment.route.js`** + gắn vào `routes/index.js`

```javascript
const router = require('express').Router();
const ctrl = require('../controllers/payment.controller');

router.post('/fake-webhook', ctrl.fakeWebhook);

module.exports = router;
```

```javascript
router.use('/payments', require('./payment.route'));
```

- [ ] **Step 9: Verify**

```bash
curl -s -X POST http://localhost:4000/api/v1/payments/fake-webhook \
  -H "Content-Type: application/json" \
  -d '{"orderId":"<id>","transactionRef":"TXN-001","status":"success"}'
# Expected: message "Thanh toán thành công..."; kiểm tra Prisma Studio: order.orderStatus=confirmed,
# paymentStatus=paid, variant.stockQuantity đã giảm đúng số lượng, reservedQuantity về 0

# Gọi lại y hệt lần 2 -> Expected: "Webhook đã được xử lý trước đó (idempotent)", KHÔNG trừ kho lần 2
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(buoi-14): order state machine + fake payment webhook idempotent"
```

---

### Task 15 (Buổi 15): Idempotency-Key toàn cục + job hết hạn reservation + review tuần 3

**Files:**
- Create: `backend/services/reservationExpiry.job.js`
- Modify: `backend/bin/www`

**Interfaces:**
- Consumes: `releaseReservation` (Task 14), `transition` (Task 14).
- Produces: `startReservationExpiryJob()` — chạy nền, không expose API.

**Khái niệm cần nắm:** vì sao dùng `setInterval` ở đây được coi là "tạm chấp nhận cho
MVP" chứ không phải giải pháp cuối — nếu chạy nhiều instance backend (scale ngang), mỗi
instance sẽ có 1 `setInterval` riêng cùng quét 1 bảng → nguy cơ 2 instance cùng xử lý 1
reservation. Bản thân `releaseReservation` đã atomic (`updateMany WHERE status='active'`)
nên vẫn AN TOÀN dù chạy trùng, chỉ là lãng phí — đây chính là lý do roadmap Giai đoạn 7
sẽ chuyển sang BullMQ (có cơ chế lock job).

- [ ] **Step 1: `services/reservationExpiry.job.js`**

```javascript
const prisma = require('./prisma');
const { transition } = require('./orderStateMachine');
const { releaseReservation } = require('./reservation');

const CHECK_INTERVAL_MS = 60 * 1000; // 1 phút

async function releaseExpiredReservations() {
  const expired = await prisma.orderReservation.findMany({
    where: { status: 'active', expiresAt: { lt: new Date() } },
    include: { order: true },
  });

  for (const reservation of expired) {
    await prisma.$transaction(async (tx) => {
      const released = await releaseReservation(tx, reservation.id);
      if (released && reservation.order.orderStatus === 'pending') {
        await transition(tx, reservation.order, 'orderStatus', 'cancelled');
      }
    });
    console.log(`Đã huỷ giữ chỗ hết hạn cho order ${reservation.orderId}`);
  }
}

function startReservationExpiryJob() {
  setInterval(() => {
    releaseExpiredReservations().catch((err) => console.error('Lỗi job hết hạn reservation:', err));
  }, CHECK_INTERVAL_MS);
  console.log('Reservation expiry job đã khởi động (chu kỳ 60s)');
}

module.exports = { startReservationExpiryJob };
```

- [ ] **Step 2: Gọi job trong `bin/www`**

```javascript
#!/usr/bin/env node
const app = require('../app');
const { port } = require('../config/env');
const { startReservationExpiryJob } = require('../services/reservationExpiry.job');

app.listen(port, () => {
  console.log(`Server đang chạy tại http://localhost:${port}`);
  startReservationExpiryJob();
});
```

- [ ] **Step 3: Verify** (rút ngắn TTL để test nhanh — sửa tạm `RESERVATION_TTL_MS`
trong `services/reservation.js` xuống `10 * 1000` khi test, nhớ đổi lại `15 * 60 * 1000`
sau khi test xong)

```bash
# Tạo 1 order (Task 13), đợi ~70s, xem log server in ra
# "Đã huỷ giữ chỗ hết hạn cho order ..."
# Verify Prisma Studio: reservation.status = released, variant.reservedQuantity giảm về 0,
# order.orderStatus = cancelled
```

- [ ] **Step 4: Review tuần 3**

Checklist tự chấm: tạo order khi đủ hàng → thành công; tạo order khi thiếu hàng →
409 và rollback sạch; gọi fake-webhook 2 lần cùng `transactionRef` → chỉ xử lý 1 lần;
để order pending quá TTL → tự động cancelled và trả tồn kho. Đây là 4 hành vi cốt lõi
nhất của toàn bộ tài liệu gốc mục 8 — nắm chắc 4 điều này trước khi qua Tuần 4.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(buoi-15): job het han reservation tu dong + review tuan 3"
```

---

# TUẦN 4 — NEXT.JS STOREFRONT

### Task 16 (Buổi 16): Setup Next.js + fetch danh mục/sản phẩm

**Files:**
- Create: `frontend/package.json`, `frontend/next.config.js`, `frontend/lib/apiClient.js`,
  `frontend/app/layout.js`, `frontend/app/page.js`,
  `frontend/app/(shop)/[categorySlug]/page.js`

**Interfaces:**
- Consumes: `GET /api/v1/categories`, `GET /api/v1/products?categorySlug=` (Task 6, 10).
- Produces: `apiClient` (axios instance) — mọi trang sau dùng lại.

**Khái niệm cần nắm:** Server Component (mặc định trong App Router) fetch dữ liệu
trực tiếp trong hàm `async function Page()` chạy trên server, KHÔNG cần `useEffect`/
`useState` như Pages Router hay React thuần — khác biệt lớn nhất người mới hay bỡ ngỡ.

- [ ] **Step 1: Khởi tạo Next.js**

```bash
npx create-next-app@latest frontend --js --app --no-tailwind --no-src-dir --eslint
cd frontend
npm install axios
```

Khi được hỏi, chọn "No" cho TypeScript (đã chốt JS thuần), "No" cho Tailwind (thêm sau
nếu muốn, không bắt buộc tháng 1).

- [ ] **Step 2: `.env.local`**

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

- [ ] **Step 3: `lib/apiClient.js`**

```javascript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

export default apiClient;
```

- [ ] **Step 4: `app/page.js`** (trang chủ — danh sách category)

```javascript
import apiClient from '../lib/apiClient';
import Link from 'next/link';

export default async function HomePage() {
  const { data } = await apiClient.get('/categories');
  const categories = data.data;

  return (
    <main>
      <h1>Miniecom</h1>
      <ul>
        {categories.map((c) => (
          <li key={c.id}>
            <Link href={`/${c.slug}`}>{c.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 5: `app/(shop)/[categorySlug]/page.js`**

```javascript
import apiClient from '../../../lib/apiClient';
import Link from 'next/link';

export default async function CategoryPage({ params }) {
  const { categorySlug } = params;
  const { data } = await apiClient.get('/products', { params: { categorySlug } });
  const products = data.data;

  return (
    <main>
      <h1>Danh mục: {categorySlug}</h1>
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            <Link href={`/product/${p.slug}`}>{p.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 6: Verify**

```bash
npm run dev   # frontend chạy tại http://localhost:3000
# Yêu cầu backend (Task 1-15) đang chạy song song ở port 4000
# Mở http://localhost:3000 -> thấy danh sách category từ seed.js (Buổi 10)
# Click vào "Pet Food" -> thấy "Hạt cho chó Adult"
```

- [ ] **Step 7: Commit**

```bash
cd frontend
git add -A
git commit -m "feat(buoi-16): setup nextjs, trang chu + trang danh muc"
```

---

### Task 17 (Buổi 17): Trang chi tiết sản phẩm + giỏ hàng client (Zustand)

**Files:**
- Create: `frontend/store/useCartStore.js`, `frontend/app/product/[slug]/page.js`,
  `frontend/app/product/[slug]/AddToCartButton.js`, `frontend/app/cart/page.js`

**Interfaces:**
- Produces: `useCartStore` — Task 18 (checkout) đọc `items`/`clear()` từ store này.

**Khái niệm cần nắm:** `AddToCartButton` phải là Client Component (`'use client'`) vì
cần `onClick`/state — trang cha `product/[slug]/page.js` vẫn là Server Component fetch
dữ liệu, rồi truyền `variant` xuống qua props. Đây là pattern phổ biến nhất App Router:
Server Component bọc ngoài, Client Component nhỏ ở lá cây.

- [ ] **Step 1: Cài Zustand**

```bash
npm install zustand
```

- [ ] **Step 2: `store/useCartStore.js`** — chỉ lưu `variantId`+`quantity`+dữ liệu hiển
thị (KHÔNG lưu giá làm nguồn thật, giá thật lấy lại từ server lúc checkout — xem Task 11)

```javascript
'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [], // { variantId, name, sku, quantity, imageUrl }

      addItem: (item) => {
        const items = get().items;
        const existing = items.find((i) => i.variantId === item.variantId);
        if (existing) {
          set({
            items: items.map((i) =>
              i.variantId === item.variantId ? { ...i, quantity: i.quantity + item.quantity } : i
            ),
          });
        } else {
          set({ items: [...items, item] });
        }
      },

      removeItem: (variantId) => set({ items: get().items.filter((i) => i.variantId !== variantId) }),
      clear: () => set({ items: [] }),
    }),
    { name: 'miniecom-cart' } // key trong localStorage
  )
);
```

- [ ] **Step 3: `app/product/[slug]/AddToCartButton.js`**

```javascript
'use client';
import { useCartStore } from '../../../store/useCartStore';

export default function AddToCartButton({ variant, productName }) {
  const addItem = useCartStore((state) => state.addItem);

  return (
    <button
      onClick={() =>
        addItem({ variantId: variant.id, name: productName, sku: variant.sku, quantity: 1, imageUrl: variant.imageUrl })
      }
    >
      Thêm vào giỏ
    </button>
  );
}
```

- [ ] **Step 4: `app/product/[slug]/page.js`**

```javascript
import apiClient from '../../../lib/apiClient';
import AddToCartButton from './AddToCartButton';

export default async function ProductPage({ params }) {
  const { data } = await apiClient.get(`/products/${params.slug}`);
  const product = data.data;

  return (
    <main>
      <h1>{product.name}</h1>
      <p>{product.description}</p>
      {product.variants.map((variant) => (
        <div key={variant.id}>
          <span>{variant.sku} — {Number(variant.price).toLocaleString('vi-VN')}đ</span>
          <AddToCartButton variant={variant} productName={product.name} />
        </div>
      ))}
    </main>
  );
}
```

- [ ] **Step 5: `app/cart/page.js`**

```javascript
'use client';
import Link from 'next/link';
import { useCartStore } from '../../store/useCartStore';

export default function CartPage() {
  const items = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);

  return (
    <main>
      <h1>Giỏ hàng</h1>
      {items.length === 0 && <p>Giỏ hàng trống</p>}
      <ul>
        {items.map((item) => (
          <li key={item.variantId}>
            {item.name} ({item.sku}) x{item.quantity}
            <button onClick={() => removeItem(item.variantId)}>Xoá</button>
          </li>
        ))}
      </ul>
      {items.length > 0 && <Link href="/checkout">Tiến hành thanh toán</Link>}
    </main>
  );
}
```

- [ ] **Step 6: Verify**

```bash
# Mở trang product -> bấm "Thêm vào giỏ" -> mở /cart -> thấy item vừa thêm
# Reload trang -> item vẫn còn (nhờ persist localStorage)
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(buoi-17): trang chi tiet san pham + gio hang zustand persist"
```

---

### Task 18 (Buổi 18): Trang checkout gọi API tạo order

**Files:**
- Create: `frontend/app/checkout/page.js`, `frontend/app/order/[id]/page.js`

**Interfaces:**
- Consumes: `useCartStore` (Task 17), `POST /api/v1/orders`,
  `POST /api/v1/payments/fake-webhook` (Task 12-14).

**Khái niệm cần nắm:** vì sao `Idempotency-Key` phải được tạo **1 lần** khi vào trang
checkout và giữ nguyên cho tới khi thành công (lưu vào `sessionStorage`, không tạo mới
mỗi lần render) — nếu người dùng bấm "Đặt hàng" 2 lần do mạng chậm, cả 2 request phải
mang cùng key để server nhận diện là cùng 1 lần đặt hàng (Task 12 đã xử lý phía server).

- [ ] **Step 1: `app/checkout/page.js`**

```javascript
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '../../lib/apiClient';
import { useCartStore } from '../../store/useCartStore';

function getOrCreateIdempotencyKey() {
  let key = sessionStorage.getItem('checkout-idempotency-key');
  if (!key) {
    key = crypto.randomUUID();
    sessionStorage.setItem('checkout-idempotency-key', key);
  }
  return key;
}

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const clear = useCartStore((state) => state.clear);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = getOrCreateIdempotencyKey();
      const { data } = await apiClient.post(
        '/orders',
        {
          items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
          guestEmail: email,
        },
        { headers: { 'Idempotency-Key': idempotencyKey } }
      );
      sessionStorage.removeItem('checkout-idempotency-key');
      clear();
      router.push(`/order/${data.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Có lỗi xảy ra');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Thanh toán</h1>
      <form onSubmit={handleSubmit}>
        <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" disabled={submitting}>{submitting ? 'Đang xử lý...' : 'Đặt hàng'}</button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </main>
  );
}
```

- [ ] **Step 2: `app/order/[id]/page.js`** (trang xác nhận — có nút "Thanh toán ngay"
gọi fake-webhook để mô phỏng khách hoàn tất thanh toán ở cổng ngoài rồi quay lại)

```javascript
'use client';
import { useState } from 'react';
import apiClient from '../../../lib/apiClient';

export default function OrderConfirmPage({ params }) {
  const [status, setStatus] = useState('Chờ thanh toán');

  async function handleFakePay() {
    await apiClient.post('/payments/fake-webhook', {
      orderId: params.id,
      transactionRef: `TXN-${params.id}`,
      status: 'success',
    });
    setStatus('Đã thanh toán thành công');
  }

  return (
    <main>
      <h1>Đơn hàng #{params.id}</h1>
      <p>Trạng thái: {status}</p>
      <button onClick={handleFakePay}>Thanh toán ngay (giả lập)</button>
    </main>
  );
}
```

- [ ] **Step 3: Verify — chạy full luồng end-to-end**

```
1. Mở /pet-food -> vào sản phẩm -> Thêm vào giỏ
2. Mở /cart -> Tiến hành thanh toán
3. Điền email -> Đặt hàng -> chuyển sang /order/<id>, trạng thái "Chờ thanh toán"
4. Bấm "Thanh toán ngay" -> trạng thái đổi "Đã thanh toán thành công"
5. Kiểm tra Prisma Studio: order.orderStatus=confirmed, variant.stockQuantity đã giảm
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(buoi-18): trang checkout + xac nhan don + fake payment"
```

---

### Task 19 (Buổi 19): Test concurrency cho reservation

**Files:**
- Create: `backend/scripts/testConcurrency.js`

**Interfaces:**
- Consumes: `POST /api/v1/orders` (Task 13).

**Khái niệm cần nắm:** đây là loại lỗi CHỈ lộ ra khi có nhiều request đồng thời, test
tay từng cái một không bao giờ phát hiện được (tài liệu gốc mục 14.8). Nếu Task 13 làm
đúng row lock, kết quả mong đợi: đúng N đơn thành công (N = tồn kho), phần còn lại nhận
`409 INSUFFICIENT_STOCK` — không phải tất cả đều thành công.

- [ ] **Step 1: `scripts/testConcurrency.js`**

```javascript
const axios = require('axios');

const API_URL = 'http://localhost:4000/api/v1';
const VARIANT_ID = process.argv[2]; // truyền id variant qua tham số dòng lệnh
const CONCURRENT_REQUESTS = 20;

async function placeOrder(index) {
  try {
    const { data } = await axios.post(`${API_URL}/orders`, {
      items: [{ variantId: VARIANT_ID, quantity: 1 }],
      guestEmail: `test${index}@test.com`,
    });
    return { index, ok: true, orderId: data.data.id };
  } catch (err) {
    return { index, ok: false, error: err.response?.data?.error?.code };
  }
}

async function main() {
  if (!VARIANT_ID) {
    console.error('Cách dùng: node scripts/testConcurrency.js <variantId>');
    process.exit(1);
  }

  const results = await Promise.all(
    Array.from({ length: CONCURRENT_REQUESTS }, (_, i) => placeOrder(i))
  );

  const succeeded = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log(`Thành công: ${succeeded.length}/${CONCURRENT_REQUESTS}`);
  console.log(`Thất bại (đúng như kỳ vọng nếu = INSUFFICIENT_STOCK): ${failed.length}`);
  console.log('Chi tiết lỗi:', [...new Set(failed.map((f) => f.error))]);
}

main();
```

- [ ] **Step 2: Chuẩn bị dữ liệu test** — dùng Prisma Studio đặt `stockQuantity = 5,
reservedQuantity = 0` cho 1 variant bất kỳ.

- [ ] **Step 3: Chạy test**

```bash
node backend/scripts/testConcurrency.js <variantId>
```

Expected: `Thành công: 5/20`, `Thất bại: 15`, lỗi đều là `INSUFFICIENT_STOCK`. Nếu thấy
"Thành công: 20/20" — đây là bằng chứng row lock CHƯA hoạt động đúng, quay lại đọc kỹ
Task 13 Step 2-3 (rất có thể quên `FOR UPDATE` hoặc quên bọc trong `$transaction`).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(buoi-19): script test concurrency cho reservation ton kho"
```

---

### Task 20 (Buổi 20): Tổng kết — README, đối chiếu tài liệu gốc, quiz phỏng vấn

**Files:**
- Create: `README.md` (root project), `docs/MONTH1_INTERVIEW_QUIZ.md`

**Interfaces:** Không có — buổi tổng kết, không thêm code nghiệp vụ mới.

- [ ] **Step 1: Viết `README.md`** ở root project — mô tả stack, cách chạy
(`docker compose up -d`, `npx prisma migrate dev`, `node scripts/seed.js`,
`npm run dev` ở cả `backend/` và `frontend/`), sơ đồ luồng nghiệp vụ đã làm (đăng ký
→ duyệt sản phẩm → giỏ hàng → đặt hàng → reservation → thanh toán giả lập → xác nhận).

- [ ] **Step 2: Tạo `docs/MONTH1_INTERVIEW_QUIZ.md`** — tự trả lời (không tra cứu) rồi
đối chiếu, ít nhất các câu sau (đúng tinh thần
`PROJECT_QUIZ_AND_INTERVIEW_QUESTIONS.md` của dự án mẫu):
  1. Vì sao access token và refresh token có thời gian sống khác nhau? Đánh đổi gì?
  2. `SELECT ... FOR UPDATE` giải quyết vấn đề gì mà đọc-rồi-ghi thường không giải quyết được?
  3. Vì sao `order_items` phải snapshot dữ liệu thay vì tham chiếu `Product` hiện tại?
  4. Idempotency-Key và unique constraint `(gateway, transactionRef)` giải quyết 2 vấn đề
     khác nhau nào (client retry vs webhook duplicate)?
  5. Vì sao JSONB cần validate ở tầng application, PostgreSQL không tự làm việc đó?
  6. Nếu bỏ `prisma.$transaction` ở Task 13, kịch bản lỗi cụ thể nào sẽ xảy ra?

- [ ] **Step 3: Đối chiếu với roadmap tổng thể** — mở lại
`docs/superpowers/specs/2026-08-21-miniecom-month1-mvp-design.md` mục G, xác nhận đã
hoàn thành đúng phạm vi Tháng 1, và những gì sẽ học ở Giai đoạn 2 (thanh toán thật).

- [ ] **Step 4: Commit cuối cùng**

```bash
git add -A
git commit -m "docs(buoi-20): readme tong ket + quiz phong van thang 1"
```

---
## Self-review (cập nhật sau khi đổi hướng 2026-08-22)

- **Spec coverage (đợt hiện tại):** đối chiếu spec
  `2026-08-22-blog-gallery-deploy-reorder-design.md` — schema BlogPost/GalleryItem
  (Task 6), CRUD blog (Task 7), upload+gallery CRUD (Task 8), frontend public+SEO
  (Task 9), gallery public+admin login (Task 10), form đăng bài (Task 11), sitemap/
  robots/review SEO-mobile (Task 12), deploy backend (Task 13), deploy frontend
  (Task 14), tổng kết (Task 15) — đủ 10 buổi (Buổi 6-15), không thiếu mục nào trong
  phạm vi đã chốt (SEO + mobile-friendly có mặt xuyên suốt Task 9, 10, 12).
- **Placeholder scan:** không còn "TBD"/placeholder — mọi step có code cụ thể; các domain
  mẫu (`miniecom-blog.vercel.app`, `miniecom-backend.onrender.com`) được ghi chú rõ là cần
  thay bằng domain thật sau khi deploy (Task 13/14), không phải placeholder bỏ sót.
- **Type/interface consistency:** `apiClient` (Task 9) dùng lại ở Task 10/12; `authFetch`/
  `getToken`/`setTokens` (Task 10) dùng lại nguyên vẹn ở Task 11; endpoint
  `POST /api/v1/uploads/image` (Task 8) được cả form blog lẫn form gallery ở Task 11 gọi
  đúng cùng 1 cách (FormData, không set Content-Type tay) — khớp nhau giữa nơi định nghĩa
  và nơi gọi.
- **Nội dung Giai đoạn 2 (archive bên dưới):** giữ nguyên từ bản gốc, đã tự review đầy đủ
  ở lần viết plan trước (xem lịch sử) — không review lại vì nội dung không đổi, chỉ dời vị
  trí trong file.
