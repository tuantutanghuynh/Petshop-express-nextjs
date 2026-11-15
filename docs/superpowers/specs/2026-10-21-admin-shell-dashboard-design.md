# Khung admin + Tổng quan (đợt A) — Thiết kế

Ngày: 2026-10-21 · Trạng thái: đã duyệt · Wireframe: `design/wireframes/layout.js` (admin shell), `wf.css` (.admin*), `admin-dashboard.html`
Các đợt sau (spec riêng): B Đơn hàng · C Báo giá + Tin nhắn · D Sản phẩm · E Bài viết + Thư viện ảnh.

## Khung (`components/admin/shell/*`, dùng trong `app/admin/layout.tsx`)
- `/admin/login`: không khung (trả children như cũ).
- Còn lại: kiểm tra token (`getToken`); không có → `router.replace('/admin/login')`, trong lúc chờ hiện khung trống (không nháy nội dung).
- **Sidebar** (`ADMIN_NAV`, thứ tự wireframe): Tổng quan `/admin` ◧ · Đơn hàng `/admin/don-hang` 🧾 · Yêu cầu báo giá `/admin/bao-gia` ☎ · Sản phẩm `/admin/san-pham` 📦 · Danh mục & thông số `/admin/danh-muc` 🗂 · Bài viết `/admin/posts` 📝 · Thư viện ảnh `/admin/gallery` 🖼 · Tin nhắn liên hệ `/admin/lien-he` ✉ · Cấu hình trang chủ `/admin/cau-hinh` ⚙. Mục có `ready: false` (Đơn hàng, Báo giá, Sản phẩm, Tin nhắn) hiện mờ + "Sắp có", là `<span aria-disabled>` không phải link.
- Mục đang mở: khớp đường dẫn chính xác hoặc tiền tố `href + '/'` (`/admin` chỉ khớp chính nó); `aria-current="page"`, nền sáng hơn + chữ đậm.
- **Desktop ≥ 1024px:** lưới `240px | 1fr`; sidebar nền `ink`, chữ sáng, sticky cao `100dvh`, mỗi mục ≥ 44px.
- **< 1024px:** sidebar ẩn; nút ☰ (44px, `aria-label="Mở menu quản trị"`) ở thanh trên mở `<dialog>` ngăn kéo trái chứa cùng menu; Esc / chạm nền / ✕ đóng, đóng khi đổi trang, focus trả về ☰.
- **Thanh trên** (sticky, cao ≥ 56px, nền trắng, viền dưới): ☰ (mobile) · tên trang hiện tại (từ `ADMIN_NAV`, mặc định "Quản trị") · email admin (`GET /auth/me` qua `authFetch`, cắt ngắn khi hẹp) · nút "Đăng xuất" (gọi logout backend với refresh token nếu có, rồi `clearTokens()` và về `/admin/login`; lỗi mạng vẫn xoá token).
- Nền `surface-alt`; vùng nội dung padding 16px, 24px từ 768px; bỏ `max-w-3xl` và hàng link cũ.
- Đăng nhập thành công → `/admin` (thay `/admin/posts`).

## Tổng quan (`/admin`)
- Tiêu đề "Tổng quan" + `<select>` "30 ngày qua / Tháng này" (chỉ áp cho ô doanh thu tư vấn).
- 4 ô (mỗi ô tải riêng, lỗi riêng):
  1. Chờ xác nhận chuyển khoản = `GET /orders/admin/list?orderStatus=PENDING_PAYMENT&pageSize=50` → `meta.total`.
  2. Yêu cầu tư vấn mới = `GET /quote-requests/admin/list?status=NEW` → `meta.total`.
  3. Doanh thu chốt qua tư vấn = `GET /quote-requests/admin/stats?from=&to=` → `revenue` (VND, `formatVnd`) + "Tỉ lệ chốt N%" (`conversionRate`).
  4. Tin nhắn chưa đọc = `GET /contact/admin/list?isRead=false` → `meta.total`.
  Link hành động ("Xử lý ›", "Gọi lại ›", "Đọc ›") chỉ hiện khi mục đích tương ứng `ready`.
- 2 danh sách:
  - "Đơn chuyển khoản sắp hết hạn giữ hàng": từ kết quả ô 1, sắp `expiresAt` tăng dần, tối đa 5; mỗi dòng mã đơn · tổng tiền · "còn X giờ" / "còn X phút" / "đã quá hạn"; nút "Xác nhận" chỉ khi trang Đơn hàng `ready`.
  - "Khách chờ gọi lại": từ ô 2, 5 yêu cầu mới nhất; tên · SĐT · số sản phẩm · thời gian tương đối; nút "☎ Gọi" (`tel:`, ≥ 44px).
  - Rỗng: "Không có đơn chờ xác nhận." / "Chưa có yêu cầu mới."
- Đọc đúng tên field theo API thật (kiểm tra response trước khi viết UI); không đoán field.

## Hàm thuần có test (`lib/adminNav.ts`, `lib/adminDashboard.ts`)
- `activeNavItem(pathname)`, `ADMIN_NAV`.
- `rangeFor(period, now)` → `{ from, to }` ISO (30 ngày qua / đầu tháng theo giờ Việt Nam).
- `expiringOrders(orders, now, limit)` (sắp theo `expiresAt`, bỏ đơn không có `expiresAt`).
- `timeLeft(expiresAt, now)` → "còn 2 giờ" | "còn 15 phút" | "đã quá hạn".
- `timeAgo(createdAt, now)` → "vừa xong" | "10 phút trước" | "1 giờ trước" | "3 ngày trước".

## Kiểm tra
Unit cho các hàm trên; lint / typecheck / build; trình duyệt 390 / 768 / 1280 + zoom 200%: ngăn kéo mở/đóng/Esc/focus, mục đang mở, Đăng xuất về login, chưa đăng nhập vào `/admin/danh-muc` → login, 4 ô + 2 danh sách có dữ liệu thật trên DB local, không cuộn ngang, vùng bấm ≥ 44px; các trang Danh mục / Cấu hình / Bài viết / Thư viện ảnh vẫn dùng được trong khung mới.

## Ngoài phạm vi
API doanh thu đơn online (đợt B), làm lại nội dung trang Bài viết / Thư viện ảnh (đợt E), đổi URL trang admin cũ.
