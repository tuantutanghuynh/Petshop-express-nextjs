# Email + quên / đặt lại mật khẩu — Thiết kế

Ngày: 2026-11-04 · Trạng thái: đã duyệt · Nguồn: spec v2 §4.1 · Mức: LARGE (dependency mới, auth)

## Hiện trạng
- Backend có `POST /auth/request-password-reset` (authLimiter 10 / 15 phút / IP, một câu trả lời cho mọi email, token 32 byte băm SHA-256, hạn 60 phút) và `POST /auth/reset-password` (token dùng một lần, chống bấm đồng thời) — **không có limiter**, **không thu hồi refresh token**.
- Link chỉ in ra console khi `NODE_ENV === 'development'`, ghép từ `process.env.FRONTEND_URL` (ngoài `config/env.ts`, mặc định `localhost:3001`, đường dẫn `/auth/reset-password` không tồn tại). Production không gửi được → quên mật khẩu không dùng được.
- BFF và frontend chưa có route / trang.

## Quyết định
SMTP qua `nodemailer` (+ `@types/nodemailer` dev). Gmail + mật khẩu ứng dụng dùng được ngay khi chưa có domain; đổi sang SMTP của nhà cung cấp khác chỉ bằng biến môi trường.

## Backend
- `config/env.ts`: `siteUrl` (`PUBLIC_SITE_URL`, mặc định `http://localhost:3000`), `smtp = { host, port, user, pass, from }` (`SMTP_HOST`, `SMTP_PORT` mặc định 587, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`), `isProduction`. Hàm `assertProductionConfig()`: production thiếu `PUBLIC_SITE_URL` hoặc bất kỳ biến SMTP nào → ném lỗi liệt kê tên biến thiếu (không in giá trị). Gọi trong `bin/www.ts` trước `listen`. `.env.example` cập nhật.
- `services/email.service.ts`:
  - `passwordResetEmail(link): { subject, text, html }` — thuần, tiếng Việt, thương hiệu "Siêu thị của chó mèo", nêu hạn 60 phút và "bỏ qua nếu bạn không yêu cầu"; link trong HTML được escape.
  - `sendPasswordReset(to, link): Promise<void>` — có SMTP → nodemailer transport (tạo một lần); không có SMTP (chỉ ngoài production) → in subject + link ra console.
  - Transport có thể thay trong test (`setMailTransportForTests`) — không mock module.
- `requestPasswordReset`: link `${siteUrl}/dat-lai-mat-khau?token=…&email=…`; gọi `sendPasswordReset` **không await** (`.catch` ghi `password reset email failed` + mã lỗi, không ghi token / link) để thời gian trả lời như nhau dù email có tồn tại; bỏ `console.log` cũ.
- `resetPassword`: thêm `authLimiter`; trong transaction đổi mật khẩu thêm `refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } })` (kiểm cách `token.service.ts` thu hồi để dùng đúng trường).

## BFF + frontend
- `app/api/auth/forgot-password/route.ts` → `/auth/request-password-reset`; `app/api/auth/reset-password/route.ts` → `/auth/reset-password`; cùng mẫu `register` (`rejectCrossOrigin`, `readJson`, `requestContext` để gửi IP khách). Thêm 2 đường dẫn vào danh sách private / noindex nếu có (`lib/privatePaths`).
- `/quen-mat-khau`: ô email (`type="email"`, `autoComplete="email"`), nút gửi khoá khi đang gửi; thành công → luôn hiện "Nếu email có tài khoản, chúng tôi đã gửi link đặt lại mật khẩu (hiệu lực 60 phút). Kiểm tra cả thư rác."; 429 → thông báo thử lại sau.
- `/dat-lai-mat-khau?token&email`: thiếu tham số → báo link không hợp lệ + link "Gửi lại"; form mật khẩu mới + xác nhận (cùng quy tắc trang đăng ký, `autoComplete="new-password"`); `INVALID_TOKEN` / `EXPIRED_TOKEN` → báo + link "Gửi lại"; thành công → `/dang-nhap?da-doi-mat-khau=1` (trang đăng nhập hiện thông báo).
- Trang đăng nhập: link "Quên mật khẩu?" dưới ô mật khẩu (≥ 44px).
- Cả hai trang: `robots: { index: false }`, không vào sitemap; `/dat-lai-mat-khau` có `referrer: 'no-referrer'`.

## Test
- Unit backend: `passwordResetEmail` (có link escape, có "60 phút"); `assertProductionConfig` (thiếu biến → lỗi nêu tên; đủ → không lỗi; ngoài production → không lỗi).
- DB: email có tài khoản → transport nhận đúng người nhận + link chứa `siteUrl/dat-lai-mat-khau` và token đúng (đặt lại được bằng token đó); email lạ → không gửi, cùng body; transport lỗi → vẫn 200; `/reset-password` lần 11 → 429; sau khi đặt lại, refresh token cũ → 401.
- Frontend unit: kiểm tra form đặt lại (trống, yếu, không khớp, hợp lệ) — dùng chung quy tắc với `validateRegister` nếu tách được.
- Thủ công: dev không SMTP — luồng quên → link console → đặt lại → đăng nhập bằng mật khẩu mới; 320 / 390 / 768 / 1280.

## Ngoài phạm vi
Email xác nhận đơn hàng (interface sẵn để thêm sau); hàng đợi email / gửi lại khi lỗi; giao diện email phức tạp.
