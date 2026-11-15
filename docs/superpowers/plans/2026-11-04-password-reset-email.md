# Email + quên / đặt lại mật khẩu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Khách quên mật khẩu nhận link qua email (SMTP), đặt lại trên `/dat-lai-mat-khau`, mọi phiên cũ bị đăng xuất.

**Architecture:** `services/email.service.ts` (nội dung thuần + transport thay được trong test) ← `auth.controller.requestPasswordReset` gọi không await. Cấu hình ở `config/env.ts`, kiểm khi khởi động production. BFF relay công khai (`relayPublic`) → 2 trang frontend.

**Spec:** `docs/superpowers/specs/2026-11-04-password-reset-email-design.md` · ADR-020.

## Global Constraints
- Dependency mới: `nodemailer`, `@types/nodemailer` (dev) — người dùng chạy lệnh cài.
- Chỉ `config/env.ts` đọc `process.env`; không log token / link / mật khẩu SMTP; không `any`, không `catch {}` rỗng.
- Một câu trả lời cho mọi email; thời gian trả lời không phụ thuộc việc gửi email.
- UI: input ≥ 16px, nút ≥ 44px, lỗi dưới ô, khoá nút khi gửi, `noindex`; tiêu đề `leading ≥ 1.3`.
- Commit một dòng, không nhắc Claude, chờ "ok".

---

### Task 0: Cài dependency (người dùng chạy)
- [ ] `cd backend && npm install nodemailer && npm install -D @types/nodemailer` → dán output.

### Task 1: Cấu hình + kiểm production (TDD, DB-free)
**Files:** Modify `backend/config/env.ts`, `backend/.env.example`, `backend/bin/www.ts`; Test `backend/test/config.production.test.ts`
**Produces:** `siteUrl: string`, `smtp: { host?: string; port: number; user?: string; pass?: string; from?: string }`, `isProduction: boolean`, `assertProductionConfig(env?: NodeJS.ProcessEnv): void`.
- [ ] Test fail: `assertProductionConfig({ NODE_ENV: 'production' })` ném lỗi chứa `PUBLIC_SITE_URL`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (không chứa giá trị nào); đủ biến → không ném; `NODE_ENV: 'development'` thiếu hết → không ném.
- [ ] Viết: hàm nhận `env` (mặc định `process.env`) để test được mà không stub toàn cục; `bin/www.ts` gọi trước `listen`. `.env.example`: `PUBLIC_SITE_URL=http://localhost:3000`, `SMTP_HOST=`, `SMTP_PORT=587`, `SMTP_USER=`, `SMTP_PASS=`, `MAIL_FROM="Siêu thị của chó mèo <shop@example.com>"` + comment Gmail mật khẩu ứng dụng.
- [ ] `npm test -- test/config.production.test.ts` PASS; typecheck.

### Task 2: `email.service.ts` (TDD, DB-free)
**Files:** Create `backend/services/email.service.ts`, `backend/test/email.service.test.ts`
**Produces:** `passwordResetEmail(link: string): { subject: string; text: string; html: string }`; `sendPasswordReset(to: string, link: string): Promise<void>`; `type MailTransport = { sendMail(msg: { from: string; to: string; subject: string; text: string; html: string }): Promise<unknown> }`; `setMailTransportForTests(t: MailTransport | null): void`.
- [ ] Test fail: nội dung có link (text) và link đã escape trong `href` (thử link có `&`), có "60 phút", có "Siêu thị của chó mèo"; `sendPasswordReset` gọi transport thay thế với đúng `to`, `from`, subject.
- [ ] Viết: transport = transport test nếu có → nodemailer `createTransport({ host, port, secure: port === 465, auth })` khi có `smtp.host` (tạo lười, một lần) → ngoài production in `console.info` subject + link (dev); production không có transport không xảy ra vì Task 1 chặn khởi động.
- [ ] PASS; typecheck.

