# Admin Sản phẩm (đợt D1) — Thiết kế

Ngày: 2026-11-04 · Trạng thái: đã duyệt · Wireframe: `admin-products.html`, `admin-product-edit.html` · Mức: LARGE (migration + public API)

## Backend

### Giới hạn theo shop
Mọi route admin sản phẩm chạy thêm `resolveBrand` (header `X-Brand-Slug`, như admin danh mục — ADR-017). Sản phẩm thuộc shop khi `categoryId ∈ req.brand.categoryIds`; ngoài shop → **404** (không lộ là có tồn tại). Áp cho: `GET /products/admin/list` (luôn lọc theo shop, `categorySlug` chỉ thu hẹp thêm), `GET /products/admin/:id` (mới), `POST /products`, `PATCH /products/:id`, `DELETE /products/:id`, `POST /products/:id/variants`, `PATCH|DELETE /products/variants/:variantId`, `POST /products/:id/images`, `PATCH|DELETE /products/images/:imageId`, stock-movements (đọc / ghi).

### `GET /products/admin/:id` (mới)
Admin, mọi trạng thái. Trả sản phẩm + `category` (kèm `attributes`), `images` (theo `position`), `variants` (theo `price`, có `stockQuantity`, `reservedQuantity`). 404 `PRODUCT_NOT_FOUND` nếu không có / ngoài shop.

### Validate tạo / sửa (`POST /products`, `PATCH /products/:id`)
- `name`: chuỗi, trim, 1–200 ký tự (tạo: bắt buộc; sửa: nếu gửi).
- `slug`: `^[a-z0-9]+(?:-[a-z0-9]+)*$`, tối đa 120 ký tự.
- `brand`: chuỗi hoặc null, tối đa 100. `description`: chuỗi hoặc null, tối đa 20 000.
- `status` ∈ `PRODUCT_STATUS_VALUES`. `attributes`: object (không phải mảng / null).
- `categoryId`: phải thuộc shop → khác 404 `CATEGORY_NOT_FOUND`.
- Biến thể khi tạo: `sku` 1–64, `label` ≤ 100, giá như hiện tại.
- Lỗi dạng → 422 `VALIDATION_ERROR` (details theo field).

### Chuyển hướng slug sản phẩm
- Migration `add_product_slug_redirects`: bảng `ProductSlugRedirect { oldSlug String @id, productId → Product onDelete: Cascade, createdAt }`, `@@index([productId])`. Chỉ thêm bảng, không mất dữ liệu; rollback = drop bảng.
- Đổi slug (cùng transaction): lưu slug cũ vào bảng; nếu slug mới đang là slug cũ của chính sản phẩm này thì xoá dòng đó (đổi về được). Slug mới trùng slug đang dùng **hoặc** slug cũ của sản phẩm khác → 409 `SLUG_TAKEN`. Tạo mới cũng kiểm tra cả slug cũ.
- `GET /products/resolve/:slug` (công khai): slug cũ → `{ slug }` của sản phẩm hiện tại, chỉ khi sản phẩm `active`; khác → 404.
- ADR-018 ghi quyết định.

### Test (DB, viết trước)
401 không token · 403 khách thường · 422 input sai (slug có dấu / hoa, tên rỗng, attributes là mảng) · 404 danh mục ngoài shop · 404 lấy / sửa / xoá sản phẩm, biến thể, ảnh ngoài shop · lấy sản phẩm Nháp bằng id · đổi slug → resolve slug cũ; đổi về slug cũ; slug cũ của sản phẩm khác → 409 · admin list luôn chỉ trả sản phẩm của shop.

## Frontend

### `/admin/san-pham` (danh sách)
- URL: `?trang-thai=active|draft|archived&danh-muc=<slug>&q=&page=` (mặc định không ghi). Ô tìm debounce 300 ms, đổi lọc → trang 1. 20 / trang, `Pagination`.
- < 768px thẻ, ≥ 768px bảng: ảnh bìa (hoặc 🐾) · tên + slug · số biến thể · danh mục · nhãn trạng thái · khoảng giá `28.000₫ – 590.000₫` · "Tồn 34 / giữ 2", "Hết hàng" khi có thể bán = 0 · nút "Sửa".
- "+ Thêm sản phẩm" → `/admin/san-pham/moi`. Loading / lỗi + "Thử lại" / rỗng ("Chưa có sản phẩm nào" / "Không tìm thấy sản phẩm khớp «q»").
- `ADMIN_NAV` Sản phẩm `ready: true`.

