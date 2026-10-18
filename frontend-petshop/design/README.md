# Thiết kế: wireframe + palette — Siêu thị của chó mèo

Bản đối chiếu khi code frontend. Không phải code sản phẩm: chỉ là HTML/CSS tĩnh, mở bằng trình duyệt.

## Cách xem

```bash
open frontend-petshop/design/index.html
```

- `index.html`: mục lục. Trên desktop, bấm tên trang để xem trong khung xem trước, rồi đổi bề rộng 360 / 390 / 768 / 1024 / 1280 (các mốc trong `.claude/rules/mobile-ui.md`).
- `palette.html`: palette, chỗ đo từng màu trên ảnh mẫu, các cặp chữ/nền đã kiểm tra tương phản.
- Mỗi wireframe có **ghi chú vàng** (khối lấy dữ liệu từ API nào, xử lý lỗi ra sao) và **ghi chú hồng** (⚠ backend chưa hỗ trợ / khác ảnh mẫu). Nút "Ẩn ghi chú" để xem giao diện sạch.

## Thư mục

```
design/
├── index.html            mục lục + xem trước theo bề rộng
├── palette.html          palette và kiểm tra tương phản
├── tokens.css            NGUỒN SỰ THẬT về màu / bo góc / font
├── reference/homepage-mockup.jpg   ảnh mẫu dùng để đo màu và bố cục
└── wireframes/
    ├── wf.css, layout.js  style và header/footer/sidebar dùng chung
    ├── home, category, product, quote, blog, blog-post, gallery, contact, about, policy, 404
    ├── cart, checkout, order-success, account, order-detail, auth
    └── admin-login, admin-dashboard, admin-orders, admin-quotes, admin-products,
        admin-product-edit, admin-categories, admin-blog, admin-gallery, admin-contacts, admin-settings
```

## Palette

Màu thương hiệu được **đo từ pixel ảnh mẫu** (màu xuất hiện nhiều nhất của từng vùng). Màu nào chưa đạt tương phản 4.5:1 cho chữ nhỏ có thêm biến thể `-ink` cùng tông, đậm hơn — chỉ dùng cho chữ, link, nút có chữ trắng.

| Vai trò | Token | Giá trị |
|---|---|---|
| Chính (mảng lớn) | `--brand-teal` | `#0FA0A0` |
| Nút chính, link | `--brand-teal-ink` | `#087878` |
| Tiêu đề, giá | `--ink` | `#0B1B2B` |
| Chữ thường | `--text` | `#3A4C52` |
| Nền hero | `--mint` | `#D8EBEB` |
| Hồng | `--pink` / `--pink-bg` | `#DC2B5E` / `#FCDDE9` |
| Vàng (chữ navy) | `--yellow` / `--yellow-bg` | `#FCBE1C` / `#FCEAC9` |
| Cam | `--orange-ink` / `--peach-bg` | `#C2510C` / `#FCDECD` |
| Tím | `--purple` / `--lavender-bg` | `#5632BE` / `#DED0EA` |

Đầy đủ trong `tokens.css`. Font: **Be Vietnam Pro** (`next/font/google`, `subsets: ['latin', 'vietnamese']`).

### Đưa vào Tailwind v4 khi code

Chép khối `:root` của `tokens.css` vào `app/globals.css`, rồi thêm:

```css
@theme inline {
  --color-brand: var(--brand-teal);
  --color-brand-ink: var(--brand-teal-ink);
  --color-brand-deep: var(--brand-teal-deep);
  --color-ink: var(--ink);
  --color-body: var(--text);
  --color-muted: var(--text-muted);
  --color-mint: var(--mint);
  --color-pink: var(--pink);
  --color-pink-bg: var(--pink-bg);
  --color-yellow: var(--yellow);
  --color-yellow-bg: var(--yellow-bg);
  --color-orange: var(--orange-ink);
  --color-peach: var(--peach-bg);
  --color-purple: var(--purple);
  --color-lavender: var(--lavender-bg);
  --font-sans: var(--font-be-vietnam), system-ui, sans-serif;
}
```

