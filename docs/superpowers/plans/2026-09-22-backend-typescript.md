# Chuyển backend sang TypeScript — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển toàn bộ 43 file backend từ JavaScript sang TypeScript với `strict: true`, không đổi một dòng hành vi nào.

**Architecture:** Chuyển từ dưới lên — tầng không phụ thuộc ai (`utils`, `config`) trước, tầng gọi nhiều thứ nhất (`routes`, `app`) sau cùng. `tsx` chạy lúc dev, `tsc --noEmit` kiểm kiểu. Giữ nguyên CommonJS (`require`/`module.exports`) để không trộn hai thay đổi lớn vào một lần.

**Tech Stack:** TypeScript strict, tsx, Express 5, Prisma 7.9.1, Node v26.

**Phạm vi:** CHỈ thư mục `backend/`. Frontend có kế hoạch riêng sau.

## Global Constraints

- **Không đổi hành vi.** Đây là chuyển đổi ngôn ngữ, không phải refactor logic. Thấy code dở cũng để nguyên — sửa logic lẫn vào sẽ không biết lỗi do đâu khi có sự cố.
- **`strict: true` ngay từ đầu.** Mục tiêu của user là học TypeScript cho dự án sau; nới lỏng rồi siết sau sẽ dạy thói quen ép kiểu cho xong.
- **Cấm `any`.** Gặp chỗ khó thì dùng `unknown` rồi thu hẹp dần, hoặc dừng lại hỏi. Một `any` lọt vào là cả file mất tác dụng bảo vệ.
- **Giữ CommonJS.** Vẫn `require`/`module.exports`, không đổi sang `import`/`export`. Đổi hệ module là thay đổi riêng, làm sau.
- **Import KHÔNG ghi đuôi file.** Viết `require('../utils/asyncHandler')` như cũ. `tsx` lo phần tìm file. (Node chạy `.ts` trực tiếp thì KHÔNG tìm được import không đuôi — đã kiểm chứng — nên bắt buộc chạy qua `tsx`.)
- **Không có test nào trong repo.** Lưới an toàn là: `tsc --noEmit` sạch + server khởi động được + curl vài endpoint. Mỗi task phải làm đủ ba thứ đó trước khi commit.
- **Commit message:** tiếng Anh, 1-2 câu, KHÔNG prefix `feat(`/`fix(`, KHÔNG bullet list, KHÔNG dòng Co-Authored-By.
- **Comment trong code:** tiếng Việt, ngắn, giải thích **vì sao**. Giữ nguyên mọi comment đang có — chúng là tài liệu của dự án.
- **Đang chạy production thật.** Không push lên `main` giữa chừng; làm trọn trên nhánh riêng.

---

## File Structure

| Thư mục | File | Ghi chú |
|---|---|---|
| `utils/` | 3 | Không phụ thuộc gì — làm trước |
| `config/`, `constants/` | 3 | Chỉ phụ thuộc thư viện ngoài |
| `types/` | **tạo mới** | Khai báo mở rộng `Request` của Express |
| `middlewares/` | 7 | Nơi `req.user` được gán |
| `services/` | 3 | jwt, token, prisma |
| `controllers/` | 11 | Phần nhiều nhất, chia hai đợt |
| `routes/` | 12 | Gọi controller |
| `app.js`, `bin/www`, `workers/`, `scripts/` | 4 | Điểm khởi động, làm cuối |

---

## Task 1: Nền — cài công cụ và bật kiểm kiểu

**Files:**
- Create: `backend/tsconfig.json`
- Modify: `backend/package.json`
- Create: `backend/types/express.d.ts`

**Interfaces:**
- Produces: lệnh `npm run typecheck` (chạy `tsc --noEmit`), lệnh `npm run dev` chạy qua `tsx`.
- Produces: `Express.Request` có thêm `user?: { id: string; role: string }` và `brand?: { slug: string; categoryIds: string[] }` — mọi middleware và controller sau này dựa vào.

- [ ] **Step 1: Cài công cụ**

```bash
cd backend && npm install -D typescript tsx @types/node @types/express @types/multer @types/bcryptjs @types/jsonwebtoken @types/cors @types/compression @types/cookie-parser @types/morgan
```