### `/admin/san-pham/moi` và `/admin/san-pham/[id]` (form)
- **Thông tin chung:** Tên; Slug (tạo: tự sinh từ tên tới khi admin sửa tay; sửa sản phẩm `active`: cảnh báo "URL cũ sẽ tự chuyển sang URL mới"); Thương hiệu (gợi ý: khớp tên trong mega menu); Mô tả Markdown với "Soạn / Xem trước" (cùng `renderMarkdown` như trang công khai).
- **Cột bên** (mobile: dưới form): Trạng thái (mặc định Nháp khi tạo); Danh mục (cây, nhãn đủ đường dẫn "Chó › Thức ăn › Hạt cho chó"); Lưu; Xoá sản phẩm (hỏi lại, gợi ý "Lưu trữ" cho sản phẩm đã bán).
- **Thông số:** ô theo `CategoryAttribute` của danh mục đang chọn (text / number); đổi danh mục → ô đổi theo, giá trị của khoá trùng giữ lại.
- **Biến thể:** dòng: nhãn · SKU · giá · giá gạch · tồn (giữ). Giá số nguyên 0–2 000 000 000; giá gạch trống hoặc > giá.
  - Tạo: nhập tồn đầu.
  - Sửa: nhãn / giá lưu bằng nút Lưu (`PATCH variants/:id` cho dòng đổi); "+ Thêm biến thể" (có tồn đầu) và xoá (hỏi lại; không xoá dòng cuối) gọi API ngay. Tồn chỉ hiển thị (điều chỉnh ở D2).
- **Ảnh:** chọn file → `POST /uploads/image` ngay (như `ImageField`) → URL; ảnh đầu là bìa, ↑↓ đổi thứ tự, ô alt từng ảnh, xoá hỏi lại. Tạo: gửi kèm `images` khi lưu; sửa: thêm / sắp xếp / alt / xoá gọi API ảnh.
- **Bố cục:** mobile thanh "Lưu" dính đáy (safe-area); lỗi dưới từng ô + focus ô lỗi đầu; 409 SLUG_TAKEN / SKU_TAKEN → lỗi dưới ô tương ứng.
- **Sau khi lưu / xoá:** revalidate tag `products` + `categories` (whitelist `REVALIDATE_TAGS`; `products` có trên mọi trang sản phẩm, danh mục, trang chủ). Sitemap tự làm mới sau ≤ 1 giờ (`revalidate = 3600`).

### Storefront
`/san-pham/[slug]` không tìm thấy → gọi `resolve`; có → `permanentRedirect` (308) sang slug mới; không → 404 như cũ.

## Hàm thuần có test (frontend)
`priceRange(variants)`, `stockSummary(variants)` (tồn, giữ, có thể bán), `parseProductsQuery` / `productsHref` / `productsApiPath`, `slugify(name)`, `validateProductForm(form)`, `variantChanges(before, after)`, `categoryPathLabel(tree, id)`.

## Kiểm tra
Unit + DB như trên; typecheck / lint / build; trình duyệt (DB local): tạo SP Nháp 2 biến thể + 2 ảnh; sửa giá; thêm / xoá biến thể; đổi slug SP đang bán → `curl -sI` slug cũ = 308; Lưu trữ rồi xoá SP thử; 390 / 768 / 1280 + zoom 200%; vùng bấm ≥ 44 px; không cuộn ngang.

## Ngoài phạm vi
Điều chỉnh tồn kho / lịch sử kho (D2); SEO riêng cho sản phẩm (meta title / description — cần migration khác); nhân bản sản phẩm; import CSV; thuộc tính kiểu select / boolean.
