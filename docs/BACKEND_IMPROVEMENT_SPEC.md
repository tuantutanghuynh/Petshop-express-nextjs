# Cải thiện backend — Spec v2

- **Ngày:** 2026-11-04 · **Trạng thái:** đề xuất, chờ duyệt từng nhóm
- **Thay cho:** v1 (giữ ở `docs/BACKEND_IMPROVEMENT_SPEC.v1.md`)
- **Nguyên tắc:** đo trước, tối ưu sau. Mỗi nhóm có tiêu chí nghiệm thu chạy được. Việc nhạy cảm (rate limit, auth, migration, dependency mới) = LARGE: plan riêng + chờ "go" + ADR.

---

## 1. Hiện trạng đã đo (2026-11-04, DB dev)

| Chỉ số | Giá trị | Ý nghĩa |
|---|---|---|
| Số danh mục / sản phẩm | 57 / 14 | Dữ liệu còn rất nhỏ |
| Đọc toàn bảng `Category` | 0,022 ms | Cache danh mục chưa đem lại gì |
| `WHERE status='active' AND "searchName" LIKE '%pate%'` | 0,020 ms | Index tìm kiếm chưa đem lại gì |
| Bảng thử 100 000 dòng: không index / GIN trigram, từ khoá 4 chữ | 6,5 ms / 1,5 ms | Trigram có ích khi dữ liệu lớn |
| Bảng thử 100 000 dòng, GIN trigram, từ khoá 2 chữ (`%pa%`) | 6,2 ms, **Seq Scan** | Trigram cần ≥ 3 ký tự; API đang cho tìm từ 2 |
| Instance backend | 1, chưa deploy production | Các mục "scale-out" chưa có điều kiện để cần |

Trang công khai đọc dữ liệu qua Next.js ISR (`revalidate` + tag), nên phần lớn lượt xem không chạm Express.

## 2. Rà soát v1

| Mục v1 | Kết luận |
|---|---|
| 3.1 Cache danh mục trong RAM | Hoãn. Không có lợi ở quy mô hiện tại; cache theo tiến trình làm sai phạm vi shop khi nhiều instance (chỉ instance ghi được xoá cache); lệnh ghi danh mục nằm ở `services/categoryAdmin.service.ts` và script seed (v1 ghi nhầm controller); test DB tạo danh mục trực tiếp nên sẽ đọc cache cũ. Xem mục 6.2. |
| 3.2 GIN trigram | Hoãn tới khi đủ lớn (mục 6.1). v1 sai ở: "O(log N)", tiêu chí EXPLAIN không đạt với 14 dòng, từ khoá 2 chữ không dùng được index, index chỉ có trong SQL dễ bị Prisma coi là lệch schema. |
| 3.3 Graceful shutdown + health | Giữ, sửa thiết kế (mục 3.2). Transaction bị cắt thì Postgres tự rollback — rủi ro là request lỗi, không phải hỏng dữ liệu. |
| 3.4 Gỡ `bcrypt`, xoá code chết JWT | Giữ (mục 3.1). Đã kiểm: không file nào import `bcrypt`; `signRefreshToken` / `verifyRefreshToken` không ai gọi. |
| 4.1 Tách service đơn / giỏ | Giữ hướng, **bỏ code mẫu v1** (mục 5). Code mẫu v1 mất 4 lớp bảo vệ đang có. |
| 4.2 Pino + request ID | Giữ (mục 4.3), khớp CLAUDE.md §6. |
| 4.3 Pool kết nối | Giữ, đơn giản hoá (mục 3.3): `PrismaPg` nhận thẳng `PoolConfig`. |
| 5.1 Worker riêng, 5.2 Redis rate limit, 5.3 upload thẳng Cloudinary | Hoãn tới khi có ≥ 2 instance / upload nhiều (mục 6). Worker hiện đã an toàn khi nhiều instance nhờ UPDATE có điều kiện. |
| 5.4 Email | **Nâng lên trước production** (mục 4.1): quên mật khẩu hiện không dùng được ở production. |

---

## 3. Nhóm 1 — Làm ngay (nhỏ, an toàn, không đổi hành vi nghiệp vụ)