- [ ] **Step 2: Tạo `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2023"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "allowJs": true,
    "checkJs": false,
    "noEmit": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "typeRoots": ["./node_modules/@types", "./types"]
  },
  "include": ["**/*.ts", "**/*.js", "types/**/*.d.ts"],
  "exclude": ["node_modules", "dist"]
}
```

`allowJs` + `checkJs: false` cho phép file `.js` chưa chuyển vẫn nằm cạnh file `.ts` mà không bị báo lỗi — đó là thứ làm cho việc chuyển từng phần khả thi.

- [ ] **Step 3: Thêm script vào `backend/package.json`**

Trong khối `"scripts"`, đổi `dev` và thêm `typecheck`:

```json
"dev": "nodemon --watch . --ext ts,js --exec tsx ./bin/www",
"typecheck": "tsc --noEmit",
```

Giữ nguyên `"start": "node ./bin/www"` — sẽ sửa ở Task 8 khi `bin/www` thành TypeScript.

- [ ] **Step 4: Tạo `backend/types/express.d.ts`**

```ts
// Mở rộng kiểu Request của Express để TypeScript biết về hai trường mà middleware tự gắn
// vào. Không khai ở đây thì mọi controller đọc req.user sẽ báo lỗi "property does not exist".
//
// Cả hai đều để optional: cùng một kiểu Request được dùng cho cả route công khai lẫn route
// có xác thực, nên TypeScript sẽ bắt chỗ nào đọc req.user mà chưa kiểm tra tồn tại — đúng
// loại lỗi đã làm /auth/me trả 500 suốt một thời gian vì đọc nhầm req.user.sub.
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
      brand?: { slug: string; categoryIds: string[] };
    }
  }
}

export {};
```

- [ ] **Step 5: Xác minh `tsx` chạy được app hiện tại (vẫn toàn JavaScript)**

```bash
cd backend && npx tsx ./bin/www
```
Expected: in ra `Server đang chạy tại http://localhost:4000`. Bấm Ctrl+C để dừng.

Nếu bước này lỗi thì DỪNG LẠI báo người dùng — cả kế hoạch dựa vào việc `tsx` chạy được codebase hiện tại.

- [ ] **Step 6: Xác minh kiểm kiểu chạy được**

```bash
cd backend && npm run typecheck
```
Expected: không in ra lỗi nào (chưa có file `.ts` nào ngoài khai báo kiểu).

- [ ] **Step 7: Commit**

```bash
git add backend/tsconfig.json backend/types backend/package.json backend/package-lock.json
git commit -m "Set up TypeScript with strict checking for the backend"
```

---

## Task 2: `utils/` — ba file nhỏ nhất, không phụ thuộc gì

**Files:**
- Rename + modify: `backend/utils/asyncHandler.js` → `.ts`
- Rename + modify: `backend/utils/ApiError.js` → `.ts`
- Rename + modify: `backend/utils/ApiResponse.js` → `.ts`

**Interfaces:**
- Consumes: `Express.Request` mở rộng từ Task 1.
- Produces: `asyncHandler(fn)` nhận `(req, res, next) => Promise<unknown>`, trả `RequestHandler`.
- Produces: `class ApiError extends Error` với `status: number`, `code: string`, `details: unknown`.
- Produces: `sendSuccess(res, data, meta?, status?)`.

- [ ] **Step 1: Chuyển `utils/asyncHandler.ts`**

```bash
cd backend && git mv utils/asyncHandler.js utils/asyncHandler.ts
```

Giữ nguyên mọi comment đang có, đổi phần code thành:

```ts
import type { Request, Response, NextFunction, RequestHandler } from 'express';

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
```

- [ ] **Step 2: Chuyển `utils/ApiError.ts`**

```bash
cd backend && git mv utils/ApiError.js utils/ApiError.ts
```

```ts
class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = ApiError;
```

- [ ] **Step 3: Chuyển `utils/ApiResponse.ts`**

```bash
cd backend && git mv utils/ApiResponse.js utils/ApiResponse.ts
```

```ts
import type { Response } from 'express';

function sendSuccess(res: Response, data: unknown, meta: unknown = null, status = 200) {
  return res.status(status).json({ data, meta, error: null });
}

module.exports = { sendSuccess };
```

