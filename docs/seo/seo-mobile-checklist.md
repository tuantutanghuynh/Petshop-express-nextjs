# Checklist SEO & Mobile Optimization (QA)

Tài liệu này lưu trữ quy trình tự kiểm tra (Self-Audit) các tiêu chuẩn về SEO và Giao diện Di động (Mobile) trước khi đưa dự án Miniecom lên môi trường Production. Đây là quy trình bắt buộc để đảm bảo chất lượng.

## 1. Kiểm tra Meta Tags & Cấu trúc HTML
- [x] **Meta Title & Description động**: Mọi trang (đặc biệt là `blog/[slug]` và `gallery`) phải có `<title>` và `<meta description>` khác nhau, không trùng lặp.
  - *Cách test*: Mở trình duyệt, dùng phím tắt `Cmd + U` (View Page Source) để đảm bảo thẻ meta được render sẵn từ Server (Server-Side Rendering).
- [x] **Quy tắc thẻ H1**: Mỗi trang chỉ được phép có duy nhất **một** thẻ `<h1>`. Thẻ H1 phải chứa từ khóa chính của trang.

## 2. Kiểm tra Hình ảnh (Images)
- [x] **Thuộc tính Alt bắt buộc**: Mọi ảnh (đặc biệt là Gallery) đều phải có thuộc tính `alt` không được rỗng.
  - *Đã xử lý*: Tính năng này đã được khoá chặt ở tầng Backend (bắt buộc nhập `altText` qua `express-validator` từ Buổi 8).
- [x] **Khai báo kích thước**: Các thẻ `<Image>` của Next.js đều phải truyền đủ `width` và `height` (hoặc dùng fill kèm sizes) để tránh lỗi Layout Shift (bố cục nhảy lung tung khi ảnh đang tải).

## 3. Kiểm tra Giao diện Di động (Responsive & Mobile-First)
- [x] **Viewport Meta**: Đảm bảo có thẻ `<meta name="viewport" content="width=device-width, initial-scale=1">`.
- [x] **Test chống cuộn ngang (Horizontal Scroll)**:
  - *Cách test*: Thu nhỏ trình duyệt về kích thước **375px (iPhone SE)**. 
  - *Kết quả*: Kiểm tra dọc toàn bộ các trang `/blog`, `/blog/<slug>`, `/gallery`. Đảm bảo tuyệt đối không xuất hiện thanh cuộn ngang (dấu hiệu rõ nhất của việc vỡ layout/tràn phần tử).

## 4. Công cụ Tìm kiếm (Search Engine - Googlebot)
- [x] **Sitemap.xml (`http://localhost:3000/sitemap.xml`)**:
  - Truy cập đường dẫn và xác nhận file XML trả về đầy đủ các đường dẫn tĩnh (Homepage, Contact) và các đường dẫn động (từng bài viết Blog đã publish).
- [x] **Robots.txt (`http://localhost:3000/robots.txt`)**:
  - Truy cập đường dẫn và xác nhận nội dung file cho phép crawl toàn trang, nhưng phải có cờ `Disallow: /admin/` để chặn Googlebot thu thập dữ liệu khu vực quản trị nội bộ.
- [x] **Structured Data (JSON-LD)**: Đảm bảo các trang chi tiết bài viết có chèn thẻ `<script type="application/ld+json">` (schema `BlogPosting`).

## 5. Đánh giá Hiệu năng (Performance - Lighthouse)
- [x] **Chạy Chrome DevTools Lighthouse**:
  - Chạy report ở chế độ **Mobile** cho một trang bài viết cụ thể (`/blog/<slug>`).
  - *Mục tiêu*: Ghi nhận điểm Performance và SEO. Không bắt buộc đạt 100/100, nhưng **không được phép** có cảnh báo đỏ nghiêm trọng (ví dụ: missing alt, thiếu viewport meta, hoặc LCP quá 4 giây).