### 3.1 Gỡ `bcrypt` và code chết
- `backend/package.json`: bỏ `"bcrypt"` (giữ `bcryptjs`, `@types/bcryptjs`). Chạy `npm uninstall bcrypt` (người dùng chạy — thay đổi dependency).
- `backend/services/jwt.service.ts`: xoá `signRefreshToken`, `verifyRefreshToken` và tên của chúng trong `export default`. Đã kiểm: `jwtRefreshSecret` (`JWT_REFRESH_SALT`) chỉ hai hàm này dùng (refresh token thật là chuỗi ngẫu nhiên băm trong `token.service.ts`) → bỏ luôn khỏi `config/env.ts` và `.env.example`; biến còn trong `.env` của các môi trường thì vô hại, người dùng tự xoá.
- **Nghiệm thu:** `grep -rn "from 'bcrypt'"` rỗng; typecheck, `npm test`, `npm run test:db` pass.

### 3.2 Graceful shutdown + `/health/ready`
**Bài toán:** `bin/www.ts` không giữ `server`, không bắt `SIGTERM` / `SIGINT`; khi nền tảng deploy dừng tiến trình, request đang chạy bị cắt, kết nối DB không trả.

**Thiết kế:**
- `backend/utils/lifecycle.ts`: cờ dùng chung, để `app.ts` đọc mà không import `bin/www.ts`.
- `/health` giữ nguyên (liveness, không chạm DB). Thêm `/health/ready`: 503 khi đang tắt hoặc DB không trả lời, 200 khi sẵn sàng.
- Tắt theo thứ tự: bật cờ → dừng sweeper → `server.close()` (Node ≥ 19 tự đóng kết nối keep-alive rảnh) → `prisma.$disconnect()` → thoát; quá 15 s thì thoát mã 1.

```ts
// backend/utils/lifecycle.ts
// Set once SIGTERM / SIGINT arrives, so /health/ready can tell the load balancer to stop sending
// traffic while in-flight requests finish.
let shuttingDown = false;
export const markShuttingDown = (): void => { shuttingDown = true; };
export const isShuttingDown = (): boolean => shuttingDown;
```

```ts
// backend/bin/www.ts
import app from '../app';
import { port } from '../config/env';
import prisma from '../services/prisma';
import { isShuttingDown, markShuttingDown } from '../utils/lifecycle';
import { startExpiredOrderSweeper } from '../workers/releaseExpiredOrders';

const SHUTDOWN_GRACE_MS = 15_000;

const server = app.listen(port, () => console.log(`Server đang chạy tại http://localhost:${port}`));
// (giữ comment hiện có về việc sweeper chạy trong tiến trình web)
const sweeper = startExpiredOrderSweeper();

