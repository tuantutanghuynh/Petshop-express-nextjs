# Hạn mức rate limit cho admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Token admin hợp lệ được 1 000 request / 15 phút ở limiter chung; mọi người khác giữ 100.

**Architecture:** Một limiter, `limit` là hàm theo request (`express-rate-limit` 8.7: `limit: number | ValueDeterminingMiddleware<number>`). Token Bearer được xác thực một lần mỗi request (`WeakMap`) và dùng chung cho tính xô + tính hạn mức.

**Spec:** `docs/superpowers/specs/2026-11-04-admin-rate-limit-design.md` · ADR-019.

## Global Constraints
- Không đổi: limiter đăng nhập / liên hệ / báo giá, miễn giới hạn render của Next, cách tính xô.
- Không sửa assertion test cũ; hằng số ở `constants/`, không số "ma".
- Commit một dòng, không nhắc Claude, chờ "ok".

---

### Task 1: Hằng số + `apiRateLimitFor` (TDD)

**Files:** Create `backend/constants/rateLimit.ts`, `backend/test/ratelimit.admin.test.ts`; Modify `backend/middlewares/rateLimitKeys.ts` (`apiRateLimitKey` ~10–20)

**Interfaces — Produces:** `API_RATE_LIMIT_WINDOW_MS`, `API_RATE_LIMIT = 100`, `ADMIN_API_RATE_LIMIT = 1000`; `apiRateLimitFor(req: Request): number`.

- [ ] Step 1: Test fail (unit, trong `test/ratelimit.admin.test.ts`):
```ts
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { ADMIN_API_RATE_LIMIT, API_RATE_LIMIT } from '../constants/rateLimit';
import { apiRateLimitFor } from '../middlewares/rateLimitKeys';

const SECRET = process.env.JWT_ACCESS_SECRET as string;
const sign = (role: string, secret = SECRET, expiresIn: jwt.SignOptions['expiresIn'] = '15m') => jwt.sign({ sub: `u-${role}`, role }, secret, { expiresIn });
const req = (token?: string) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} }) as unknown as Request;

describe('apiRateLimitFor — allowance per caller', () => {
  it('gives a verified admin token the admin allowance', () => {
    expect(apiRateLimitFor(req(sign('admin')))).toBe(ADMIN_API_RATE_LIMIT);
  });
  it.each([
    ['a customer token', () => req(sign('customer'))],
    ['an admin token signed with another secret', () => req(sign('admin', 'not-the-secret'))],
    ['an expired admin token', () => req(sign('admin', SECRET, '-1s'))],
    ['no token', () => req()],
  ])('gives %s the normal allowance', (_label, make) => {
    expect(apiRateLimitFor(make())).toBe(API_RATE_LIMIT);
  });
});
```
- [ ] Step 2: `npm test -- test/ratelimit.admin.test.ts` → FAIL (module thiếu).
- [ ] Step 3: `constants/rateLimit.ts` (comment lý do 1000: nhập hàng loạt sản phẩm ≈ 1 request / giây, vẫn có trần nếu token admin lộ). `rateLimitKeys.ts`: thêm
```ts
const verified = new WeakMap<Request, JwtPayload | null>();
// The Bearer token of this request, verified once and remembered: the bucket and the allowance
// both need it, and verifying a JWT twice per request is wasted work.
function bearerPayload(req: Request): JwtPayload | null {
  if (verified.has(req)) return verified.get(req) ?? null;
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  let payload: JwtPayload | null = null;
  if (scheme === 'Bearer' && token) {
    try { payload = verifyAccessToken(token); } catch { payload = null; } // not valid: treated as anonymous
  }
  verified.set(req, payload);
  return payload;
}
export function apiRateLimitFor(req: Request): number {
  return bearerPayload(req)?.role === 'admin' ? ADMIN_API_RATE_LIMIT : API_RATE_LIMIT;
}
```
  và viết lại `apiRateLimitKey` dùng `bearerPayload` (giữ nguyên comment + nhánh `ipBucket`). Không để `catch {}` rỗng: có comment và gán giá trị.
- [ ] Step 4: `npm test -- test/ratelimit.admin.test.ts test/ratelimit.keys.test.ts` → PASS.

### Task 2: Nối vào limiter + test HTTP

**Files:** Modify `backend/app.ts` (khối `apiLimiter` ~73–88); `backend/test/ratelimit.admin.test.ts`

- [ ] Step 1: Test fail (HTTP, cùng file, mẫu `freshApp` / `burst` như `ratelimit.keys.test.ts`, `vi.resetModules()` mỗi kịch bản, IP riêng mỗi test):
  - token customer: 101 request → `[100] === 429`;
  - token admin: 101 request → `[100] === 404` (route không tồn tại, đã qua limiter);
  - token admin ký sai secret: 101 request → `[100] === 429`.
- [ ] Step 2: Chạy → FAIL ở kịch bản admin (429).
- [ ] Step 3: `app.ts`: `windowMs: API_RATE_LIMIT_WINDOW_MS, limit: apiRateLimitFor,` + cập nhật comment (100 cho mọi người, 1000 cho token admin hợp lệ — ADR-019).
- [ ] Step 4: `npm run typecheck && npm test` → toàn bộ PASS (gồm `ratelimit.test.ts`, `ratelimit.keys.test.ts`, `ratelimit.auth.test.ts`).

### Task 3: Kiểm thật + tài liệu
- [ ] Gọi 101 lần `GET /api/v1/products/admin/list` (token admin, backend dev đang chạy) → không 429; header `RateLimit-Limit` (hoặc `RateLimit-Policy`) phản ánh 1000; với token khách → 100.
- [ ] `npm run test:db` → PASS.
- [ ] ADR-019 vào `docs/DECISIONS.md`; mục PROGRESS.
- [ ] Đề xuất commit: `raise the api rate limit for admin tokens`.