- [ ] **Step 4: Kiểm kiểu**

```bash
cd backend && npm run typecheck
```
Expected: không lỗi.

- [ ] **Step 5: Khởi động server và thử endpoint**

```bash
cd backend && npx tsx ./bin/www &
sleep 6
curl -s -o /dev/null -w "products: %{http_code}\n" "http://localhost:4000/api/v1/products?pageSize=1"
curl -s -o /dev/null -w "blog: %{http_code}\n" "http://localhost:4000/api/v1/blog?pageSize=1"
kill %1
```
Expected: cả hai trả `200`. Đây là phép thử thật sự — `utils/` được mọi controller dùng, nó hỏng thì mọi endpoint hỏng.

- [ ] **Step 6: Commit**

```bash
git add backend/utils
git commit -m "Convert the shared utilities to TypeScript"
```

---

## Task 3: `config/`, `constants/`, `services/prisma`

**Files:**
- Rename + modify: `backend/config/env.js` → `.ts`
- Rename + modify: `backend/constants/order.js` → `.ts`
- Rename + modify: `backend/constants/product.js` → `.ts`
- Rename + modify: `backend/services/prisma.js` → `.ts`

**Interfaces:**
- Produces: `config/env` xuất `port`, `databaseUrl`, `jwtAccessSecret`, `jwtRefreshSecret`, `cloudinary` — tất cả kiểu `string | undefined` trừ `port`.
- Produces: `constants/order` xuất `ORDER_STATUS`, `PAYMENT_METHOD`, `PAYMENT_STATUS`, `ORDER_TRANSITIONS`, `PAYMENT_WINDOW_HOURS`, `SWEEP_INTERVAL_MINUTES`, `SHIPPING_FEE_NOT_CALCULATED` — dùng `as const` để TypeScript biết giá trị cụ thể chứ không chỉ là `string`.
- Produces: `services/prisma` xuất instance `PrismaClient` đã gắn adapter.

- [ ] **Step 1: Chuyển `config/env.ts`**

```bash
cd backend && git mv config/env.js config/env.ts
```

Giữ nguyên toàn bộ comment dài đang có ở đầu file. Phần code không cần chú thích kiểu — TypeScript tự suy ra `string | undefined` từ `process.env`.

- [ ] **Step 2: Chuyển hai file constants**

```bash
cd backend && git mv constants/order.js constants/order.ts && git mv constants/product.js constants/product.ts
```

Thêm `as const` vào các object hằng số. Ví dụ với `PRODUCT_STATUS`:

```ts
const PRODUCT_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  ARCHIVED: 'archived',
} as const;
```

`as const` khiến kiểu là `'draft' | 'active' | 'archived'` thay vì `string`. Nhờ đó so sánh nhầm một chuỗi không tồn tại sẽ bị bắt ngay lúc viết.

- [ ] **Step 3: Chuyển `services/prisma.ts`**

```bash
cd backend && git mv services/prisma.js services/prisma.ts
```

Giữ nguyên comment. Chỉ cần sửa dòng lấy `databaseUrl` nếu TypeScript báo nó có thể `undefined`:

```ts
const { databaseUrl } = require('../config/env');

if (!databaseUrl) {
  throw new Error('Thiếu DATABASE_URL — server không thể khởi động mà không có database.');
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
```

Ném lỗi ngay lúc khởi động tốt hơn là để Prisma báo lỗi khó hiểu ở request đầu tiên.

- [ ] **Step 4: Kiểm kiểu**

```bash
cd backend && npm run typecheck
```
Expected: không lỗi.

- [ ] **Step 5: Khởi động và thử**

```bash
cd backend && npx tsx ./bin/www &
sleep 6
curl -s -o /dev/null -w "products: %{http_code}\n" "http://localhost:4000/api/v1/products?pageSize=1"
kill %1
```
Expected: `200`. Nếu server không khởi động được, gần như chắc là do `databaseUrl` — kiểm tra `.env`.

- [ ] **Step 6: Commit**

```bash
git add backend/config backend/constants backend/services/prisma.ts
git commit -m "Convert configuration and constants to TypeScript"
```

---

## Task 4: `middlewares/` — nơi `req.user` được gán