function shutdown(signal: string): void {
  if (isShuttingDown()) return;
  markShuttingDown();
  console.log(`${signal}: stopping — finishing in-flight requests`);
  clearInterval(sweeper);
  server.close((err) => {
    prisma.$disconnect().finally(() => process.exit(err ? 1 : 0));
  });
  // Requests still running after the grace period are cut rather than holding the deploy.
  setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

```ts
// backend/app.ts — cạnh /health
app.get('/health/ready', asyncHandler(async (_req: Request, res: Response) => {
  if (isShuttingDown()) return void res.status(503).json({ status: 'shutting-down' });
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'db-unavailable' });
  }
}));
```
(`catch` không nuốt lỗi: lỗi chính là kết quả 503. Không trả chi tiết lỗi DB.)

- **Nghiệm thu:** test supertest DB-free: `/health/ready` trả 503 sau `markShuttingDown()`; test DB: 200 khi DB sống. Thủ công: chạy server, gửi một request chậm, `kill -TERM <pid>` → request vẫn nhận 200, tiến trình thoát mã 0, log có dòng `SIGTERM: stopping`.

### 3.3 Cấu hình pool + timeout câu lệnh
```ts
// backend/services/prisma.ts
const adapter = new PrismaPg({
  connectionString: databaseUrl,
  max: dbPoolMax,                 // config/env.ts: DB_POOL_MAX, mặc định 10
  connectionTimeoutMillis: 5_000, // fail fast instead of waiting forever for a free connection
  idleTimeoutMillis: 30_000,
  statement_timeout: 10_000,      // a stuck query cannot hold a connection forever
});
```
- Biến mới `DB_POOL_MAX` đọc trong `config/env.ts` (cửa duy nhất đọc env), ghi vào `.env.example`.
- `statement_timeout` 10 s < `timeout` 15 s của transaction đặt hàng: một câu treo làm hỏng request thay vì giữ khoá.
- **Nghiệm thu:** `npm run test:db` pass (gồm `order.race.test.ts`, `stock.isolation.test.ts`); test DB mới: `SELECT pg_sleep(11)` qua `prisma.$queryRaw` bị huỷ với lỗi timeout.

---

## 4. Nhóm 2 — Trước khi đưa lên production

### 4.1 Email + hoàn thiện luồng quên mật khẩu (LARGE: dependency + auth)
**Hiện trạng (đính chính 2026-11-04):** `controllers/auth.controller.ts:92-95` chỉ in link đặt lại mật khẩu ra console **khi `NODE_ENV === 'development'`** — production không lộ link trong log, nhưng **cũng không gửi cho khách bằng cách nào**, nên quên mật khẩu không dùng được ở production. Link ghép từ `process.env.FRONTEND_URL` (đọc env ngoài `config/env.ts`, mặc định sai cổng 3001, đường dẫn `/auth/reset-password` không tồn tại). BFF chưa có route `forgot-password` / `reset-password`; frontend chưa có 2 trang này.

**Thiết kế:**
- `services/email.service.ts`: interface `sendPasswordReset(to, link)`, `sendOrderPlaced(to, order)`. Development: in ra console. Production: provider thật (Resend / SendGrid / SMTP — chọn khi lập plan, hỏi trước khi cài).
- Production thiếu cấu hình email → server không khởi động (fail fast trong `config/env.ts`), không âm thầm in link ra log.
- `frontendUrl` lấy từ `config/env.ts`.
- Trang frontend `/dat-lai-mat-khau` (đường dẫn chốt khi lập plan) + form.
- **Nghiệm thu:** test: production không có provider → lỗi khởi động; dev → link chỉ xuất hiện ở console provider; luồng E2E thủ công: quên mật khẩu → nhận link → đặt lại → đăng nhập.

### 4.2 Hạn mức rate limit cho admin (LARGE: security, ADR mới thay một phần ADR-006)
**Hiện trạng:** giới hạn chung 100 request / 15 phút / tài khoản. Lúc test đợt D1, nhập và sửa sản phẩm đã chạm giới hạn (mở form ≈ 3 request, mỗi lần lưu 1 + số biến thể / ảnh đổi). Chủ shop nhập hàng loạt sẽ gặp 429.

**Phương án (chốt khi lập plan):** (a) bucket riêng cho token `role=admin` với hạn mức cao hơn (vd 1 000 / 15 phút); (b) bỏ qua limiter chung cho admin, chỉ giữ limiter đăng nhập. Đề xuất (a): vẫn chặn token admin bị lộ dùng để cào dữ liệu.
- **Nghiệm thu:** test: khách vẫn 429 ở request thứ 101; admin không bị chặn ở request 101; token admin giả (sai chữ ký) bị tính như khách.

### 4.3 Logger có cấu trúc + request ID (dependency mới: `pino`, `pino-http`)
- Middleware `requestId`: nhận `X-Request-Id` nếu hợp lệ (≤ 100 ký tự `[A-Za-z0-9-]`), không thì sinh UUID; trả lại header; khai báo `req.id` trong `types/`.
- `pino-http` thay `morgan('dev')`; redact `req.headers.authorization`, `req.headers.cookie`, `req.headers["x-internal-secret"]` (tên header thật lấy từ code BFF); không log body.
- `errorHandler` log lỗi 5xx kèm `req.id`; dev dùng `pino-pretty`.
- BFF Next gửi `X-Request-Id` khi gọi Express để nối log hai phía.
- **Nghiệm thu:** test: response luôn có `X-Request-Id`; header lạ (quá dài, ký tự lạ) bị thay; log không chứa token / cookie (test bắt output logger).

### 4.4 Checklist production
- `npx prisma migrate deploy` (đang chờ: 20261016 → 20261104) + `npm run seed:category-tree -- --apply`.
- Runtime dùng URL pooler (Supabase PgBouncer), migration dùng `DIRECT_URL`.
- Sao lưu DB tự động + thử khôi phục một lần.
- Chọn nơi deploy backend (quyết định health check dùng `/health/ready`, tín hiệu dừng `SIGTERM`).
- Biến môi trường bắt buộc: `INTERNAL_API_SECRET`, `FRONTEND_URLS`, `NEXT_PUBLIC_SITE_URL`, email.

---

## 5. Nhóm 3 — Tách service đơn hàng và giỏ hàng (khi cần sửa logic này)

**Hướng:** chuyển **nguyên văn** logic hiện có từ `controllers/order.controller.ts` (`createOrder`, `confirmPayment`, `cancelOrder`, `updateFulfilmentStatus`) và `controllers/cart.controller.ts` sang `services/order.service.ts`, `services/cart.service.ts`. Controller chỉ còn: lấy input đã validate → gọi service → `sendSuccess`. Không viết lại thuật toán.

**Bắt buộc giữ (đối chiếu từng dòng khi review):**
1. Khoá `Cart ... FOR UPDATE` **trước** khi kiểm `Idempotency-Key` và đọc dòng giỏ.
2. Từ chối sản phẩm không còn `active` (`409 PRODUCT_UNAVAILABLE`).
3. Sắp xếp dòng giỏ theo `variantId` trước khi khoá kho (chống deadlock).
4. Chặn tổng tiền vượt `MAX_DB_INT` **trước** khi trừ kho (`422 ORDER_TOO_LARGE`).
5. COD: `claimForSale` + `recordSale` (sổ kho); **chuyển khoản: tăng `reservedQuantity` bằng UPDATE có điều kiện** — v1 bỏ mất nhánh này.
6. Phí ship `SHIPPING_FEE_NOT_CALCULATED`, `expiresAt` cho chuyển khoản, snapshot dòng đơn.
7. Đổi trạng thái qua `assertTransition` **và** điều kiện trạng thái trong chính câu UPDATE.
8. Không `any`: kiểu trả về từ Prisma (`Prisma.OrderGetPayload<{ include: { items: true } }>`).

**Nghiệm thu:** toàn bộ `order.*.test.ts`, `stock.isolation.test.ts`, `inventory.test.ts`, `cart.test.ts` pass không sửa assertion; chạy `/transaction-race-test` cho đặt hàng (COD + chuyển khoản), xác nhận thanh toán, huỷ, quét đơn quá hạn; `grep -n "\$queryRaw\|\$executeRaw\|\$transaction" controllers/order.controller.ts controllers/cart.controller.ts` rỗng.

---

## 6. Nhóm 4 — Khi dữ liệu hoặc lưu lượng lớn (có số đo mới làm)

### 6.1 Index trigram cho tìm kiếm
- **Điều kiện:** `EXPLAIN ANALYZE` tìm kiếm trên DB production > 20 ms, hoặc > ~5 000 sản phẩm.
- Khai báo trong `schema.prisma` (không chỉ SQL) để `migrate dev` không coi là lệch schema; kiểm cú pháp extension / index GIN của Prisma 7 trong docs trước khi viết. Trên Supabase extension nằm ở schema `extensions` — kiểm `gin_trgm_ops` có cần ghi rõ schema.
- Nâng độ dài tối thiểu từ khoá lên 3 ký tự (đổi validate route + frontend), nếu không từ khoá 2 chữ vẫn quét toàn bảng.
- **Nghiệm thu:** EXPLAIN trên dữ liệu thật dùng `Bitmap Index Scan`; test 422 cho từ khoá 2 chữ.

### 6.2 Cache danh mục
- **Điều kiện:** đo thấy truy vấn danh mục chiếm phần đáng kể thời gian request.
- Không dùng cache theo tiến trình khi có nhiều instance. Phương án: cache có "phiên bản" (bảng / Redis lưu số phiên bản, tăng mỗi lần ghi danh mục) hoặc TTL rất ngắn (vài giây). Mọi lệnh ghi đi qua `categoryAdmin.service.ts` và script seed phải xoá cache; `resetDb()` của test phải xoá cache.

### 6.3 Worker riêng, rate limit Redis, upload thẳng Cloudinary
- Worker riêng + rate limit Redis: khi chạy ≥ 2 instance backend.
- Upload thẳng (chữ ký có hạn, giới hạn thư mục / định dạng / kích thước phía Cloudinary): khi upload chiếm đáng kể RAM / băng thông backend.

---

## 7. Thứ tự và mức

| Nhóm | Mục | Mức (CLAUDE.md §4.1) |
|---|---|---|
| 1 | 3.1 bcrypt + code chết · 3.2 shutdown + ready · 3.3 pool + timeout | MEDIUM (3.1 đụng dependency → hỏi khi gỡ) |
| 2 | 4.1 email + quên mật khẩu · 4.2 rate limit admin · 4.3 logger · 4.4 production | LARGE từng mục |
| 3 | 5 tách service | LARGE (tiền, kho, trạng thái đơn) |
| 4 | 6.x | LARGE khi có số đo |

## 8. Rủi ro
- **Đổi hành vi đặt hàng khi tách service** → giữ nguyên văn + toàn bộ test race / idempotency + `/transaction-race-test`.
- **Timeout câu lệnh huỷ nhầm việc dài hợp lệ** (seed, báo cáo) → script dùng kết nối riêng / đặt `statement_timeout` cao hơn cho phiên đó.
- **Hạn mức admin quá rộng** → bucket riêng theo user id, vẫn có trần; ghi ADR.
- **Logger lộ dữ liệu nhạy cảm** → redact + test bắt output.
