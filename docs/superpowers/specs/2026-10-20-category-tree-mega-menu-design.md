# Cây danh mục + mega menu (đợt 1) — Thiết kế

Ngày: 2026-10-20 · Trạng thái: đã duyệt · Tham chiếu: clip paddy.vn (menu "Chó", "Mèo")
Đợt 2 (riêng spec): trang admin quản lý danh mục.

## Mục tiêu
Danh mục 3 tầng dưới root `petshop`: loài (Chó, Mèo) → nhóm → mục lá, kèm mega menu desktop, menu xổ tầng mobile, banner và thương hiệu nổi bật chỉnh trong `/admin/cau-hinh`, lọc sản phẩm theo thương hiệu.

## Cây danh mục (slug · tên)
Root `petshop` giữ nguyên. `cho` đổi tên "Chó", `meo` đổi tên "Mèo" (giữ slug, giữ URL). Thứ tự hiển thị = thứ tự liệt kê (`sortOrder` 0, 1, 2…).

**cho · Chó**
- `cho-thuc-an` · Thức ăn: `hat-cho-cho` Hạt cho chó · `pate-cho-cho` Pate cho chó · `banh-thuong-cho-cho` Bánh thưởng · `thuc-an-cao-cap-cho-cho` Thức ăn cao cấp · `thuc-an-cho-cho-con` Thức ăn cho chó con · `thuc-an-thu-y-cho-cho` Thức ăn thú y · `sua-cho-cho-meo` Sữa cho chó mèo
- `cho-do-choi` · Đồ chơi: `thu-nhoi-bong` Thú nhồi bông · `xuong-gam` Xương gặm · `banh-quy-gam` Bánh quy gặm
- `cho-phu-kien-nha` · Phụ kiện & nhà: `vong-co-day-dat` Vòng cổ & dây dắt · `nem-chuong` Nệm & chuồng · `dung-cu-an-uong-cho-cho` Dụng cụ ăn uống · `ta-khay-ve-sinh` Tã & khay vệ sinh
- `cho-ve-sinh-suc-khoe` · Vệ sinh & sức khỏe: `sua-tam-cho-cho` Sữa tắm cho chó · `tri-ve-ran-xo-giun` Trị ve rận & xổ giun · `ve-sinh-rang-mieng` Vệ sinh răng miệng · `ve-sinh-tai-mat-cho-cho` Vệ sinh tai mắt · `vitamin-bo-sung-cho-cho` Vitamin & bổ sung

**meo · Mèo**
- `meo-thuc-an` · Thức ăn: `hat-cho-meo` Hạt cho mèo · `pate-cho-meo` Pate cho mèo · `banh-thuong-cho-meo` Bánh thưởng cho mèo · `sup-thuong-cho-meo` Súp thưởng cho mèo · `thuc-an-cho-meo-con` Thức ăn cho mèo con · `thuc-an-thu-y-cho-meo` Thức ăn thú y
- `meo-do-choi-phu-kien` · Đồ chơi & phụ kiện: `do-choi-cho-meo` Đồ chơi cho mèo · `ban-cao-mong` Bàn cào móng · `balo-tui-van-chuyen` Balo & túi vận chuyển · `dung-cu-an-uong-cho-meo` Dụng cụ ăn uống
- `meo-ve-sinh` · Vệ sinh: `sua-tam-cho-meo` Sữa tắm cho mèo · `ve-sinh-tai-mat-cho-meo` Vệ sinh tai mắt · `cham-soc-ve-sinh` Chăm sóc vệ sinh
- `meo-cat-khay` · Cát & khay vệ sinh: `cat-ve-sinh` Cát vệ sinh
- `meo-suc-khoe` · Sức khỏe: `vitamin-bo-sung-cho-meo` Vitamin & bổ sung · `cham-soc-suc-khoe` Chăm sóc sức khỏe

Không làm: "Gift Cards". "Tất cả thức ăn cho chó" là link tới nhóm, không phải danh mục.

## Backend
1. **Migration** `add_category_sort_order`: `Category.sortOrder Int @default(0)`. Thuần thêm cột, không mất dữ liệu; rollback = drop cột. Người dùng tự chạy `migrate deploy`/`dev`.
2. **Descendants:** `categorySubtreeIds(all, rootId)` (thuần, có test) — đọc mọi danh mục một lần rồi duyệt BFS trong bộ nhớ, chống vòng lặp (`visited`). `GET /products?categorySlug=` (public và admin) lọc theo toàn bộ cây con thay vì chỉ con trực tiếp.
3. **Lọc thương hiệu:** `GET /products?brand=` — trim, 1–100 ký tự (validator, sai → 422), so khớp `equals` + `mode: 'insensitive'`. Kết hợp được với `categorySlug`, `q`, `sort`.
4. **Thứ tự:** `GET /categories` sắp xếp `sortOrder asc, name asc`, trả thêm `sortOrder`.
5. **Script `seedCategoryTree`** (`npm run seed:category-tree`): tạo/cập nhật cây trên theo slug (upsert: name, parentId, sortOrder). Không xoá gì, không đụng sản phẩm. Chạy được mọi DB; in kế hoạch (tạo / cập nhật / giữ nguyên) và cần `--apply` mới ghi.
6. **Dữ liệu mẫu local:** `petshopCatalog.ts` trỏ sản phẩm mẫu vào danh mục mới (bảng dưới), bỏ 4 danh mục phẳng. Script `migrateDemoCategories` (có `localDbGuard`): chuyển sản phẩm theo bảng, rồi xoá `thuc-an-hat`, `pate`, `phu-kien`, `suc-khoe` nếu không còn sản phẩm/bài viết/ảnh tham chiếu.