**Files:**
- Rename + modify cả 7 file trong `backend/middlewares/`

**Interfaces:**
- Consumes: `Express.Request` mở rộng (Task 1), `ApiError` (Task 2).
- Produces: `authenticate` gán `req.user = { id, role }`; `optionalAuthenticate` gán hoặc bỏ qua; `resolveBrand` gán `req.brand = { slug, categoryIds }`.

- [ ] **Step 1: Chuyển từng file**

```bash
cd backend && for f in authenticate errorHandler notFound optionalAuthenticate requireRole resolveBrand upload validate; do git mv middlewares/$f.js middlewares/$f.ts; done
```

- [ ] **Step 2: Thêm kiểu cho `authenticate.ts`**

Giữ nguyên comment dài đang có. Phần hàm:

```ts
import type { Request, Response, NextFunction } from 'express';

function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'UNAUTHENTICATED', 'Missing access token'));
  }

  try {
    const payload = verifyAccessToken(token) as { sub: string; role: string };
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new ApiError(401, 'UNAUTHENTICATED', 'Access token is invalid or expired'));
  }
}
```

Chú ý `payload.sub` → `req.user.id`. Đây chính là chỗ từng sai: có lúc code khác đọc `req.user.sub` (không tồn tại) làm `/auth/me` trả 500. Sau task này TypeScript sẽ bắt lỗi đó ngay lúc gõ.

- [ ] **Step 3: Thêm kiểu cho `errorHandler.ts`**

Tham số đầu là lỗi nên phải nhận `unknown` rồi thu hẹp, không được dùng `any`:

```ts
import type { Request, Response, NextFunction } from 'express';

function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  const e = err as { status?: number; code?: string; message?: string; details?: unknown };
  const status = e.status ?? 500;
  // ... giữ nguyên phần thân hiện có
}
```

- [ ] **Step 4: Thêm kiểu cho 5 file còn lại**

Tất cả theo cùng khuôn: `(req: Request, res: Response, next: NextFunction)`. Riêng `requireRole` là hàm trả về middleware nên kiểu là `(role: string): RequestHandler`.

- [ ] **Step 5: Kiểm kiểu**

```bash
cd backend && npm run typecheck
```
Expected: không lỗi. Nếu báo `req.user` có thể `undefined` ở đâu đó — đó là TypeScript làm đúng việc, xử lý bằng cách kiểm tra tồn tại chứ KHÔNG dùng `!` hay `as`.

- [ ] **Step 6: Thử cả đường công khai lẫn đường cần xác thực**

```bash
cd backend && npx tsx ./bin/www &
sleep 6
curl -s -o /dev/null -w "cong khai:        %{http_code}\n" "http://localhost:4000/api/v1/products?pageSize=1"
curl -s -o /dev/null -w "thieu token (401): %{http_code}\n" "http://localhost:4000/api/v1/quote-requests/mine" -H "X-Brand-Slug: gom-su-trang-tri"
curl -s -o /dev/null -w "thieu brand (400): %{http_code}\n" "http://localhost:4000/api/v1/quote-requests" -X POST -H "Content-Type: application/json" -d '{}'
kill %1
```
Expected: `200`, `401`, `400`. Ba con số này chứng minh cả `authenticate` lẫn `resolveBrand` còn hoạt động.

- [ ] **Step 7: Commit**

```bash
git add backend/middlewares
git commit -m "Convert the middlewares to TypeScript"
```

---

## Task 5: `services/jwt` và `services/token`

**Files:**
- Rename + modify: `backend/services/jwt.service.js` → `.ts`
- Rename + modify: `backend/services/token.service.js` → `.ts`

**Interfaces:**
- Produces: `signAccessToken(payload: { sub: string; role: string }): string`, `verifyAccessToken(token: string)`, `signRefreshToken`, `verifyRefreshToken`.
- Produces: `issueRefreshToken(userId: string): Promise<string>`, `rotateRefreshToken(rawToken: string)`, `revokeRefreshToken(rawToken: string)`.

- [ ] **Step 1: Chuyển hai file**

```bash
cd backend && git mv services/jwt.service.js services/jwt.service.ts && git mv services/token.service.js services/token.service.ts
```

