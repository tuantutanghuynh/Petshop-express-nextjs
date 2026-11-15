# Hero dạng slide, admin chỉnh được (đợt 3) — Thiết kế

Ngày: 2026-10-21 · Trạng thái: đã duyệt

## Mục tiêu
Hero trang chủ thành carousel nhiều slide; chủ shop thêm / sửa / xoá / sắp xếp slide trong `/admin/cau-hinh`. Mỗi slide giữ bố cục hero hiện tại (chữ trái, ảnh phải trên nền vàng + hồng).

## Dữ liệu
Setting `homepage_hero_slides` (JSON array), không migration, không API mới.

Mỗi slide: `{ enabled: boolean, badge?, title, accent?, subtitle?, ctaLabel?, ctaHref?, cta2Label?, cta2Href?, image?, startsAt?, endsAt? }`.
- Tối đa `MAX_HERO_SLIDES = 6`.
- Slide hiển thị khi: `enabled !== false`, có `title`, trong khoảng ngày (`isWithinDates`, giờ Việt Nam, như khuyến mãi).
- `ctaHref` / `cta2Href` qua `isSafeHref` (sai → bỏ nút); nút chính cần cả nhãn + link, thiếu → mặc định "Mua ngay" → `/san-pham`; nút phụ chỉ hiện khi đủ nhãn + link.
- `image` phải `https://` rồi qua `imageSrc()` khi render (host không cho phép → không ảnh).
- Giới hạn độ dài: badge 40, title 80, accent 80, subtitle 240, nhãn nút 30.
- **Tương thích:** setting chưa có (chưa lưu lần nào) → 1 slide dựng từ các key `homepage_hero_*` hiện tại (logic `heroFrom` cũ). Setting có nhưng không còn slide hợp lệ (hết hạn / tắt hết) → hero mặc định (nội dung mặc định của `heroFrom`).

## Admin (`/admin/cau-hinh`)
- Khối "Hero trang chủ" thay bằng "Slide hero": mỗi slide một fieldset (Đang hiển thị, Nhãn nhỏ, Tiêu đề, Dòng nhấn, Mô tả, Nút chính + link, Nút phụ + link, Ảnh qua `ImageField`, Từ ngày / Đến ngày) với nút ↑ ↓ Xoá (≥ 44px); "+ Thêm slide" (ẩn khi đủ 6).
- Lần đầu (setting chưa có): slide 1 điền sẵn từ các key `homepage_hero_*`.
- Lưu: `formToSettings` ghi `homepage_hero_slides`; các key `homepage_hero_*` cũ không còn trong form (giữ nguyên trong DB, không xoá).
- Validate như khuyến mãi: tiêu đề bắt buộc với slide có nội dung; link `/` hoặc `https://`; ảnh `https://`; ngày đúng định dạng, đến ngày ≥ từ ngày. Error key `heroSlides.<i>.<field>`, input name `heroSlides-<i>-<field>`.

## Trang chủ
- `HeroSlider` (client) nhận danh sách slide đã parse ở server; mọi slide render sẵn trong HTML.
- Slide 1: `<h1>`, ảnh `fetchPriority="high"` (LCP). Slide sau: `<h2>` cùng cỡ chữ, ảnh `loading="lazy"`.
- Các slide chồng nhau trong một grid (`grid-area` chung) → chiều cao = slide cao nhất, đổi slide không xê dịch layout (CLS 0). Chuyển bằng `opacity` (≤ 400 ms; `prefers-reduced-motion` → không hiệu ứng).
- Tự chạy 6 s; dừng khi hover, focus trong carousel, tab ẩn (`visibilitychange`); nút ⏸/▶ (`aria-pressed`) dừng hẳn; `prefers-reduced-motion: reduce` → mặc định không tự chạy.
- Điều khiển: ‹ › (`aria-label` "Slide trước/sau"), chấm tròn (`aria-label` "Slide N", `aria-current`), vuốt ngang (pointer events, ngưỡng 40 px), phím ← → khi focus trong carousel. Vùng bấm ≥ 44 px.
- ARIA: `section aria-roledescription="carousel"` + `aria-label="Nổi bật"`; mỗi slide `role="group" aria-roledescription="slide" aria-label="N / tổng"`; slide ẩn `inert` + `aria-hidden`; vùng chứa `aria-live="off"` khi tự chạy, `"polite"` khi dừng.
- 1 slide → render hero tĩnh hiện tại (không nút, không JS điều khiển).
- Hàm thuần có test: `nextIndex(i, n, dir)` (quay vòng).

## Kiểm tra
- Unit: `parseHeroSlides` (chưa có setting → slide cũ; ngày; tắt; > 6; href / ảnh xấu; thiếu tiêu đề; tất cả hết hạn → mặc định), `heroSlidesToForm` / `formToSettings` (round-trip, lỗi theo ô), `nextIndex`.
- Trình duyệt: tự chạy đổi slide, dừng khi hover / focus, ⏸, vuốt, Tab không vào slide ẩn; 320 / 390 / 768 / 1024 / 1280, zoom 200 %; Lighthouse mobile trang chủ: CLS ≤ 0.1, LCP không tệ hơn hiện tại.
- curl: HTML trang chủ có đủ tiêu đề mọi slide, đúng 1 `<h1>`.

## Ngoài phạm vi
Banner ảnh toàn khung, video, hiệu ứng trượt, lịch theo giờ.
