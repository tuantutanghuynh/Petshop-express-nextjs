# Backend nhóm 1 (spec v2 §3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gỡ dependency / code chết, tắt server êm với `/health/ready`, và giới hạn pool + thời gian câu lệnh DB — không đổi hành vi nghiệp vụ.

**Architecture:** Cờ trạng thái tắt ở `utils/lifecycle.ts` (app đọc, `bin/www.ts` ghi); `/health/ready` nằm ngoài `/api` (không bị rate limit); cấu hình pool truyền thẳng vào `PrismaPg`, giá trị từ `config/env.ts`.

**Tech Stack:** Express 5, Prisma 7.9 + `@prisma/adapter-pg` (`pg` 8), Vitest + supertest (+ testcontainers cho `test:db`).

**Spec:** `docs/BACKEND_IMPROVEMENT_SPEC.md` §3 · **Mức:** MEDIUM (Task 1 đụng dependency → người dùng chạy `npm uninstall`).

## Global Constraints
- Comment / code / commit tiếng Anh; commit một dòng, không nhắc Claude, chỉ commit khi người dùng "ok".
- Không `any`, không `catch {}` nuốt lỗi, không `@ts-ignore`; chỉ `config/env.ts` đọc `process.env`.
- Không sửa assertion test cũ; mọi test hiện có phải pass (`npm test`, `npm run test:db`).

---

### Task 1: Gỡ `bcrypt`, hàm refresh JWT chết, `JWT_REFRESH_SALT`

**Files:** `backend/package.json` (+ lock, do người dùng chạy), `backend/services/jwt.service.ts:2,29-39`, `backend/config/env.ts:17,28,41`, `backend/.env.example:4`

- [ ] Step 1: Người dùng chạy (cd backend): `npm uninstall bcrypt` → dán output.
- [ ] Step 2: Xoá `signRefreshToken`, `verifyRefreshToken` khỏi `jwt.service.ts` (và khỏi `export default`, import `jwtRefreshSecret`); xoá `jwtRefreshSecret` khỏi `config/env.ts` (type, export, object); xoá dòng `JWT_REFRESH_SALT` trong `.env.example`.
- [ ] Step 3: Kiểm: `grep -rn "from 'bcrypt'\|jwtRefreshSecret\|RefreshToken(" --include='*.ts' . | grep -v node_modules` chỉ còn hàm của `token.service.ts`; `npm run typecheck && npm test` pass.

### Task 2: `/health/ready` + cờ tắt (TDD)

**Files:** Create `backend/utils/lifecycle.ts`; Modify `backend/app.ts` (cạnh `/health` ~108); Test: Create `backend/test/health.ready.test.ts` (DB-free, file riêng vì cờ tắt là trạng thái của cả tiến trình — Vitest chạy mỗi file trong worker riêng), Modify `backend/test/db/smoke.test.ts` (DB)

**Interfaces — Produces:** `markShuttingDown(): void`, `isShuttingDown(): boolean`; `GET /health/ready` → 200 `{status:'ready'}` | 503 `{status:'shutting-down'|'db-unavailable'}`.

- [ ] Step 1: Test fail — DB-free (`health.ready.test.ts`, chỉ chứa test này):
```ts
it('reports not ready once shutdown has started', async () => {
  markShuttingDown();
  const res = await request(app).get('/health/ready');
  expect(res.status).toBe(503);
  expect(res.body).toEqual({ status: 'shutting-down' });
});
```
  DB (`smoke.test.ts`): `expect((await call('get', '/health/ready', { brand: null })).body).toEqual({ status: 'ready' });`
- [ ] Step 2: Chạy → FAIL (404 / module thiếu).
- [ ] Step 3: Viết `utils/lifecycle.ts` và route theo spec §3.2 (dùng `asyncHandler`, `prisma.$queryRaw\`SELECT 1\``, `catch` trả 503 không kèm chi tiết).
- [ ] Step 4: `npm test -- test/health.ready.test.ts` + `npm run test:db -- test/db/smoke.test.ts` → PASS.

### Task 3: Tắt server êm trong `bin/www.ts`

**Files:** Modify `backend/bin/www.ts` (toàn file, 13 dòng → theo spec §3.2, giữ comment về sweeper)

- [ ] Step 1: Viết lại theo spec: giữ `server`, `sweeper`; `shutdown(signal)` → `markShuttingDown` → `clearInterval` → `server.close(cb)` → `prisma.$disconnect().finally(exit)`; fail-safe 15 s `.unref()`.
- [ ] Step 2: `npm run typecheck`.
- [ ] Step 3: Kiểm thủ công (Claude chạy, có output thật): khởi động `npx tsx bin/www.ts` với `PORT=4100`; gửi `curl /health/ready` (200); gửi `kill -TERM <pid>` trong lúc một request đang chạy (`curl /api/v1/products` lặp) → log `SIGTERM: stopping…`, tiến trình thoát mã 0 trong < 15 s; `curl` sau đó bị từ chối kết nối.

### Task 4: Pool + `statement_timeout` (TDD)

**Files:** Modify `backend/config/env.ts` (+ `dbPoolMax`), `backend/.env.example` (+ `DB_POOL_MAX=10`), `backend/services/prisma.ts:18`; Test `backend/test/db/smoke.test.ts`

- [ ] Step 1: Test fail (DB):
```ts
it('cancels a statement that runs longer than the timeout', async () => {
  await expect(prisma.$queryRaw`SELECT pg_sleep(11)`).rejects.toThrow(/statement timeout/i);
}, 20_000);
```
- [ ] Step 2: Chạy → FAIL (câu chạy hết 11 s và thành công).
- [ ] Step 3: `config/env.ts`: `export const dbPoolMax = Number(process.env.DB_POOL_MAX) || 10;` (+ type, object). `services/prisma.ts`: `new PrismaPg({ connectionString: databaseUrl, max: dbPoolMax, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000, statement_timeout: 10_000 })` + comment lý do (10 s < 15 s của transaction đặt hàng). Hằng số đặt tên (`STATEMENT_TIMEOUT_MS` …) đầu file.
- [ ] Step 4: `npm run test:db` toàn bộ → PASS (gồm race / isolation / idempotency).
- [ ] Step 5: Kiểm script seed dùng client riêng hay `services/prisma` (`grep -rn "services/prisma" scripts`): nếu dùng chung, xác nhận seed hiện tại không có câu > 10 s (chạy dry run `npm run seed:category-tree` và đo); ghi kết quả.

### Task 5: Tổng kết
- [ ] `npm run typecheck && npm test && npm run test:db` (backend) — dán số.
- [ ] `git status` + `git diff --stat`: chỉ các file trên.
- [ ] Ghi `docs/PROGRESS.md`; đề xuất commit: `remove unused bcrypt and refresh jwt helpers`, `add readiness probe and graceful shutdown`, `bound db pool and statement time`.
