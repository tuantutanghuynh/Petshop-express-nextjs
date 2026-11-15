# Thiết kế: Đổi hướng — Blog & Gallery + Deploy trước, Ecommerce core sau

Ngày: 2026-08-22
Trạng thái: Đã duyệt, chuyển sang cập nhật plan triển khai

## Bối cảnh

Spec gốc [2026-08-21-miniecom-month1-mvp-design.md](2026-08-21-miniecom-month1-mvp-design.md)
xếp Blog & Gallery vào "Giai đoạn 5" (sau tháng 1), ưu tiên lõi ecommerce
(cart/order/reservation/payment) trong tháng 1. Sau khi đã xong Buổi 1 (setup) và
Buổi 2 (schema catalog: User/Category/CategoryAttribute/Product/ProductVariant/
ProductImage), người học quyết định đổi ưu tiên: **làm Blog & Gallery + deploy web
thật trước**, để bắt đầu tích luỹ SEO/traffic càng sớm càng tốt — đúng chiến lược mục
6.5 và mục 13 tài liệu gốc (blog "bơm" backlink/topical authority cần thời gian, không
cần chờ catalog sản phẩm xong mới bắt đầu).

## Đánh đổi được chấp nhận có ý thức

Tháng 1 sẽ **không còn kết thúc bằng luồng mua hàng chạy được** (cart/order/payment/
reservation — phần khó nhất, giá trị học transaction/race-condition cao nhất). Phần đó
lùi thành "Giai đoạn 2", nối tiếp ngay sau khi Blog+Gallery+Deploy xong — không mất nội
dung, chỉ dời lịch. Nội dung Buổi 6-20 của plan cũ được giữ nguyên trong file plan, đánh
dấu là "Giai đoạn 2 (archive, sẽ dùng lại)".

## Quyết định đã chốt

| Hạng mục | Quyết định |
|---|---|
| Buổi 3-5 (middleware, auth JWT, RBAC) | Giữ nguyên thứ tự cũ — hạ tầng bắt buộc cho mọi tính năng, kể cả bảo vệ trang admin đăng bài |
| Bảng `Product`/`ProductVariant`/`ProductImage` (đã tạo Buổi 2) | Giữ nguyên, chưa dùng tới, không rollback |
| `BlogPost` | title, slug, excerpt, content (Markdown thuần, chưa dùng rich-text editor), coverImageUrl, authorId, **categoryId (FK sang `Category` đã có sẵn** — thống nhất hơn bản gốc dùng string rời), status (draft/published), seoTitle, seoDescription, publishedAt |
| `GalleryItem` | title, imageUrl, altText (bắt buộc), categoryId (FK `Category`), position |
| Link sản phẩm (`blog_post_products`/`gallery_item_products`) | Hoãn — thêm ở Giai đoạn 2 khi có catalog CRUD, migration additive không phá gì đang có |
| Admin đăng bài | Có, tối giản, ưu tiên tính năng đăng bài trước — 1 trang `/admin` trong CÙNG Next.js app (không tách app admin riêng), login qua JWT đã xây Buổi 4, token lưu `localStorage` |
| Content editor | Markdown thuần (textarea), render bằng thư viện markdown ở Next.js — chưa cần WYSIWYG |
| Deploy frontend | Vercel, subdomain `*.vercel.app` |
| Deploy backend + Postgres | Render (web service) + Render/Neon Postgres free tier, subdomain `*.onrender.com` |
| Domain thật | Chưa có — mua sau, redirect 301 khi có, không mất SEO tích luỹ đã có |
| GitHub repo | https://github.com/tuantutanghuynh/Galery-blog-miniecom-nextjs-express.git |

## SEO — bắt buộc làm đúng ngay từ phase này (yêu cầu bổ sung của người học)

Đây là lý do chính của việc đổi thứ tự, nên phải làm chuẩn ngay từ đầu, không phải
thêm sau:
- Metadata động (`generateMetadata` mỗi trang blog/gallery — title, description, OG image).
- `alt` bắt buộc trên mọi ảnh gallery (đã có trong schema `GalleryItem.altText`).
- `sitemap.xml` (tách blog/gallery nếu sau này nhiều bài) + `robots.txt`.
- URL slug thân thiện (`/blog/cach-chon-hat-cho-cho`, không phải `?id=123`).
- Heading structure chuẩn (H1 duy nhất mỗi trang, H2/H3 phân đoạn rõ trong nội dung Markdown).
- Ảnh nén hợp lý qua `next/image` (tự động lazy-load + resize).
- Structured data cơ bản: `BlogPosting`/`Article` (`datePublished`, `dateModified`, `author`).

## Mobile-friendly — bắt buộc (yêu cầu bổ sung của người học)

- Toàn bộ trang public (blog, gallery, trang chủ) dùng CSS responsive (flex/grid co giãn,
  không fix width cứng) — kiểm tra bằng Chrome DevTools ở breakpoint 375px (iPhone SE)
  trở lên trước khi coi 1 trang là "xong".
  Cùng nhóm chỉ số PageSpeed/Lighthouse với SEO — Google index mobile-first, nên trang
  không mobile-friendly cũng đồng thời bị ảnh hưởng SEO. Hai yêu cầu này gắn liền nhau,
  không tách rời.
- `next/image` tự động responsive qua `sizes`/`srcset` — dùng đúng cách thay vì `<img>` thường.
- Trang `/admin` không bắt buộc tối ưu mobile chặt như trang public (chỉ người học dùng),
  nhưng vẫn phải dùng được cơ bản trên mobile (không vỡ layout hoàn toàn).

## Roadmap buổi mới (thay thế Buổi 6-20 cũ trong plan)

| Buổi | Nội dung |
|---|---|
| 6 | Schema `BlogPost` + `GalleryItem` + migrate |
| 7 | Blog CRUD API (admin, có auth+RBAC) + validate |
| 8 | Gallery CRUD API (admin) + upload ảnh (tái dùng pattern multer đã thiết kế) |
| 9 | Next.js setup + trang blog public (list/detail) + metadata SEO động + responsive |
| 10 | Trang gallery public (responsive) + `/admin` login + danh sách bài viết |
| 11 | Form tạo/sửa bài viết + upload ảnh gallery trong `/admin` |
| 12 | `sitemap.xml` + `robots.txt` + structured data + review SEO/mobile checklist |
| 13 | Deploy backend lên Render + Postgres cloud + migrate production |
| 14 | Deploy frontend lên Vercel + nối env + verify end-to-end trên domain thật (subdomain) |
| 15 | Tổng kết, quiz, log |

**Giai đoạn 2 (archive, tiếp tục sau khi xong)**: đúng nội dung Buổi 6-20 kế hoạch cũ
(catalog CRUD sâu, cart/order/reservation/payment giả lập, frontend ecommerce).