- [ ] **Step 2: Thêm kiểu cho `jwt.service.ts`**

Giữ nguyên comment. Khai kiểu payload rõ ràng:

```ts
import jwt from 'jsonwebtoken';

type AccessPayload = { sub: string; role: string };

function signAccessToken(payload: AccessPayload): string {
  if (!jwtAccessSecret) throw new Error('Thiếu JWT_ACCESS_SECRET');
  return jwt.sign(payload, jwtAccessSecret, { expiresIn: ACCESS_TOKEN_TTL });
}
```

TypeScript sẽ bắt buộc kiểm tra secret khác `undefined` — trước đây ký bằng `undefined` sẽ hỏng lúc chạy mà không ai biết.

- [ ] **Step 3: Thêm kiểu cho `token.service.ts`**

Các hàm đều `async` nên kiểu trả về là `Promise<...>`. Giữ nguyên toàn bộ comment về cơ chế xoay vòng token.

- [ ] **Step 4: Kiểm kiểu**

```bash
cd backend && npm run typecheck
```

- [ ] **Step 5: Thử luồng đăng nhập (dùng cả hai service)**

```bash
cd backend && npx tsx ./bin/www &
sleep 6
curl -s -o /dev/null -w "sai mat khau (401): %{http_code}\n" -X POST "http://localhost:4000/api/v1/auth/login" -H "Content-Type: application/json" -d '{"email":"khong-ton-tai@test.com","password":"Sai1234!"}'
curl -s -o /dev/null -w "refresh hong (401): %{http_code}\n" -X POST "http://localhost:4000/api/v1/auth/refresh" -H "Content-Type: application/json" -d '{"refreshToken":"hong"}'
kill %1
```
Expected: cả hai `401`. Nếu ra `500` thì có lỗi thật — 500 nghĩa là ngoại lệ không bắt được, không phải từ chối đúng cách.

- [ ] **Step 6: Commit**

```bash
git add backend/services
git commit -m "Convert the token services to TypeScript"
```

---

## Task 6: `controllers/` đợt một — năm file nhỏ

**Files:**
- Rename + modify: `auth.controller.js`, `setting.controller.js`, `upload.controller.js`, `contact.controller.js`, `category.controller.js` → `.ts`

**Interfaces:**
- Consumes: `asyncHandler`, `ApiError`, `sendSuccess`, `prisma`, `Express.Request` mở rộng.
- Produces: không có gì mới — các controller vẫn xuất đúng tên hàm như cũ.

- [ ] **Step 1: Chuyển năm file**

```bash
cd backend && for f in auth setting upload contact category; do git mv controllers/$f.controller.js controllers/$f.controller.ts; done
```

- [ ] **Step 2: Thêm kiểu — khuôn chung cho mọi controller**

Với hàm bọc trong `asyncHandler`, chỉ cần chú thích hai tham số:

```ts
const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Chưa đăng nhập');
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  ...
});
```

Dòng `if (!req.user)` là bắt buộc vì `req.user` là optional. **Không được dùng `req.user!`** — dấu `!` tắt đúng cái bảo vệ mà ta vừa dựng lên.

- [ ] **Step 3: Kiểm kiểu**

```bash
cd backend && npm run typecheck
```

- [ ] **Step 4: Thử các endpoint thuộc năm controller này**

```bash
cd backend && npx tsx ./bin/www &
sleep 6
curl -s -o /dev/null -w "categories:       %{http_code}\n" "http://localhost:4000/api/v1/categories"
curl -s -o /dev/null -w "settings:         %{http_code}\n" "http://localhost:4000/api/v1/settings?keys=homepage_hero"
curl -s -o /dev/null -w "auth/me (401):    %{http_code}\n" "http://localhost:4000/api/v1/auth/me"
kill %1
```
Expected: `200`, `200`, `401`.

- [ ] **Step 5: Commit**

```bash
git add backend/controllers
git commit -m "Convert the smaller controllers to TypeScript"
```

---

## Task 7: `controllers/` đợt hai — sáu file lớn

**Files:**
- Rename + modify: `product.controller.js` (410 dòng), `order.controller.js` (295), `quoteRequest.controller.js` (243), `blog.controller.js` (226), `cart.controller.js` (156), `gallery.controller.js` (134) → `.ts`