Khi đó dùng được `bg-brand-ink text-white`, `bg-pink-bg text-pink`… Kiểm tra cú pháp `@theme` theo docs Next 16 / Tailwind v4 trong `node_modules` trước khi dán.

## Khác ảnh mẫu (có chủ đích)

| Ảnh mẫu | Wireframe | Lý do |
|---|---|---|
| Sao đánh giá ★ (128) | Bỏ | Không có bảng review; rule SEO cấm rating giả |
| Icon wishlist ♡ | Bỏ | Không có API wishlist |
| Chọn tiền tệ USD | Hotline | Chỉ VND |
| "Free shipping trên $49", "30 ngày đổi trả", "24/7", "Loyalty" | Cam kết đang làm thật | Backend chưa tính phí ship, chưa có đổi trả / tích điểm |
| Logo Visa / Mastercard | COD + Chuyển khoản | Chỉ 2 phương thức này |
| Thỏ, cá, chim | Danh mục thật (chó, mèo, thức ăn…) | Dự án tập trung chó mèo |
| Màu cam / teal trên nền peach | Bản đậm hơn cùng tông | Màu ảnh mẫu chỉ đạt 2.3–2.6:1 |
| — | Thêm khối "Kiến thức chăm sóc" ở trang chủ | Liên kết cụm nội dung (SEO) |

## Backend còn thiếu (phát hiện khi vẽ)

Xếp theo mức chặn tính năng. Mỗi mục là một task riêng; mục có migration là LARGE.

| # | Thiếu | Trang bị ảnh hưởng | Gợi ý |
|---|---|---|---|
| 1 | Thông tin ngân hàng để khách chuyển khoản | Đặt hàng thành công | Key `bank_*` trong `SiteSetting` |
| 2 | ~~Admin chuyển đơn sang PROCESSING / COMPLETED~~ ✅ đã có (2026-10-18) | Admin đơn hàng | `PATCH /orders/admin/:id/status` |
| 3 | Gửi email (reset mật khẩu) | Quên mật khẩu | Dịch vụ email — dependency mới |
| 4 | Tìm kiếm công khai `q` | Header, kết quả tìm | Thêm `q` + index trigram |
| 5 | Sắp xếp `sort`, lọc theo thông số / giá | Danh mục | Whitelist + index |
| 6 | Trường SEO của Product (`metaTitle`, `metaDescription`, `ogImage`), lưu slug cũ để redirect | Chi tiết sản phẩm | Migration |
| 7 | Ảnh cho Category, `GET /categories/:slug`, sửa / xoá category | Trang chủ, danh mục, admin | Migration + endpoint |
| 8 | Hồ sơ tác giả (ảnh, tiểu sử) cho bài thú y (YMYL) | Bài viết, giới thiệu | Migration hoặc trang tĩnh |
| 9 | Khách tự huỷ đơn đang chờ thanh toán | Chi tiết đơn | Endpoint mới |
| 10 | Sửa hồ sơ / đổi mật khẩu khi đang đăng nhập | Tài khoản | Endpoint mới |
| 11 | Thống kê doanh thu đơn online | Admin tổng quan | Endpoint aggregate |
| 12 | Newsletter | Footer | Tạm thay bằng link Zalo / Facebook |
| 13 | Ảnh trong `OrderItem` | Chi tiết đơn | Lấy theo `variantId` nếu còn; hoặc thêm cột snapshot |

## Nợ kỹ thuật frontend đã thấy

- `app/blog/[slug]/page.tsx`: JSON-LD chưa escape `<` (XSS) — dùng component `JsonLd` escape.
- Blog / gallery dùng `cache: 'no-store'` và ghép `NEXT_PUBLIC_BACKEND_ORIGIN` vào URL ảnh (giờ là URL Cloudinary đầy đủ) — đổi sang ISR + `images.remotePatterns` cho Cloudinary.
- `lib/adminAuth.ts` lưu token trong `localStorage`.
- Trang chủ (`app/page.tsx`) còn là mẫu create-next-app; `sitemap.ts` / `robots.txt` hardcode domain cũ.
