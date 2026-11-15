# Logger có cấu trúc + request ID — Thiết kế

Ngày: 2026-11-04 · Trạng thái: đã duyệt · Nguồn: spec v2 §4.3, CLAUDE.md §6 (logger có level, `X-Request-Id`, không log password / token / cookie / `Authorization`) · Mức: LARGE (dependency)

## Hiện trạng
- `morgan('dev')` mount **sau** limiter trong `app.ts` → request bị 429 không có trong log; ghi cả query string (admin tìm đơn theo SĐT → SĐT khách nằm trong log).
- `errorHandler` `console.error(err)` — không biết lỗi thuộc request nào.
- 12 `console.*` trong code chạy thật: `bin/www.ts`, `workers/releaseExpiredOrders.ts`, `controllers/auth.controller.ts`, `controllers/gallery.controller.ts`, `services/email.service.ts`, `middlewares/errorHandler.ts`.

## Dependency
Thêm `pino`, `pino-http`; dev: `pino-pretty`. Gỡ `morgan`, `@types/morgan`.

## Backend
- `config/env.ts`: `logLevel` (`LOG_LEVEL`; mặc định `info` ở production, `debug` khác) — thêm vào `.env.example`.
- `utils/logger.ts`:
  - `createLogger(destination?)` — pino với `level: logLevel`, `redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-internal-secret"]', 'res.headers["set-cookie"]'], censor: '[Redacted]' }`, timestamp ISO; development (không truyền `destination`) dùng transport `pino-pretty`, còn lại ghi JSON ra stdout.
  - `export const logger = createLogger()`.
- `middlewares/requestLogger.ts`: `pino-http` với
  - `logger`, `genReqId(req, res)`: header `X-Request-Id` khớp `^[A-Za-z0-9_-]{8,100}$` thì dùng, không thì `crypto.randomUUID()`; luôn `res.setHeader('X-Request-Id', id)`.
  - `serializers.req`: `{ id, method, path }` (path = `req.url` cắt bỏ phần `?…`) + `userId` khi đã xác thực (đọc từ `req.user` lúc kết thúc nếu có); `serializers.res`: `{ statusCode }`.
  - `customLogLevel`: lỗi hoặc ≥ 500 → `error`, ≥ 400 → `warn`, còn lại `info`.
  - `autoLogging.ignore`: `/health`, `/health/ready`.
  - `quietReqLogger: true` (log con chỉ mang `reqId`).
- `app.ts`: `app.use(requestLogger)` là middleware đầu tiên (trước helmet, cors, limiter); bỏ `morgan`.
- `errorHandler`: `req.log.error({ err }, 'unhandled error')` thay `console.error`.
- Thay `console.*` còn lại bằng `logger` (`info` / `warn` / `error`), giữ nguyên thông điệp; `email.service` dev transport dùng `logger.info`.

## BFF + frontend
- `lib/bff/session.ts` `callBackend` và `lib/apiClient.ts`: header `X-Request-Id: crypto.randomUUID()` mỗi lần gọi; `console.error('bff: backend unreachable', …)` kèm id.

## Test (DB-free, viết trước) — `backend/test/logging.test.ts`
Trong file này `utils/logger` được thay bằng chính `createLogger` thật ghi vào stream trong bộ nhớ (`vi.doMock` + `vi.importActual`, cấu hình redact / level giữ nguyên), rồi import `app` mới (`vi.resetModules`) và đọc các dòng JSON:
- response luôn có `X-Request-Id` (UUID khi không gửi);
- `X-Request-Id: bff-abc12345` → giữ nguyên; `a`, chuỗi 101 ký tự, có `\n`, có dấu cách → bị thay;
- request có `Authorization: Bearer <token>`, `Cookie`, `X-Internal-Secret` → log không chứa giá trị nào;
- `GET /api/v1/unknown?q=0912345678` → log có path, không có `0912345678`;
- request thứ 101 (429) có dòng log mức `warn` với `statusCode: 429`;
- lỗi 500 (route test ném lỗi) → dòng `error` có `reqId` trùng header trả về;
- `/health` không sinh dòng log.
Toàn bộ test hiện có pass.

## Ngoài phạm vi
Gửi log về dịch vụ ngoài (Datadog, Logtail…), log của Next.js server bằng pino, metrics.