| Sản phẩm mẫu | Danh mục mới |
|---|---|
| hat-cho-cho-truong-thanh-vi-ga | hat-cho-cho |
| hat-cho-meo-con | thuc-an-cho-meo-con |
| hat-cho-meo-truong-thanh | hat-cho-meo |
| pate-meo-ca-ngu | pate-cho-meo |
| pate-cho-vi-bo | pate-cho-cho |
| cat-ve-sinh-cho-meo-von-cuc | cat-ve-sinh |
| can-cau-do-choi-cho-meo | do-choi-cho-meo |
| bong-do-choi-tuong-tac-cho-cho | cho-do-choi |
| banh-thuong-cho-cho | banh-thuong-cho-cho |
| day-dat-vong-co-cho-cho | vong-co-day-dat |
| dem-ngu-em-cho-cho-meo | nem-chuong |
| sua-tam-cho-cho-meo | sua-tam-cho-cho |
| bo-cham-soc-long-5-mon | cho-ve-sinh-suc-khoe |

## Cấu hình (`/admin/cau-hinh`)
Setting `mega_menu_<slug-loài>` (`mega_menu_cho`, `mega_menu_meo`), JSON:
`{ "banner": { "image": "", "title": "", "href": "" }, "brands": [{ "name": "", "logo": "" }] }`
- Tối đa 8 thương hiệu; `name` bắt buộc, ≤ 60 ký tự; `logo` tuỳ chọn (ảnh upload qua `ImageField`, không có thì hiện tên).
- Banner hiện khi có `image`; `href` qua `isSafeHref`, sai thì bỏ link.
- Parse lỗi / thiếu → menu vẫn hiện cây, ẩn hàng thương hiệu và banner.
- Lưu → `revalidateTag('settings')` như các setting khác.

## Frontend
- **Dữ liệu:** `buildCategoryTree(all, rootSlug)` và `categoryTrail(all, slug)` (thuần, có test). `getShopCategoryTree()`; `getShopCategory(slug)` nhận mọi danh mục trong cây `petshop` (không chỉ con trực tiếp).
- **Desktop (≥ lg):** "Chó ▾", "Mèo ▾" thay 2 link "Cho chó", "Cho mèo". Mở khi hover (trễ ~150ms), click, hoặc Enter/Space; Esc đóng và trả focus; `aria-expanded`. Panel: cột nhóm (tiêu đề in hoa + mục lá + "Xem tất cả <nhóm> →"), hàng "Thương hiệu nổi bật" (+ "Xem tất cả" → trang loài), banner bên phải. HTML render sẵn ở server (link crawl được). "☰ Danh mục sản phẩm" liệt kê loài → nhóm (2 tầng).
- **Mobile:** menu ☰: Chó / Mèo xổ ra nhóm, nhóm xổ ra mục lá (`<details>`), mỗi dòng ≥ 44px.
- **Trang danh mục:** breadcrumb đủ cấp (UI + `BreadcrumbList`); chip danh mục con; sản phẩm của cả cây con; `?thuong-hieu=<tên>` lọc theo brand, hiển thị "Thương hiệu: X ✕", `noindex, follow`, canonical về trang danh mục. Thương hiệu trong menu → `/danh-muc/<loài>?thuong-hieu=<tên>`.
- **Khác:** sitemap liệt kê mọi danh mục trong cây; "Mua theo bé cưng" giữ 2 vòng Chó, Mèo; `/tim-kiem` bộ lọc danh mục dùng tầng loài.

## Kiểm tra
- Unit backend: `categorySubtreeIds` (3 tầng, vòng lặp, id không tồn tại); route `brand` sai → 422; seed plan (tạo/cập nhật/giữ nguyên).
- Unit frontend: `buildCategoryTree`, `categoryTrail`, parse `mega_menu_*` (thiếu, JSON hỏng, href xấu, > 8 thương hiệu), `listHref` giữ `thuong-hieu`.
- Curl production build: HTML trang chủ chứa link mục lá; `/danh-muc/hat-cho-cho` breadcrumb 4 cấp; `/danh-muc/cho` có sản phẩm cháu; `?thuong-hieu=` có noindex + canonical; sitemap có danh mục lá; 4 slug cũ → 404.
- Mobile 320/360/390/430/768/1024 + zoom 200%; bàn phím mở/đóng mega menu.

## Ngoài phạm vi
Trang admin danh mục (đợt 2), Gift Cards, bảng Brand riêng, ảnh/logo của paddy.vn (người dùng tự upload ảnh của mình).

## Ghi chép
ADR-016 trong `docs/DECISIONS.md`: cây danh mục nhiều tầng + `sortOrder`, lọc cây con trong bộ nhớ, tham số `brand` mới của `GET /products`, setting `mega_menu_*`.