**Interfaces:**
- Consumes: giống Task 6, thêm `req.brand` cho `cart`, `order`, `quoteRequest`.

- [ ] **Step 1: Chuyển sáu file**

```bash
cd backend && for f in product order quoteRequest blog cart gallery; do git mv controllers/$f.controller.js controllers/$f.controller.ts; done
```

- [ ] **Step 2: Thêm kiểu, xử lý `req.brand`**

Ba controller dùng brand phải kiểm tra tồn tại:

```ts
const getCart = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !req.brand) throw new ApiError(401, 'UNAUTHENTICATED', 'Chưa đăng nhập');
  const cart = await prisma.cart.findUnique({
    where: { userId_brandSlug: { userId: req.user.id, brandSlug: req.brand.slug } },
    ...
  });
});
```

- [ ] **Step 3: Xử lý dữ liệu JSON của Prisma**

`product.attributes`, `quoteRequest.items`, `order.shippingAddress` là cột JSON nên Prisma cho kiểu `JsonValue` — không đọc thẳng thuộc tính được. Khai kiểu riêng rồi ép một lần tại chỗ đọc:

```ts
type QuoteItem = {
  variantId: string;
  sku: string;
  productName: string;
  productSlug: string;
  variantLabel: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  imageUrl: string | null;
};

const items = row.items as QuoteItem[];
```

Ép kiểu được phép ở những chỗ HẸP mà bốn ràng buộc (cấm any, cấm !, không đổi hành vi, kiểu
chặt) không thể cùng thoả — điển hình là cột JSON của Prisma và các thư viện ngoài khai kiểu
lỏng hơn thực tế. MỖI chỗ ép kiểu phải có comment tiếng Việt nói rõ vì sao không tránh được.
(Luật này được nới ở Task 6 sau khi gặp hai chỗ kẹt thật: Cloudinary khai  optional
mà code gốc không kiểm tra null, và  của Express có thể là mảng.) Đặt kiểu `QuoteItem` ngay cạnh chỗ dùng để người đọc thấy được hình dạng mong đợi.

- [ ] **Step 4: Kiểm kiểu**

```bash
cd backend && npm run typecheck
```

- [ ] **Step 5: Thử endpoint của cả sáu controller**

```bash
cd backend && npx tsx ./bin/www &
sleep 6
B="X-Brand-Slug: gom-su-trang-tri"
curl -s -o /dev/null -w "products:          %{http_code}\n" "http://localhost:4000/api/v1/products?pageSize=1"
curl -s -o /dev/null -w "blog:              %{http_code}\n" "http://localhost:4000/api/v1/blog?pageSize=1"
curl -s -o /dev/null -w "gallery:           %{http_code}\n" "http://localhost:4000/api/v1/gallery?pageSize=1"
curl -s -o /dev/null -w "cart (401):        %{http_code}\n" "http://localhost:4000/api/v1/cart" -H "$B"
curl -s -o /dev/null -w "quote thieu ten (400): %{http_code}\n" -X POST "http://localhost:4000/api/v1/quote-requests" -H "$B" -H "Content-Type: application/json" -d '{"phone":"0900000000"}'
kill %1
```
Expected: `200`, `200`, `200`, `401`, `400`.

- [ ] **Step 6: Commit**

```bash
git add backend/controllers
git commit -m "Convert the remaining controllers to TypeScript"
```

---

## Task 8: `routes/`, `app`, `bin/www`, `workers/`, `scripts/`

