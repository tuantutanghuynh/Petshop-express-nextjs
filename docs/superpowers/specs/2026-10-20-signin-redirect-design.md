# Chuyển thẳng tới trang đăng nhập cho trang riêng tư — Thiết kế

Ngày: 2026-10-20 · Trạng thái: đã duyệt

## Vấn đề
Khách chưa đăng nhập mở `/tai-khoan` thấy khung tải rồi một nút "Đăng nhập" — phải bấm thêm một lần. Nguyên nhân: cookie phiên là httpOnly, trang dựng tĩnh, phía client hỏi `/api/auth/me` rồi chỉ hiện `SignInPrompt`.

## Phạm vi
- Chuyển thẳng: `/tai-khoan`, `/tai-khoan/don-hang/[code]`, `/dat-hang`.
- Giữ nguyên: `/gio-hang` (vẫn xem được, có lời mời đăng nhập).

## Cách làm (A + dự phòng client)
1. `lib/bff/privatePaths.ts` (thuần, có test):
   - `needsSignIn(pathname)`: true cho `/tai-khoan`, `/tai-khoan/*`, `/dat-hang`; false cho mọi đường dẫn khác (kể cả `/tai-khoan-x`, `/gio-hang`).
   - `loginRedirectPath(pathname, search)`: `/dang-nhap?next=<encodeURIComponent(pathname + search)>`.
   - `hasSessionCookie(get)`: true khi có cookie access hoặc refresh (tên theo `cookieNames()`).
2. `proxy.ts` (gốc frontend): `matcher: ['/tai-khoan/:path*', '/dat-hang']`; không có cookie phiên → `NextResponse.redirect` 307 tới `loginRedirectPath`; ngược lại cho qua. Không gọi backend, không đọc giá trị token. Chỉ là kiểm tra lạc quan — quyền thật do backend kiểm.
3. `components/orders/SignInRedirect.tsx` (thay `SignInPrompt`): khi mount `router.replace(loginRedirectPath(...))`, hiển thị "Đang chuyển tới trang đăng nhập…" + link bấm tay. Dùng ở `AccountView`, `OrderDetailView`, `CheckoutView` (trạng thái signedOut). `CartView` không đổi.

## Kiểm tra
- Unit: 3 hàm ở mục 1 (viết trước, thấy fail).
- Curl trên build: không cookie → 307 `Location: /dang-nhap?next=…` cho 3 trang; có cookie → 200; `/gio-hang`, `/`, `/_next/*` không bị redirect.
- Trình duyệt: "Tài khoản" khi chưa đăng nhập → vào thẳng `/dang-nhap`; đăng nhập xong quay về `/tai-khoan`.
- Build: 3 trang vẫn tĩnh (`○`).

## Ngoài phạm vi
Không đổi backend, URL, cách lưu token. Không áp cho `/gio-hang`.
