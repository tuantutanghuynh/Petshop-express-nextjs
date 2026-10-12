---
paths:
  - "frontend-petshop/app/**/*.tsx"
  - "frontend-petshop/components/**"
  - "frontend-petshop/app/globals.css"
---

# Mobile-first UI

Mọi trang / component phải dùng tốt bằng một tay ở 320–430px: không cuộn ngang, không phải zoom, đẹp khi mở rộng lên tablet / desktop. Chi tiết và code mẫu: skill `mobile-responsive-ui` (dùng **chế độ Hướng dẫn** trong dự án này).

## Quy tắc
| Hạng mục | Quy tắc |
|---|---|
| Style | Tailwind, class không prefix = mobile; mở rộng bằng `md:` / `lg:` |
| Chiều cao | `min-h-dvh`, không `100vh` |
| Chiều rộng | `w-full max-w-*`; không `100vw`, không px cố định cho khối nội dung |
| Chữ | Nội dung ≥ 16px; input / select / textarea ≥ 16px (tránh iOS zoom) |
| Tiếng Việt | Tiêu đề `leading` ≥ 1.3 (không `leading-none` / `leading-tight`); `next/font` có `subsets: ['latin', 'vietnamese']`; nhãn nút / tab chịu được chữ dài hơn |
| Vùng bấm | ≥ 44×44px, cách nhau ≥ 8px |
| Padding trang | 16px mobile, 24px từ `md` |
| Hover | Chỉ trong `@media (hover: hover)`; luôn có `:active`, `:focus-visible` |
| Zoom | Không chặn (`maximumScale`, `userScalable`) |
| Viewport | `export const viewport` trong `app/layout.tsx`: `width: 'device-width'`, `initialScale: 1`, `viewportFit: 'cover'`, `interactiveWidget: 'resizes-content'` |
| Thanh cố định | Cộng `env(safe-area-inset-*)`, chừa padding cho nội dung |
| Điều hướng | Storefront 2–5 mục: bottom tab bar trên mobile (Trang chủ, Sản phẩm, Blog, Giỏ hàng), top nav từ `md`; `aria-current="page"` |
| Bảng (admin) | Danh sách thẻ trên mobile, bảng từ `md` |
| Modal | Bottom sheet trên mobile, hộp thoại giữa từ `md`; Escape / chạm nền để đóng, trả focus |
| Form | Một cột, label trên input; `type="tel"` cho SĐT, `type="email"`, `inputMode`, `autoComplete`, `enterKeyHint`; lỗi dưới field + `aria-describedby`; nút submit `w-full md:w-auto`, khoá khi đang gửi |
| Tiền | `Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })` + `tabular-nums` |
| Ảnh | `next/image` có `sizes`, giữ chỗ bằng width/height / `aspect-ratio`, `object-cover` cho thẻ |
| Trạng thái | Đủ loading (skeleton), empty (có hướng dẫn), error, disabled |

## Luồng ưu tiên trên mobile
- **Sản phẩm:** ảnh → tên, giá → chọn biến thể → nút "Thêm vào giỏ" trong tầm ngón cái (thanh dính đáy có safe area).
- **Giỏ / checkout:** danh sách thẻ, stepper số lượng ≥ 44px, tổng tiền + nút đặt hàng dính đáy; form địa chỉ dùng đúng `autoComplete`.
- **Bài viết:** chữ ≥ 16px, dòng ≤ ~65ch, ảnh co theo màn hình, mục lục thu gọn được (nội dung vẫn có trong HTML).

## Kiểm tra trước khi báo xong
- [ ] 320 / 360 / 390 / 430px: không cuộn ngang, chữ không tràn / bị cắt, dấu tiếng Việt đủ.
- [ ] 768 / 1024px: layout mở rộng hợp lý; xoay ngang không bị header / bottom bar chiếm hết.
- [ ] Vùng bấm ≥ 44px; focus input không zoom; đúng bàn phím; nút submit không bị bàn phím che.
- [ ] Dữ liệu cực đoan: tên sản phẩm rất dài, giá lớn, danh sách rỗng, 100 dòng.
- [ ] Zoom 200% vẫn dùng được; thanh cố định không che nội dung.
- [ ] Lighthouse mobile: Performance & Accessibility ≥ 90 (hoặc ghi lý do).
- [ ] Máy thật khi có thể: `npm run dev -- -H 0.0.0.0`, mở qua IP LAN trên Safari iOS / Chrome Android.
- [ ] Playwright (khi đã cài — hỏi trước): test không cuộn ngang ở 320 / 375 / 430 / 768 / 1280px + test vùng bấm.

Tìm phần tử gây cuộn ngang (Console, chế độ mobile):
```js
[...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).forEach(el => { el.style.outline = '2px solid red'; console.log(el); });
```

## Cấm
`100vh` cho khối cao toàn màn hình · `width` cố định / `100vw` gây tràn · chữ < 12px, nút < 44px · ẩn nội dung quan trọng trên mobile bằng `display: none` · chức năng chỉ có khi hover · bảng desktop ép nhỏ · chặn zoom · tiêu đề tiếng Việt mất dấu.