**Files:**
- Rename + modify: cả 12 file trong `backend/routes/`
- Rename + modify: `backend/app.js` → `.ts`
- Rename + modify: `backend/bin/www` → `backend/bin/www.ts`
- Rename + modify: `backend/workers/releaseExpiredOrders.js` → `.ts`
- Rename + modify: `backend/scripts/seedAdmin.js` → `.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: không còn file `.js` nào trong `backend/` ngoài `node_modules`.

- [ ] **Step 1: Chuyển routes**

```bash
cd backend && for f in routes/*.js; do git mv "$f" "${f%.js}.ts"; done
```

Routes hầu như không cần chú thích kiểu — `express.Router()` đã có kiểu sẵn. Chỗ cần sửa là các hàm `body(...).custom(...)` của express-validator:

```ts
body('confirmPassword').custom((val: string, { req }) => val === req.body.password)
```

- [ ] **Step 2: Chuyển `app.ts` và `workers`, `scripts`**

```bash
cd backend && git mv app.js app.ts && git mv workers/releaseExpiredOrders.js workers/releaseExpiredOrders.ts && git mv scripts/seedAdmin.js scripts/seedAdmin.ts
```

- [ ] **Step 3: Chuyển `bin/www` — file khởi động**

```bash
cd backend && git mv bin/www bin/www.ts
```

File này vốn không có đuôi. Đổi thành `.ts` làm mọi công cụ hiểu đúng nó là gì.

- [ ] **Step 4: Cập nhật script trong `package.json`**

```json
"start": "tsx ./bin/www.ts",
"dev": "nodemon --watch . --ext ts --exec tsx ./bin/www.ts",
"typecheck": "tsc --noEmit",
```

`start` cũng phải chạy qua `tsx` vì Node không tự tìm được import không ghi đuôi trong file `.ts`.

Thêm `tsx` vào `dependencies` chứ không phải `devDependencies` — production cần nó để chạy:

```bash
cd backend && npm install tsx
```

- [ ] **Step 5: Kiểm kiểu lần cuối**

```bash
cd backend && npm run typecheck
```
Expected: không lỗi.

- [ ] **Step 6: Xác nhận không còn file JavaScript nào**

```bash
cd backend && find . -name "*.js" -not -path "./node_modules/*" | grep -v "^./prisma" || echo "khong con file .js nao"
```
Expected: `khong con file .js nao`.

- [ ] **Step 7: Chạy thử toàn bộ bằng đúng lệnh production**

```bash
cd backend && npm start &
sleep 8
B="X-Brand-Slug: gom-su-trang-tri"
for e in "/products?pageSize=1" "/blog?pageSize=1" "/gallery?pageSize=1" "/categories" "/settings?keys=homepage_hero"; do
  printf "  %-34s " "$e"; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4000/api/v1$e"
done
curl -s -o /dev/null -w "  auth/me (401):                   %{http_code}\n" "http://localhost:4000/api/v1/auth/me"
curl -s -o /dev/null -w "  cart thieu token (401):          %{http_code}\n" "http://localhost:4000/api/v1/cart" -H "$B"
kill %1
```
Expected: năm cái đầu `200`, hai cái sau `401`.

- [ ] **Step 8: Chạy thử frontend nối vào backend TypeScript**

```bash
cd frontend-gomsu && npm run dev &
sleep 15
for p in / /san-pham /yeu-cau-tu-van; do printf "  %-18s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3001$p"; done
kill %1
```
Expected: cả ba `200`. Frontend chưa đổi gì nên nó là phép thử độc lập rằng API không đổi hành vi.

- [ ] **Step 9: Commit**

```bash
git add backend
git commit -m "Convert routes, app and the entry point to TypeScript"
```

---

## Kiểm tra cuối

- [ ] `cd backend && npm run typecheck` → không lỗi
- [ ] `cd backend && grep -rn ": any" --include="*.ts" . | grep -v node_modules` → không kết quả (cấm `any`)
- [ ] `cd backend && grep -rn "req.user!" --include="*.ts" . | grep -v node_modules` → không kết quả (cấm `!` né kiểm tra)
- [ ] `find backend -name "*.js" -not -path "*/node_modules/*" | grep -v prisma` → rỗng
- [ ] `npm start` chạy được và 5 endpoint công khai trả `200`
- [ ] Frontend chạy được, 3 trang trả `200`
- [ ] Mọi comment tiếng Việt trong code cũ còn nguyên — dùng `git diff --stat main` xem số dòng xoá có bất thường không

## Sau khi xong

Frontend là kế hoạch riêng: 62 file, Next.js 16 + React 19, thách thức khác hẳn (kiểu cho props, hook, Server Component). Làm sau khi backend chạy ổn định vài ngày trên production.

Và theo quyết định tách petshop theo đường A, **nên chuyển backend xong rồi mới nhân bản cho petshop** — làm ngược lại thì phải chuyển đổi hai lần.