### Task 3: Controller + route (TDD, DB)
**Files:** Modify `backend/controllers/auth.controller.ts` (`requestPasswordReset` ~70–97, `resetPassword` ~99–122), `backend/routes/auth.route.ts` (`/reset-password` ~79); Test `backend/test/db/auth.reset.test.ts`
- [ ] Test fail (transport giả qua `setMailTransportForTests`, chờ promise gửi bằng cách để transport giả resolve một deferred):
  - email có tài khoản → 1 thư tới đúng email, link bắt đầu `${PUBLIC_SITE_URL mặc định}/dat-lai-mat-khau?token=`; lấy token từ link → `POST /reset-password` 200 → đăng nhập bằng mật khẩu mới 200;
  - email lạ → 0 thư; body giống hệt trường hợp trên;
  - transport ném lỗi → vẫn 200;
  - refresh token có trước khi đặt lại → `POST /auth/refresh` sau đó 401;
  - `/reset-password` 10 lần token sai rồi lần 11 → 429 (`RATE_LIMITED`).
- [ ] Viết: link từ `siteUrl`; `void sendPasswordReset(...).catch((err) => console.error('password reset email failed', err instanceof Error ? err.name : 'unknown'))`; bỏ khối `console.log` dev; thêm `refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })` trong transaction; `authLimiter` cho `/reset-password`.
- [ ] `npm run test:db -- test/db/auth.reset.test.ts test/db/auth.test.ts` PASS; toàn bộ `npm test` PASS.

### Task 4: BFF
**Files:** Create `frontend-petshop/app/api/auth/forgot-password/route.ts`, `frontend-petshop/app/api/auth/reset-password/route.ts`
- [ ] Mỗi route: `rejectCrossOrigin` → `readJson` (null → `badRequest`) → chỉ chuyển các field cần (`{ email }` / `{ email, token, newPassword }`) → `relayPublic(jar, { path, method: 'POST', body }, ctx)` → `toResponse`.
- [ ] Typecheck + lint.

### Task 5: Trang + link (TDD cho phần kiểm tra)
**Files:** Modify `frontend-petshop/lib/forms.ts` (+ `validateResetPassword`), `frontend-petshop/test/forms.test.ts`; Create `app/quen-mat-khau/page.tsx`, `app/dat-lai-mat-khau/page.tsx`, `components/auth/ForgotPasswordForm.tsx`, `components/auth/ResetPasswordForm.tsx`; Modify `components/auth/LoginForm.tsx` (link + thông báo `da-doi-mat-khau`), `app/dang-nhap/page.tsx` (đọc tham số), `lib/seo/robots.ts` (`PRIVATE_PATHS` + 2 đường dẫn) và test robots nếu có danh sách cố định.
- [ ] Test fail `validateResetPassword({ password, confirmPassword })` (dùng lại `passwordError`): trống, yếu, không khớp, hợp lệ.
- [ ] Trang theo spec (thông báo cố định sau khi gửi; link hỏng / hết hạn → "Gửi lại link"; thành công → `router.replace('/dang-nhap?da-doi-mat-khau=1')`); metadata `robots: { index: false, follow: false }`, `/dat-lai-mat-khau` thêm `referrer: 'no-referrer'`; `useSearchParams` trong `<Suspense>`.
- [ ] `npm run typecheck && npm run lint && npm test` PASS.

### Task 6: Kiểm thật + tài liệu
- [ ] Build frontend, chạy app; luồng dev không SMTP: `/dang-nhap` → "Quên mật khẩu?" → gửi email khách thử → link in ở log backend → mở link → đặt mật khẩu mới → đăng nhập được; mở lại link cũ → báo link không hợp lệ; refresh token cũ bị từ chối (phiên cũ bị đăng xuất).
- [ ] 320 / 390 / 768 / 1280 + zoom 200%: không cuộn ngang, nút ≥ 44px.
- [ ] `curl -sI /quen-mat-khau` có `noindex`; `/robots.txt` có 2 đường dẫn.
- [ ] Backend: typecheck, `npm test`, `npm run test:db`. Frontend: typecheck, lint, test, build.
- [ ] ADR-020, PROGRESS; đề xuất commit: `send password reset links by email` (backend), `add forgot and reset password pages` (frontend).
- [ ] Hướng dẫn người dùng bật SMTP Gmail (mật khẩu ứng dụng) — để tự thử gửi thật.
