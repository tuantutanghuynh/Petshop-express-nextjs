# Hạn mức rate limit cho admin — Thiết kế

Ngày: 2026-11-04 · Trạng thái: đã duyệt · Nguồn: spec v2 §4.2 · Mức: LARGE (security) · ADR-019 (sửa một phần ADR-006)

## Vấn đề
Limiter chung `/api/` (`app.ts`, 100 request / 15 phút, xô theo `user:<id>` khi token hợp lệ, `ip:<…>` khi không) chặn admin khi nhập sản phẩm: mở form ≈ 3 request, mỗi lần lưu 1 + số biến thể / ảnh đổi. Đã chạm 429 khi test đợt D1.

## Quyết định
Hạn mức theo người gọi, cùng một limiter, cùng cách tính xô:
- Bearer token có chữ ký hợp lệ, chưa hết hạn, `role === 'admin'` → `ADMIN_API_RATE_LIMIT = 1000` / 15 phút.
- Mọi trường hợp khác (khách, token khách, token giả, token hết hạn, không token) → `API_RATE_LIMIT = 100` / 15 phút.

Phương án loại: bỏ limiter cho admin (token admin lộ thì gọi không giới hạn); nâng giới hạn chung (yếu bảo vệ với mọi người).

## Thành phần
- `backend/constants/rateLimit.ts` (mới): `API_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000`, `API_RATE_LIMIT = 100`, `ADMIN_API_RATE_LIMIT = 1000`.
- `backend/middlewares/rateLimitKeys.ts`:
  - `bearerPayload(req)`: xác thực Bearer token một lần cho mỗi request (nhớ trong `WeakMap<Request, …>`), trả payload hoặc `null`.
  - `apiRateLimitKey(req)` dùng `bearerPayload` (hành vi không đổi).
  - `apiRateLimitFor(req): number` mới — 1000 cho admin hợp lệ, 100 còn lại.
- `backend/app.ts`: `windowMs: API_RATE_LIMIT_WINDOW_MS`, `limit: apiRateLimitFor`; comment cập nhật.

## Không đổi
Limiter đăng nhập (10 / 15 phút / IP), limiter liên hệ và báo giá, miễn giới hạn cho request render trang của Next (`isServerRenderRequest`), header `RateLimit-*` chuẩn.

## Đánh đổi
Admin bị hạ quyền giữ hạn mức 1000 tới khi access token hết hạn (≤ 15 phút) — giống `requireRole` đọc quyền từ token.

## Test (DB-free, viết trước)
- Unit `apiRateLimitFor`: token admin → 1000; token customer → 100; token admin ký sai secret → 100; token admin hết hạn → 100; không header → 100.
- HTTP: token customer — request thứ 101 = 429; token admin — request thứ 101 ≠ 429; token admin ký sai — request thứ 101 = 429 (dùng IP riêng mỗi test để không lẫn xô).
- `ratelimit.test.ts`, `ratelimit.keys.test.ts`, `ratelimit.auth.test.ts` pass không sửa assertion.

## Ngoài phạm vi
Redis store / nhiều instance (spec v2 §6.3); hạn mức theo endpoint.
