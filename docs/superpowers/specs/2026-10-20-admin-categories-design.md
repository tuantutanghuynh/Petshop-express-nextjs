# Trang admin quản lý danh mục (đợt 2) — Thiết kế

Ngày: 2026-10-20 · Trạng thái: đã duyệt · Wireframe: `frontend-petshop/design/wireframes/admin-categories.html`
Đợt 3 (spec riêng): hero dạng slide, admin CRUD.

## Mục tiêu
`/admin/danh-muc`: xem cây danh mục petshop kèm số sản phẩm; thêm, sửa (tên, slug, mô tả, danh mục cha), xoá, sắp xếp thứ tự; quản lý thông số (CategoryAttribute) của từng danh mục. Đổi slug không làm gãy URL cũ (308).

## Phạm vi dữ liệu
- Chỉ cây dưới root `petshop` (BRAND_SLUG). Root và mọi danh mục của storefront khác (gốm) không sửa / xoá / sắp xếp được qua các API mới — trả 404 `CATEGORY_NOT_FOUND` (backend mục 2).
- Độ sâu tối đa 3 tầng dưới root (loài → nhóm → mục lá), vì menu chỉ hiển thị 3 tầng.

## Backend
Mọi API mới: `authenticate` + `requireRole('admin')`; lỗi qua `ApiError`; validate lỗi → 422 `VALIDATION_ERROR`.

1. **Migration** `add_category_slug_redirects`: bảng `CategorySlugRedirect { oldSlug String @id, categoryId String, createdAt }`, FK tới Category `onDelete: Cascade`, index `categoryId`. Thuần thêm bảng; rollback = drop bảng.
2. **Phạm vi:** helper `assertInShop(categoryId)` — danh mục phải nằm trong cây con của root `X-Brand-Slug` (mặc định `petshop`) và không phải chính root; sai → 404 `CATEGORY_NOT_FOUND` (không lộ danh mục storefront khác).
3. `GET /categories/admin/list` — mọi danh mục trong cây shop (kể cả root), mỗi dòng kèm `sortOrder` và `_count { products, blogPosts, galleryItems, children }`, sắp `sortOrder, name`.
4. `POST /categories` (đã có) — bổ sung: validate như PATCH; `parentId` bắt buộc thuộc cây shop; độ sâu mới ≤ 3; slug không trùng slug đang dùng **và** không trùng `oldSlug` của redirect (409 `SLUG_TAKEN`); `sortOrder` = cuối nhánh.
5. `PATCH /categories/:id` `{ name?, slug?, description?, parentId? }`:
   - name 1–100 (trim), slug `^[a-z0-9-]{1,80}$`, description ≤ 500 (rỗng → null).
   - Đổi cha: cha mới thuộc cây shop, không phải chính nó hoặc con cháu của nó (409 `CATEGORY_CYCLE`); độ sâu cha mới + chiều cao cây con ≤ 3 (409 `CATEGORY_TOO_DEEP`); `sortOrder` = cuối nhánh mới.
   - Đổi slug (một transaction): slug mới trùng slug khác hoặc `oldSlug` của danh mục khác → 409 `SLUG_TAKEN`; xoá redirect có `oldSlug` = slug mới của chính danh mục này (đổi về tên cũ); thêm redirect `oldSlug` = slug hiện tại → danh mục này.
6. `DELETE /categories/:id` — còn con / sản phẩm / bài viết / ảnh → 409 `CATEGORY_NOT_EMPTY` kèm `details` số lượng; ngược lại xoá thông số + danh mục (redirect xoá theo cascade). 200 `{ message }` (theo quy ước xoá có sẵn, vd. giỏ hàng).
7. `PUT /categories/reorder` `{ parentId, ids: string[] }` — `ids` phải đúng tập con trực tiếp của `parentId` (thiếu / thừa / trùng → 422 `REORDER_MISMATCH`); ghi `sortOrder = index` trong một transaction.
8. `GET /categories/resolve/:slug` (công khai) — `{ slug }` hiện tại nếu `:slug` là slug cũ trong `CategorySlugRedirect`; không có → 404.
9. Tests: unit thuần (độ sâu, vòng lặp, khớp reorder); supertest DB-free (401 không token, 403 không phải admin, 422 input xấu); DB suite (sửa, chuyển nhánh, cycle, quá sâu, đổi slug + resolve + đổi về, xoá rỗng / không rỗng, reorder, ngoài phạm vi shop → 404).

## Frontend
1. **`/admin/danh-muc`** (thêm vào menu admin, cùng kiểu `app/admin/*`, `authFetch`, chuyển `/admin/login` khi chưa có token). Trạng thái loading / error / empty / success.
2. **Cây:** danh sách lồng nhau theo `sortOrder`; mỗi dòng: tên, số SP, nút Sửa · ↑ · ↓ · Xoá (≥ 44px, ↑ ở đầu / ↓ ở cuối nhánh bị disable). "+ Thêm danh mục" ở đầu trang (cha = root) và "+ Thêm mục con" trong từng dòng có thể có con (độ sâu < 3).
3. **Panel sửa / thêm:** bottom sheet trên mobile (`<dialog>`), cột phải từ `lg`. Trường: Tên, Slug (tự sinh từ tên khi thêm — bỏ dấu, chữ thường, `-`; khi sửa slug hiện cảnh báo "URL cũ sẽ tự chuyển sang URL mới"), Danh mục cha (`<select>` chỉ liệt kê vị trí hợp lệ: không phải chính nó / con cháu, không làm quá 3 tầng), Mô tả. Lỗi theo từng ô, `focusFirstError`, khoá nút khi đang lưu. Slug của `cho`, `meo` (MEGA_MENU_SLUGS) bị khoá kèm giải thích.
4. **Thông số** (trong panel sửa): danh sách (tên · key · kiểu, nút xoá có xác nhận), form thêm (tên + kiểu chữ/số) dùng API sẵn có.
5. **Xoá:** hộp xác nhận; 409 → hiện lý do ("Còn 3 sản phẩm, 2 danh mục con…").
6. **Sau mỗi thay đổi:** `revalidateStorefront(['categories', 'products'])`.
7. **Khách hàng:** `/danh-muc/[slug]` khi không tìm thấy → hỏi `resolve`; có slug mới → `permanentRedirect` (308) tới `/danh-muc/<mới>` giữ nguyên query; không có → 404 như cũ.
8. Pure helpers có test: `slugify(name)`, `validParents(tree, id)`, `moveInSiblings(ids, id, dir)`, `categoryDepth`.

## Kiểm tra
Unit + DB tests ở trên; lint / typecheck / build; curl `/danh-muc/<slug-cũ>` → 308 `Location` mới (giữ query); trình duyệt: thêm → sửa → đổi slug → sắp xếp → xoá ở 390 / 768 / 1280, zoom 200%, bàn phím (Esc đóng panel, focus trả về nút).

## Ngoài phạm vi
Kéo-thả, upload ảnh cho danh mục, sửa / đổi tên key thông số, hero slide (đợt 3).

## Ghi chép
ADR-017: bảng `CategorySlugRedirect` + 308, giới hạn 3 tầng, API admin danh mục.
