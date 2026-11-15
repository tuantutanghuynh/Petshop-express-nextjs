# Logger có cấu trúc + request ID — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Mọi request (kể cả 429) có một dòng log JSON mang request ID, không lộ token / cookie / secret / query string; lỗi 500 gắn với request; BFF gửi request ID để nối log hai phía.

**Architecture:** `utils/logger.ts` (pino, redact) → `middlewares/requestLogger.ts` (pino-http, `genReqId`, serializer cắt query) mount đầu tiên trong `app.ts`; `errorHandler` dùng `req.log`; `console.*` trong code chạy thật → `logger`.

**Spec:** `docs/superpowers/specs/2026-11-04-structured-logging-design.md`

## Global Constraints
- Không log giá trị `Authorization`, `Cookie`, `X-Internal-Secret`, `Set-Cookie`, query string, body.
- Chỉ `config/env.ts` đọc `process.env`; không `any`; script và test giữ `console`.
- Không sửa assertion test cũ. Commit một dòng, không nhắc Claude, chờ "ok".

---

### Task 0: Dependency (người dùng duyệt; Claude chạy khi được "ok" như các lần trước)
- [ ] `cd backend && npm install pino pino-http && npm install -D pino-pretty && npm uninstall morgan @types/morgan`.

### Task 1: Test logging (fail trước)
**Files:** Create `backend/test/logging.test.ts`
- [ ] Bộ đọc log: `const lines: Record<string, unknown>[] = []; const stream = { write: (s: string) => { lines.push(JSON.parse(s)); } };` → `vi.doMock('../utils/logger', async () => { const actual = await vi.importActual<typeof import('../utils/logger')>('../utils/logger'); const logger = actual.createLogger(stream); return { ...actual, logger, default: logger }; })` → `vi.resetModules()` → `const { default: app } = await import('../app')`. Chờ log flush bằng `await new Promise(setImmediate)`.
- [ ] 7 test theo spec (X-Request-Id có / giữ / thay 4 kiểu sai; không lộ 3 header; không lộ query; 429 có dòng `warn` statusCode 429 — 101 lần `GET /api/v1/unknown` cùng IP; 500 có `reqId` = header — route ném lỗi: dùng `POST /api/v1/products` với body gây lỗi không phải ApiError? → dùng `vi.doMock` cho một controller là rủi ro; thay bằng `GET /api/v1/products/khong-co` khi DB không có? (DB-free không có DB → Prisma lỗi kết nối → 500) — xác nhận bằng chạy thử; `/health` không có dòng).
- [ ] `npm test -- test/logging.test.ts` → FAIL (module `utils/logger` chưa có).

### Task 2: Logger + request logger + nối app
**Files:** Create `backend/utils/logger.ts`, `backend/middlewares/requestLogger.ts`; Modify `backend/config/env.ts` (`logLevel`), `backend/.env.example` (`LOG_LEVEL=`), `backend/app.ts` (import, mount đầu tiên, bỏ morgan), `backend/middlewares/errorHandler.ts`.
- [ ] Viết theo spec; `req.log` có type nhờ `pino-http` (kiểm `node_modules/pino-http` khai báo `IncomingMessage.log`; nếu không, khai báo trong `types/`).
- [ ] `npm run typecheck && npm test -- test/logging.test.ts` → PASS; `npm test` toàn bộ PASS.

### Task 3: Thay `console.*` còn lại
**Files:** `backend/bin/www.ts`, `backend/workers/releaseExpiredOrders.ts`, `backend/controllers/auth.controller.ts`, `backend/controllers/gallery.controller.ts`, `backend/services/email.service.ts`
- [ ] Thay bằng `logger.info/warn/error({ ...ngữ cảnh }, 'thông điệp')`; lỗi truyền `{ err }` (pino serializer) trừ chỗ cố ý chỉ ghi tên lỗi (email reset).
- [ ] `grep -rn "console\." --include='*.ts' backend | grep -v "node_modules\|/test/\|/scripts/"` rỗng; `npm test`, `npm run test:db` PASS (test `token is never written to the server log` vẫn PASS).

### Task 4: BFF gửi request ID
**Files:** `frontend-petshop/lib/bff/session.ts` (`callBackend`), `frontend-petshop/lib/apiClient.ts`
- [ ] `const requestId = crypto.randomUUID(); headers.set('X-Request-Id', requestId)`; log lỗi kèm `requestId`. Test hiện có của `bff.test.ts` / `apiClient.test.ts` pass (thêm 1 assertion header nếu test dựng fetch giả).
- [ ] Frontend typecheck, lint, test.

### Task 5: Kiểm thật + tài liệu
- [ ] Chạy backend dev, gọi vài request (thường, 404, 429, lỗi) → dán vài dòng log thật (dev pretty) + một dòng JSON (`NODE_ENV=production LOG_LEVEL=info` chạy tạm cổng 4100 với đủ biến giả cho `assertProductionConfig`? — không: dùng `npx tsx -e` dựng logger production) → xác nhận không có token / query.
- [ ] Trang thật qua BFF: request ID của Next khớp dòng log backend.
- [ ] PROGRESS; đề xuất commit: `log requests as json with request ids` (backend), `send request ids from the bff` (frontend).
