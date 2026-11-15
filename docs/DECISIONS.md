# Architecture Decision Records

## ADR-001: Cho phép mọi AI crawler — 2026-10-12
**Bối cảnh:** Site thú cưng public, muốn được tìm kiếm và trích dẫn tối đa (Google, Bing, ChatGPT, Perplexity, Gemini, Claude...).
**Quyết định:** Cho phép tất cả bot, gồm bot tìm kiếm, trích dẫn và huấn luyện. `robots.ts` chỉ disallow `/admin`, `/api`, giỏ hàng, checkout, tài khoản.
**Lý do:** Ưu tiên khả năng hiển thị; nội dung là kiến thức công khai, không có dữ liệu độc quyền cần bảo vệ.
**Phương án đã loại:** Chặn bot huấn luyện (GPTBot, Google-Extended, CCBot) — giảm khả năng thương hiệu xuất hiện trong câu trả lời AI.
**Hệ quả:** Nội dung có thể được dùng để huấn luyện mô hình. Đổi chính sách = task LARGE + ADR mới.

## ADR-002: Giữ cấu trúc thư mục phẳng ở backend — 2026-10-12
**Bối cảnh:** Template CLAUDE.md mô tả `backend/src/modules/<feature>/`, code thật dùng `routes/ controllers/ services/ middlewares/`.
**Quyết định:** Ghi đúng cấu trúc thật vào CLAUDE.md; không di chuyển file. Logic nghiệp vụ phức tạp mới (tiền, kho, trạng thái) tách ra `services/`.
**Lý do:** Di chuyển toàn bộ file là refactor lớn, rủi ro cao, không đem lại tính năng.
**Phương án đã loại:** Chuyển sang `src/modules/` ngay bây giờ.
**Hệ quả:** Controller hiện còn chứa business logic; tách dần khi chạm tới.

## ADR-003: Tách rule SEO và mobile UI ra `.claude/rules/` — 2026-10-12
**Bối cảnh:** CLAUDE.md dài 680 dòng, vượt khuyến nghị ~200 dòng, làm Claude tuân thủ kém hơn.
**Quyết định:** Chuyển checklist SEO · AEO · GEO · AIO · SXO sang `.claude/rules/seo.md` và rule giao diện sang `.claude/rules/mobile-ui.md`, nạp theo `paths:`. CLAUDE.md giữ yêu cầu nghiệm thu (mục 0.8 + Definition of Done) trỏ tới hai file này.
**Lý do:** Rule chỉ nạp khi làm frontend / nội dung, giữ context gọn mà vẫn bắt buộc.
**Phương án đã loại:** Giữ nguyên một file dài; dùng `@import` (không giảm context).
**Hệ quả:** Khi task chạm trang public mà Claude chưa đọc file khớp `paths`, rule chưa nạp — CLAUDE.md mục 0.8 nhắc phải đọc.

## ADR-004: Baseline migration, CHECK constraints tồn kho, index danh sách — 2026-10-12
**Bối cảnh:** `prisma/migrations` thiếu 7 bảng (Cart, CartItem, Order, OrderItem, QuoteRequest, SiteSetting, PasswordResetToken), 5 index và kiểu cột giá (BIGINT ≠ Int) vì trước đây dùng `db push`. DB tạo mới chỉ từ migration thì app không chạy. Bộ test race cho thấy `reservedQuantity` có thể âm mà DB không chặn; danh sách Product / BlogPost seq scan trên 20 000 dòng.
**Quyết định:** 3 migration, mỗi cái một việc:
1. `20261012120000_baseline_schema_drift` — đúng bằng `prisma migrate diff` từ migration cũ tới schema hiện tại.
2. `20261012120100_add_stock_check_constraints` — `stockQuantity >= 0`, `reservedQuantity >= 0`, `reservedQuantity <= stockQuantity`.
3. `20261012120200_add_list_indexes` — `Product(status, createdAt, id)`, `BlogPost(status, publishedAt, id)`.
Bộ test DB dựng schema bằng `migrate deploy` (không còn `db push`) để luôn kiểm chứng migration.
**Lý do:** migration là nguồn sự thật duy nhất cho mọi môi trường; CHECK là lưới an toàn cuối khi code race; index theo đúng filter + sort + tie-breaker.
**Phương án đã loại:** tiếp tục `db push` (không có lịch sử, không rollback được); `prisma migrate reset` (xoá dữ liệu).
**Hệ quả / cách áp dụng trên DB đã có dữ liệu:**
1. Backup DB. `npx prisma migrate status`.
2. DB đã có các bảng (tạo bằng db push): `npx prisma migrate resolve --applied 20261012120000_baseline_schema_drift` — KHÔNG chạy migration 1.
3. Kiểm tra dữ liệu hỏng do race cũ (phải ra 0 dòng trước bước 4):
   ```sql
   SELECT id, sku, "stockQuantity", "reservedQuantity" FROM "ProductVariant"
   WHERE "stockQuantity" < 0 OR "reservedQuantity" < 0 OR "reservedQuantity" > "stockQuantity";
   ```
   Sửa `reservedQuantity` bằng cách tính lại từ đơn đang chờ thanh toán:
   ```sql
   UPDATE "ProductVariant" v
   SET "reservedQuantity" = COALESCE((
     SELECT sum(oi.quantity) FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
     WHERE oi."variantId" = v.id AND o."orderStatus" = 'PENDING_PAYMENT'), 0);
   ```
   `stockQuantity` âm không tự sửa được — phải kiểm kho thực tế rồi nhập lại.
4. `npx prisma migrate deploy` (chạy migration 2 và 3).
Rollback: mỗi file migration có khối ROLLBACK ở đầu file.

## ADR-005: CORS chỉ cho origin liệt kê rõ — 2026-10-12
**Bối cảnh:** `app.ts` chấp nhận mọi origin `*.vercel.app` với `credentials: true`; ai cũng tạo được site trên vercel.app để đọc response của admin đang đăng nhập. Origin bị từ chối còn trả 500.
**Quyết định:** chỉ `FRONTEND_URLS` (danh sách chính xác). Preview Vercel qua `FRONTEND_ORIGIN_PATTERN` (regex, tuỳ chọn, mặc định trống). Origin lạ: không gửi header CORS (`callback(null, false)`), không 500.
**Lý do:** project Vercel dự kiến tên `tupetshop`, chưa có team slug / domain riêng. Regex trên domain dùng chung không kín tuyệt đối (một project tên `tupetshop-x-<team>` cũng khớp).
**Phương án đã loại:** `endsWith('.vercel.app')`; regex `tupetshop-*` không kèm team.
**Hệ quả:** khi deploy phải thêm `https://tupetshop.vercel.app` (và domain riêng nếu có) vào `FRONTEND_URLS`; preview bị chặn tới khi đặt pattern.

## ADR-006: Rate limit theo user, miễn cho server Next.js — 2026-10-18
**Bối cảnh:** limiter chung 100 req/15 phút đếm theo IP. Next.js SSR gọi API từ 1 IP → chặn cả site sau vài chục lượt xem; mạng 4G (CGNAT) dùng chung IP → khách chặn lẫn nhau (ảnh hưởng app Flutter sau này).
**Quyết định:** key = `user:<sub>` khi có access token **hợp lệ** (đã verify chữ ký + hạn), ngược lại `ip:<ip>` (IPv6 gom /56). Request có `X-Internal-Secret` = `INTERNAL_API_SECRET` (so sánh hằng thời gian) được bỏ qua limiter; secret trống → không bao giờ khớp. Limiter chống spam của `/contact` và `/quote-requests` vẫn theo IP.
**Lý do:** token giả / hết hạn không được tạo bucket mới (nếu không, đổi token mỗi request là né được giới hạn).
**Phương án đã loại:** nâng giới hạn IP (vẫn chặn CGNAT, yếu hơn với bot); allowlist IP của server Next (IP Vercel thay đổi).
**Hệ quả:** phải đặt cùng một `INTERNAL_API_SECRET` ở backend (Render) và frontend (Vercel, không có tiền tố NEXT_PUBLIC_). Lộ secret = mất giới hạn → đổi secret ở cả hai nơi.

## ADR-007: Tồn kho đổi bằng delta + sổ kho InventoryMovement — 2026-10-18
**Bối cảnh:** admin sửa tồn bằng `PATCH /products/variants/:id {stockQuantity}` (ghi đè tuyệt đối) → mất cập nhật: lần trừ kho của đơn COD giữa lúc admin đọc và lưu bị xoá. Không có dấu vết ai đổi kho, vì sao.
**Quyết định:** `stockQuantity` chỉ đổi bằng delta; mỗi thay đổi tồn VẬT LÝ ghi 1 dòng `InventoryMovement` (variantId, sku, delta, quantityAfter, reason, note, userId, orderId, seq) trong cùng transaction. Admin: `POST /products/variants/:id/stock-movements` `{type: ADJUST, delta, reason: PURCHASE|DAMAGED|RETURN|OTHER}` hoặc `{type: STOCKTAKE, countedQuantity}` (khoá dòng, delta = đếm − hệ thống). Hệ thống: OPENING (tạo SP / biến thể), SALE (COD checkout, xác nhận chuyển khoản), CANCEL_RESTOCK (huỷ đơn đã trừ kho). Giữ / nhả hàng (reservedQuantity) **không** ghi sổ. `PATCH` biến thể từ chối `stockQuantity` (422). `GET …/stock-movements` xem lịch sử.
**Lý do:** delta + UPDATE có điều kiện không mất cập nhật; sổ kho cho truy vết và bất biến kiểm được: sum(delta) = stockQuantity. `seq` (autoincrement, ghi khi đang giữ khoá dòng) là thứ tự thật — `createdAt` = thời điểm BẮT ĐẦU transaction, độ chính xác ms.
**Phương án đã loại:** giữ PATCH tuyệt đối + điều kiện (vẫn mất bán hàng xen giữa); ghi sổ cả giữ hàng (không phải hàng vật lý, làm sổ nhiễu).
**Hệ quả:** migration `20261018120000_add_inventory_movements` (thêm bảng + OPENING cho biến thể hiện có; rollback = DROP TABLE). Breaking change nhỏ ở API admin (frontend admin chưa dùng). Dòng sổ giữ lại khi xoá biến thể / user / đơn (SET NULL, có snapshot SKU).

## ADR-008: Frontend foundation — site URL from env, robots/sitemap from code, storefront chrome — 2026-10-18

**Bối cảnh:** Frontend còn domain cũ `miniecom-blog.vercel.app` hardcode trong `sitemap.ts` và `public/robots.txt`, `lastModified: new Date()`, sitemap chỉ lấy 50 bài, tên "Petshop", trang chủ là mẫu create-next-app. Dự án chưa có domain.

**Quyết định:**
- Mọi URL tuyệt đối lấy từ `NEXT_PUBLIC_SITE_URL` qua `lib/site.ts`; build có `APP_ENV=production` mà thiếu biến → **build fail**.
- `public/robots.txt` (xoá) → `app/robots.ts`: cho phép mọi bot (giữ ADR-001), disallow `/admin`, `/api`, `/gio-hang`, `/dat-hang`, `/tai-khoan`, `/dang-nhap`, `/dang-ky`.
- `app/sitemap.ts`: `revalidate = 3600`, duyệt hết các trang `/blog`, `lastModified` chỉ từ `updatedAt` thật; API lỗi → trả trang tĩnh + log.
- Môi trường khác production: header `X-Robots-Tag: noindex, nofollow` cho mọi response (`next.config.ts`). `/admin` có thêm meta `noindex`.
- Header / footer / bottom nav của cửa hàng nằm ở root layout, ẩn trên `/admin` bằng client wrapper `StoreChrome` (đọc `usePathname`).
- Giữ URL `/blog`, `/gallery` (không đổi sang `/kien-thuc` như wireframe).

**Lý do:** chưa có domain; canonical/sitemap trỏ sai domain là lỗi SEO nặng nhất; staging bị index khó gỡ.

**Phương án đã loại:**
- Route group `app/(store)/` cho chrome: sạch hơn nhưng phải di chuyển thư mục `blog`, `gallery` → để task riêng.
- Đổi `/blog` → `/kien-thuc`: cần redirect 308 + cập nhật sitemap, chưa cần lúc này.

**Hệ quả:** Vercel phải đặt `NEXT_PUBLIC_SITE_URL` và `APP_ENV=production` (cả lúc build) cho môi trường Production; Preview không đặt `APP_ENV` để luôn noindex. Card sản phẩm / danh mục chưa có link cho tới khi có `/san-pham/[slug]`, `/danh-muc/[slug]`.

## ADR-009: URL trang danh mục và sản phẩm — 2026-10-18

**Bối cảnh:** Cần trang public cho danh mục và sản phẩm. Wireframe đề xuất `/danh-muc/[slug]`, `/san-pham/[slug]`. DB còn danh mục / sản phẩm của brand cũ (gốm).

**Quyết định:**
- URL tiếng Việt không dấu: `/danh-muc/[slug]`, `/san-pham/[slug]` (slug = slug trong DB, đã unique).
- Chỉ phục vụ danh mục con của root `NEXT_PUBLIC_BRAND_SLUG` và sản phẩm thuộc các danh mục đó; slug của brand khác → 404.
- Phân trang `?page=N` (số nguyên dương thuần, sai định dạng hoặc vượt số trang → 404). Trang ≥ 2: `noindex, follow` + self-canonical, không vào sitemap; `?page=1` canonical về URL gốc.
- Trang sản phẩm ISR (`generateStaticParams` trả `[]`), trang danh mục render động (đọc `searchParams`); đã kiểm tra title / canonical nằm trong `<head>`.
- Sitemap thêm danh mục (không `lastModified` — Category chưa có `updatedAt`) và sản phẩm (`updatedAt` thật).

**Lý do:** URL ngắn, đọc được, khớp ngôn ngữ site; không để nội dung brand khác lọt vào dưới tên "Siêu thị của chó mèo".

**Phương án đã loại:** `/products/[slug]` (tiếng Anh, lệch ngôn ngữ site); canonical trang ≥ 2 về trang 1 (Google coi là sai khi nội dung khác nhau).

**Hệ quả:** Đổi slug sản phẩm sau này cần lưu slug cũ + redirect 308 (chưa có cột — migration). Product chưa có `metaTitle` / `metaDescription`: tạm dùng tên + đoạn đầu mô tả.

## ADR-010: Next.js làm BFF cho khách hàng, token trong cookie httpOnly — 2026-10-18

**Bối cảnh:** Giỏ hàng / đặt hàng cần khách đăng nhập. Backend trả access (15 phút) + refresh (7 ngày, dùng một lần, có reuse detection, **không có thời gian ân hạn**) trong body JSON. Frontend (Vercel) và backend (Render) khác site, chưa có domain → cookie do backend đặt sẽ là cookie bên thứ ba (Safari chặn). Admin đang để token trong localStorage (nợ kỹ thuật).

**Quyết định:**
- Trình duyệt chỉ gọi `/api/*` của Next. Next giữ token trong cookie `httpOnly`, `SameSite=Lax`, production dùng tiền tố `__Host-` + `Secure`; access cookie sống 14 phút (< JWT 15 phút).
- Chỉ `POST /api/auth/refresh` được xoay refresh token; no-op khi access cookie còn. Route khác trả `401 ACCESS_EXPIRED`. Trình duyệt (`lib/bffClient.ts`) gom refresh trong tab (promise dùng chung) và giữa các tab (`navigator.locks`).
- Server Component không refresh (không ghi được cookie).
- CSRF: ghi (POST/PATCH/DELETE) phải có `Origin` trùng `NEXT_PUBLIC_SITE_URL`.
- BFF gửi `X-Internal-Secret` + `X-Client-IP` (IP khách). Backend chỉ tin `X-Client-IP` khi có secret; secret chỉ miễn rate limit cho render trang (không kèm `X-Client-IP`). Thêm limiter 10 lần / 15 phút / IP cho login, register, request-password-reset.
- Xoá cookie bằng cách ghi đè `maxAge: 0` với cùng thuộc tính — `cookies().delete()` của Next bỏ `Secure`, trình duyệt từ chối với cookie `__Host-` (đã gặp: khách đăng xuất mà vẫn còn phiên).

**Lý do:** XSS không lấy được token; chạy được ngay trên vercel.app + onrender.com; không đổi API contract backend.

**Phương án đã loại:** localStorage (XSS lấy được token); backend tự đặt cookie (cần domain chung, chưa có).

**Hệ quả:** Mọi request khách đi thêm một chặng qua Next. Vercel và Render phải có cùng `INTERNAL_API_SECRET`. Thiếu secret: BFF vẫn chạy nhưng rate limit login tính theo IP của server Next (mọi khách chung một bucket 10 lần) — bắt buộc đặt secret trên production.

## ADR-011: Tìm kiếm không dấu và sắp xếp theo giá bằng cột dẫn xuất — 2026-10-19

**Bối cảnh:** Trang danh mục cần tìm kiếm (`q`) và sắp xếp theo giá. Khách gõ không dấu ("pate meo"); `ILIKE` không khớp "Pate mèo". Giá nằm ở `ProductVariant`; Prisma không `orderBy` được theo `MIN()` của quan hệ. Quy mô dự kiến: dưới vài nghìn sản phẩm.

**Quyết định:**
- Thêm 2 cột dẫn xuất vào `Product` (migration `20261019120000`, chỉ thêm, backfill bằng SQL): `searchName` (tên viết thường, bỏ dấu, đ→d — `utils/searchText.ts`) và `minPrice` (giá biến thể rẻ nhất), index `(status, minPrice, id)`.
- Mọi đường ghi (tạo / sửa tên sản phẩm, thêm / sửa giá / xoá biến thể, seed, factory test) cập nhật trong cùng transaction; ghi biến thể khoá dòng `Product` (`FOR UPDATE`) để hai lần đổi giá đồng thời không để lại `minPrice` sai (có test race).
- API: `q` 2–100 ký tự sau chuẩn hoá; `sort` ∈ {`-createdAt`, `price`, `-price`}, giá trị khác → 422; `id` là tie-breaker; giá trị null xếp cuối. Escape `%` `_` vì Prisma `contains` không escape.
- Chưa tạo index trigram: ở quy mô hiện tại quét tuần tự đủ nhanh; thêm khi số đo cho thấy cần.

**Lý do:** không cần extension (`unaccent` / `pg_trgm`) — chạy được cả Postgres local lẫn Supabase; sort theo giá dùng index thay vì sắp xếp cả bảng.

**Phương án đã loại:** `unaccent` (không IMMUTABLE, cần bọc hàm + bật extension); sort bằng raw SQL theo subquery (không index được, phải tự ghép kết quả); trigger DB (lệch phong cách code, khó test bằng Vitest).

**Hệ quả:** Thêm đường ghi biến thể mới mà quên `refreshMinPrice` → `minPrice` sai; test bất biến trong `catalog.search.test.ts` là chốt chặn. Production cần chạy migration này cùng 2 migration còn thiếu.

## ADR-012: URL tìm kiếm và sắp xếp trên storefront — 2026-10-19

**Bối cảnh:** Có `q` / `sort` ở API (ADR-011); cần đưa lên trang public mà không tạo nội dung trùng lặp cho Google.

**Quyết định:**
- Sắp xếp danh mục: `/danh-muc/[slug]?sort=price|-price` (mặc định "mới nhất" không ghi lên URL; `?sort=-createdAt` hoặc giá trị lạ → 404). URL có `sort`: `noindex, follow` + canonical về URL gốc danh mục. Phân trang giữ `sort`.
- Tìm kiếm: `/tim-kiem?q=…&page=…&sort=…`, `noindex, follow`, thêm `/tim-kiem` vào disallow của robots.txt. Ô tìm kiếm là form GET thuần (chạy không cần JS).

**Lý do:** mỗi trạng thái danh sách có đúng một URL; trang tìm kiếm nội bộ là trang mỏng, vô hạn (seo.md cấm index).

**Phương án đã loại:** state sắp xếp trong `useState` (mất khi tải lại, không chia sẻ được, không render phía server); canonical trang có `sort` về chính nó (tạo nhiều bản trùng nội dung).

**Hệ quả:** Đổi tên tham số / giá trị sort sau này cần redirect từ URL cũ.

## ADR-013: Trang Kiến thức và Thư viện ảnh theo wireframe — 2026-10-19

**Bối cảnh:** `/blog`, `/blog/[slug]`, `/gallery` còn giao diện cũ (khung hẹp). Wireframe cần chip chủ đề, mục lục, masonry, lightbox. `GalleryItem` chưa có `width` / `height`.

**Quyết định:**
- Chip chủ đề: `/blog?chu-de=<slug>`, chỉ hiện chủ đề có bài (≥ 2 chủ đề mới hiện thanh chip). URL lọc: `noindex, follow`, canonical `/blog`. Slug lạ → 404. Phân trang `?page=N` (12 bài; trang ≥ 2 noindex, self-canonical).
- Mục lục sinh từ H2 (id không dấu, tiền tố `muc-`), hiện khi bài có ≥ 2 H2: thẻ dính cột phải (desktop), `<details>` thu gọn (phone). Dòng miễn trừ thú y ở mọi bài (YMYL). Sản phẩm liên quan khi chủ đề là danh mục của shop.
- Masonry bằng CSS columns, xoay vòng tỉ lệ khung 3:4 / 1:1 / 4:3 + `object-cover` (không CLS, không migration). Lightbox `<dialog>` gốc: Esc / chạm nền đóng, ← → / vuốt chuyển ảnh, trả focus về ảnh đã mở.

**Lý do:** khớp wireframe mà không đổi URL hiện có, không đụng backend.

**Phương án đã loại:** trang trụ cột riêng `/kien-thuc/<chu-de>` (cần URL mới + nội dung trụ cột — làm khi có bài thật); lưu kích thước ảnh gallery (migration + sửa trang upload — làm khi gallery có nhiều ảnh thật, ảnh hiện bị cắt mép).

**Hệ quả:** Ảnh gallery bị cắt theo khung. Khi đổi sang URL trụ cột, `?chu-de=` cần redirect 308.

## ADR-014: Nội dung trang chủ và CTKM do chủ shop chỉnh trong admin — 2026-10-19

**Bối cảnh:** Thanh thông báo viết cứng trong code; 5 thẻ / banner CTKM đọc `homepage_promo_*` nhưng không có chỗ nhập. Chủ shop cần đổi CTKM mà không sửa code.

**Quyết định:**
- Trang `/admin/cau-hinh` (theo wireframe `admin-settings`) lưu mọi thứ bằng một `PATCH /settings`, rồi gọi `/api/revalidate` tag `settings` → trang chủ, header, footer cập nhật ngay.
- Key mới: `announcement_items` (JSON, ≤ 3 dòng), `homepage_hero_badge`, `homepage_hero_cta2_label/href`, `homepage_category_images` (JSON `{slug: url}`). `homepage_promo_N` thêm `enabled`, `startsAt`, `endsAt` (ngày theo giờ Việt Nam, cả ngày).
- Kiểm tra hai lớp: form admin chặn link / ảnh / ngày sai trước khi lưu (`lib/adminSettings.ts`); trang public bỏ qua mọi giá trị không hợp lệ (`lib/settings.ts`, `parsePromo`). Màu CTKM cố định theo vị trí.
- Ảnh danh mục lưu trong setting, không thêm cột vào `Category`.

**Lý do:** không cần migration; dùng API settings có sẵn; chủ shop thấy lỗi ngay trên ô thay vì banner im lặng không hiện.

**Phương án đã loại:** cột `imageUrl` cho `Category` + trang admin danh mục (migration, chưa cần); bảng `Promotion` riêng (migration, quá mức cho 5 vị trí cố định).

**Hệ quả:** CTKM bật / tắt theo ngày lệch tối đa 5 phút (cache ISR). Trang admin vẫn gọi thẳng backend bằng token localStorage (nợ kỹ thuật cũ) — cần `FRONTEND_URLS` chứa origin của frontend.

## ADR-015: Trang nội dung do chủ shop viết, danh sách "Nhờ tư vấn" phía client — 2026-10-20

**Bối cảnh:** Wireframe có Giới thiệu, Chính sách, Tư vấn báo giá, Liên hệ. Nội dung giới thiệu / chính sách phải đúng sự thật (YMYL, CRO) — code không được tự viết.

**Quyết định:**
- `/gioi-thieu`, `/chinh-sach/giao-hang-doi-tra`, `/chinh-sach/bao-mat`: Markdown lưu trong setting (`page_about`, `policy_*`), sửa ở `/admin/cau-hinh`. Chưa có chữ → 404, không có link ở footer, không vào sitemap.
- Danh sách "Nhờ tư vấn" lưu `sessionStorage` (tối đa 50 món, 1–99 mỗi món); backend chụp lại tên / giá lúc gửi.
- Form báo giá và liên hệ đi qua BFF (`relayPublic`): chống CSRF theo Origin, gửi kèm token nếu có; limiter của `/contact` và `/quote-requests` ở backend đếm theo IP thật của khách (`ipBucket`).

**Phương án đã loại:** viết sẵn chính sách mẫu (sai sự thật nếu shop làm khác); bảng `Page` riêng (migration, quá mức cho 3 trang).

**Hệ quả:** Chủ shop phải tự viết nội dung trước khi các trang này xuất hiện.

## ADR-016: Cây danh mục nhiều tầng, mega menu và lọc theo thương hiệu — 2026-10-20
**Bối cảnh:** Danh mục petshop chỉ có 1 tầng phẳng (Cho chó, Cho mèo, Thức ăn hạt, Pate…). Chủ shop muốn danh mục và menu giống paddy.vn: Chó/Mèo → nhóm → mục lá, kèm banner và "Thương hiệu nổi bật". Backend lọc danh mục chỉ lấy con trực tiếp.
**Quyết định:** Cây 3 tầng dưới root `petshop` (46 danh mục, dữ liệu ở `backend/scripts/categoryTree.ts`), thêm `Category.sortOrder` (migration thuần thêm cột). Bộ lọc `categorySlug` của sản phẩm/blog/gallery lấy mọi tầng con: đọc toàn bộ (id, parentId) một lần rồi duyệt trong bộ nhớ (`categoryScopeIds`). `GET /products` thêm `brand` (1–100 ký tự, so khớp không phân biệt hoa thường với `Product.brand`). Banner + tối đa 8 thương hiệu mỗi menu lưu ở setting `mega_menu_<slug>`. Trang `?thuong-hieu=` noindex, canonical về danh mục. Script `seed:category-tree` chạy được trên production, mặc định dry run, `--apply` mới ghi, chỉ tạo/cập nhật theo slug.
**Lý do:** Bảng danh mục chỉ vài chục dòng — duyệt trong bộ nhớ đơn giản và một round trip với mọi độ sâu. Giữ `GET /categories` phẳng nên không đổi contract. Thương hiệu là chữ chủ shop gõ, chưa cần bảng riêng.
**Phương án đã loại:** Recursive CTE (`WITH RECURSIVE`) — thừa với quy mô này. Bảng `Brand` + logo gắn sản phẩm — làm khi cần trang thương hiệu riêng. Giữ 4 danh mục phẳng cũ song song — menu thừa, không khớp thiết kế.
**Hệ quả:** Production phải chạy `prisma migrate deploy` rồi `npm run seed:category-tree -- --apply`. Tên thương hiệu trong menu phải viết giống ô "Thương hiệu" của sản phẩm. 4 slug cũ (`thuc-an-hat`, `pate`, `phu-kien`, `suc-khoe`) thành 404 — chưa có production nên không cần redirect. Trang admin quản lý danh mục là đợt 2. Bổ sung cùng ngày (theo yêu cầu): bỏ dropdown "☰ Danh mục sản phẩm" — menu chỉ còn Trang chủ · Chó ▾ · Mèo ▾ · …; vòng "Mua theo bé cưng" thành danh sách admin chỉnh (`homepage_category_circles`: tên + link + ảnh, tối đa 8), mặc định 6 vòng như wireframe, vẫn dùng ảnh cũ của `homepage_category_images` cho vòng Chó/Mèo mặc định.

## ADR-017: Quản lý danh mục trong admin, giữ URL cũ bằng chuyển hướng 308 — 2026-10-21
**Bối cảnh:** Cây danh mục (ADR-016) chỉ sửa được bằng script. Chủ shop cần thêm / sửa / xoá / sắp xếp / chuyển nhánh và đổi slug ngay trong admin. Đổi slug là đổi URL công khai.
**Quyết định:** API admin (`GET /categories/admin/list`, `POST`, `PATCH /:id`, `DELETE /:id`, `PUT /reorder`) giới hạn trong cây con của brand (`resolveBrand`, header `X-Brand-Slug`); root và storefront khác trả 404. Tối đa 3 tầng dưới root; chặn vòng lặp; xoá chỉ khi không còn con / sản phẩm / bài viết / ảnh (409 kèm số lượng). Slug cũ lưu ở bảng `CategorySlugRedirect` (migration thuần thêm bảng, cascade khi xoá danh mục); `GET /categories/resolve/:slug` + `permanentRedirect` → `/danh-muc/<cũ>` trả 308 tới slug mới, giữ query. Slug `cho`, `meo` khoá trong UI vì gắn với mega menu.
**Lý do:** Link cũ trong khuyến mãi, vòng tròn, banner và trên Google không gãy; Google chuyển thứ hạng theo 308. Giới hạn 3 tầng khớp menu.
**Phương án đã loại:** Cho đổi slug và để URL cũ 404 — mất thứ hạng, gãy link. Kéo-thả để sắp xếp — khó dùng trên điện thoại; dùng ↑↓.
**Hệ quả:** Production cần chạy migration `20261021120000_add_category_slug_redirects`. Slug cũ đang chuyển hướng không dùng lại được cho danh mục khác (409). Kèm sửa lỗi giỏ hàng: `resolveBrand` lấy mọi tầng con (commit 179d948).

## ADR-018: Quản lý sản phẩm trong admin, giới hạn theo shop, giữ URL cũ bằng 308 — 2026-11-04
**Bối cảnh:** Chủ shop chưa có màn hình tạo / sửa sản phẩm. Các API admin sản phẩm (sửa, xoá, biến thể, ảnh, sổ kho) không kiểm tra sản phẩm có thuộc shop hay không, và danh mục khi tạo / sửa có thể thuộc storefront khác. Đổi slug sản phẩm là đổi URL công khai (link chia sẻ, Google).
**Quyết định:** Mọi route admin sản phẩm chạy `resolveBrand` (header `X-Brand-Slug`) sau các kiểm tra rẻ (token, quyền, validate); sản phẩm / biến thể / ảnh / danh mục ngoài cây của shop trả 404 (`services/productAdmin.service.ts`). Thêm `GET /products/admin/:id` (mọi trạng thái). Validate chặt: tên 1–200, slug `^[a-z0-9]+(?:-[a-z0-9]+)*$` ≤ 120, thương hiệu ≤ 100, mô tả ≤ 20 000, thông số là object, SKU ≤ 64, nhãn biến thể ≤ 100. Slug cũ lưu ở bảng `ProductSlugRedirect` (migration thuần thêm bảng, cascade khi xoá sản phẩm); `GET /products/resolve/:slug` chỉ trả slug cho sản phẩm đang bán; `/san-pham/<cũ>` → `permanentRedirect` 308. Slug cũ đang chuyển hướng không dùng lại được cho sản phẩm khác (409). Trang `/admin/san-pham` (lọc trạng thái / danh mục / tên trên URL), `/admin/san-pham/moi`, `/admin/san-pham/[id]`.
**Lý do:** Cùng cách làm với danh mục (ADR-017): link cũ không gãy, thứ hạng theo 308; admin của một storefront không chạm được dữ liệu của storefront khác.
**Phương án đã loại:** Redirect trong `next.config` — phải build lại mỗi lần đổi slug. Khoá slug sau khi tạo — chủ shop cần sửa lỗi chính tả. Bản nháp đổi slug cũng chuyển hướng — lộ sản phẩm chưa bán qua URL cũ.
**Hệ quả:** Client admin phải gửi `X-Brand-Slug` cho mọi API sản phẩm (test cũ gọi không có header đã sửa cách gọi). Production cần chạy migration `20261104120000_add_product_slug_redirects` (rollback: `DROP TABLE "ProductSlugRedirect";`). Tồn kho chỉ hiển thị trong form; điều chỉnh kho làm ở D2.

## ADR-019: Hạn mức rate limit riêng cho token admin — 2026-11-04
**Bối cảnh:** Limiter chung `/api/` (ADR-006: 100 request / 15 phút, xô theo user khi token hợp lệ, theo IP khi không) chặn chủ shop khi nhập sản phẩm: mở form ≈ 3 request, mỗi lần lưu 1 + số biến thể / ảnh đổi; đã chạm 429 khi test đợt D1.
**Quyết định:** Cùng một limiter, `limit` tính theo request (`apiRateLimitFor`): Bearer token có chữ ký hợp lệ, chưa hết hạn, `role === 'admin'` → 1 000 / 15 phút; mọi trường hợp khác → 100. Hằng số ở `constants/rateLimit.ts`. Token được xác thực một lần mỗi request (`WeakMap`) và dùng chung cho cách tính xô. Không đổi limiter đăng nhập / liên hệ / báo giá và việc miễn giới hạn cho request render của Next.
**Lý do:** Gỡ chặn cho admin mà vẫn có trần nếu token admin bị lộ.
**Phương án đã loại:** Bỏ limiter cho admin — token lộ gọi không giới hạn. Nâng giới hạn chung — yếu bảo vệ với mọi người.
**Hệ quả:** Admin bị hạ quyền giữ hạn mức 1 000 tới khi access token hết hạn (≤ 15 phút), giống `requireRole`. Đã kiểm trên backend dev: admin 101 request đều 200 (`RateLimit-Limit: 1000`), khách request thứ 101 = 429.

## ADR-020: Gửi link đặt lại mật khẩu qua SMTP, đăng xuất mọi phiên khi đặt lại — 2026-11-04
**Bối cảnh:** Backend đã có API quên / đặt lại mật khẩu nhưng không gửi được email (link chỉ in ra console ở development), BFF và frontend chưa có trang → quên mật khẩu không dùng được ở production. Shop chưa có domain để xác thực người gửi.
**Quyết định:** `nodemailer` qua SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`); production thiếu các biến này hoặc `PUBLIC_SITE_URL` → server không khởi động (báo tên biến, không in giá trị). Development (kể cả `NODE_ENV` trống) không có SMTP → in email ra console; môi trường khác bỏ email kèm cảnh báo không có nội dung. Email gửi không chờ (thời gian trả lời không lộ email nào có tài khoản), lỗi gửi chỉ ghi tên lỗi. `/reset-password` thêm limiter 10 / 15 phút / IP; đặt lại thành công thu hồi mọi refresh token của tài khoản. Trang `/quen-mat-khau`, `/dat-lai-mat-khau` (noindex, thêm vào `robots.txt`, trang đặt lại `referrer: no-referrer`), link "Quên mật khẩu?" ở trang đăng nhập.
**Lý do:** Gmail + mật khẩu ứng dụng dùng được ngay khi chưa có domain; đổi nhà cung cấp chỉ bằng biến môi trường. Đặt lại mật khẩu thường là cách giành lại tài khoản bị chiếm, nên phiên cũ phải mất hiệu lực.
**Phương án đã loại:** API Resend — chưa có domain thì không gửi được cho khách. Chưa gửi email — production vẫn không dùng được quên mật khẩu.
**Hệ quả:** Thêm dependency `nodemailer`, `@types/nodemailer`. Production cần 6 biến môi trường mới (`.env.example`). Gmail giới hạn khoảng 500 email / ngày và dễ vào thư rác — chuyển sang SMTP của nhà cung cấp email khi có domain.

## ADR-021: Đăng ký nhận tin qua email (double opt-in) và cách giữ dữ liệu người đăng ký — 2026-11-07
**Bối cảnh:** Khối "Gia nhập cộng đồng" ở footer cần thu email để gửi bản tin sau này. Email là dữ liệu cá nhân (Nghị định 13/2023); gửi hàng loạt cần uy tín tên miền.
**Quyết định:** Bảng `NewsletterSubscriber` (PENDING / CONFIRMED / UNSUBSCRIBED). Double opt-in: link xác nhận 48 giờ, dùng 1 lần; gửi lại tối đa 1 lần / 10 phút. Token ngẫu nhiên, chỉ lưu SHA-256. Lưu `consentText` + `consentAt` làm bằng chứng đồng ý; câu đồng ý do backend tự lưu (không nhận từ client). Bản ghi PENDING quá 7 ngày (theo `consentAt`) bị xoá mỗi giờ. Admin xoá = xoá hẳn. Trang huỷ cần bấm nút (trình quét thư không huỷ thay khách). CSV xuất trong envelope `{ data: { filename, csv } }`, có BOM và chặn CSV injection. Hệ thống chỉ thu email; gửi bản tin bằng dịch vụ ngoài từ file CSV.
**Lý do:** Double opt-in chặn đăng ký hộ / địa chỉ giả; giữ dữ liệu tối thiểu; một câu trả lời cho mọi email để không dò được ai đã đăng ký.
**Phương án đã loại:** Token HMAC không lưu DB (không thu hồi từng link); single opt-in; trả CSV dạng file ngoài envelope (phải viết thêm đường tải có refresh token).
**Hệ quả:** Migration `20261107120000_add_newsletter_subscribers`. Cần SMTP ở production (đã bắt buộc từ ADR-020). Link huỷ chỉ còn trong email chào mừng mới nhất; bản tin gửi từ dịch vụ ngoài phải có link huỷ của dịch vụ đó.

## ADR-022: Lọc HTML Markdown bằng sanitize-html thay cho isomorphic-dompurify — 2026-11-10
**Bối cảnh:** Deploy lên Vercel, mọi trang render động trả 500: `isomorphic-dompurify` → `jsdom` 30 → `html-encoding-sniffer` `require()` gói chỉ có ES Module (`@exodus/bytes`), runtime Vercel báo `ERR_REQUIRE_ESM` (cả Node 24). Máy dev (Node 26) không tái hiện. `lib/seo/structuredData.ts` import `lib/markdown.ts` chỉ để dùng `excerptFromContent`, nên cả trang không có Markdown cũng nạp `jsdom`.
**Quyết định:** `lib/sanitize.ts` dùng `sanitize-html` với danh sách thẻ / thuộc tính cho phép rõ ràng (đúng những gì `marked` sinh ra; link http/https/mailto/tel/đường dẫn nội bộ, ảnh http/https; `id` chỉ trên h2). `excerptFromContent` tách ra `lib/excerpt.ts`. Bỏ `isomorphic-dompurify`; `jsdom` chỉ còn là devDependency cho Vitest.
**Lý do:** Không cần `jsdom` ở runtime; allow-list chặt hơn DOMPurify mặc định (bỏ `<form>`, `<input>`, `<svg>`, `style`).
**Phương án đã loại:** Đổi Node trên Vercel (đã thử 24.x, vẫn lỗi); ghim `jsdom` bản cũ (giữ dependency cũ lâu dài, chưa chắc hết lỗi); bundle `jsdom` vào server chunk (jsdom đọc file tài nguyên lúc chạy, dễ vỡ).
**Hệ quả:** Markdown có HTML ngoài allow-list bị bỏ (vd `<iframe>` nhúng video, `style`). Muốn nhúng video phải mở rộng allow-list có chủ đích + test. Test `test/markdown.test.ts` khoá cả hai chiều (chặn / giữ).

## ADR-023: Tên thương hiệu "Woofle & Meowcaron" và logo theo brand guide v1.0 — 2026-11-10
**Bối cảnh:** Có bộ nhận diện (logo-branding/woofle-meowcaron-brand-kit, guide 8 trang): tên là "Woofle & Meowcaron", "Siêu thị của chó mèo" là dòng phụ. Code và CLAUDE.md đang dùng "Siêu thị của chó mèo" làm tên chính. Site chưa được index.
**Quyết định:** `SITE_NAME = 'Woofle & Meowcaron'`, `SITE_TAGLINE = 'Siêu thị của chó mèo'`; title mặc định `Woofle & Meowcaron – Siêu thị của chó mèo: pate, thức ăn, phụ kiện`, template `%s | Woofle & Meowcaron`; Organization có `alternateName` (dòng phụ) và `logo` PNG. Logo dùng nguyên file: header ngang (biểu tượng riêng dưới 400px, vì cỡ tối thiểu logo ngang 140px không vừa cạnh 3 nút ở 320px), footer ngang, admin bản một màu trắng; favicon mèo macaron (`app/favicon.ico`, `icon.svg`, `apple-icon.png`). Email và câu đồng ý nhận tin dùng tên mới; tên trong HTML email được escape (`&amp;`).
**Lý do:** Một tên thống nhất giữa logo, title, schema, email (entity). Đổi trước khi được index nên gần như không mất gì.
**Phương án đã loại:** Chỉ chèn logo, giữ tên cũ (logo và title khác tên).
**Hệ quả:** `MAIL_FROM` trên Render phải đổi tay. Bản ghi đăng ký nhận tin cũ giữ câu đồng ý cũ (đúng: là bằng chứng lúc đồng ý). Danh mục gốc `petshop` trong DB vẫn tên cũ (không hiển thị). Bảng màu site (#087878) chưa theo guide (#009E91 / #00796F) — task riêng.

## ADR-024: Trình soạn thảo kiểu Word (Tiptap) cho bài viết và mô tả sản phẩm, vẫn lưu Markdown — 2026-11-10
**Bối cảnh:** Ô nội dung bài viết và mô tả sản phẩm là textarea Markdown, khó dùng với người không quen cú pháp. Trang public render Markdown bằng `marked` + `sanitize-html` (ADR-022), mục lục bài lấy từ `##`.
**Quyết định:** Thêm `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/markdown`, ghim đúng 3.32.0 (bản 4 tuần tuổi; 3.33.0 mới 5 ngày). `MarkdownField` có 2 chế độ: "Soạn" (Tiptap, mặc định) và "Markdown" (textarea). Nội dung vẫn lưu Markdown (`editor.getMarkdown()`). Chỉ H2 / H3, không gạch chân; link chỉ http(s) / mailto / tel / đường dẫn trong site; ảnh tải qua `/uploads/image`, bắt buộc mô tả. Nội dung mà editor không giữ nguyên được (bảng, HTML — `keepsMarkdown` so HTML render trước / sau) tự mở ở chế độ Markdown. Editor tải bằng `next/dynamic` (`ssr: false`).
**Lý do:** Không đổi DB, API, trang public, bài cũ; người viết thấy gần đúng trang thật. Tiptap headless nên toolbar tự dựng bằng Tailwind, nút ≥ 44px cho điện thoại.
**Phương án đã loại:** MDXEditor (toolbar sẵn nhưng nặng, khó chỉnh giao diện mobile); lưu HTML (phải đổi render public, mục lục, excerpt, chuyển dữ liệu cũ).
**Hệ quả:** Chunk Tiptap ~215 KB gzip, chỉ tải khi mở ô soạn ở admin; trang public không đổi. `@tiptap/markdown` kéo thêm `marked@17` (dự án dùng 18) — chỉ trong chunk admin. Chưa có bảng, màu chữ, căn lề (Markdown không lưu được; bảng vẫn gõ ở chế độ Markdown).

## ADR-025: Gửi bản tin ngay trong admin qua Brevo SMTP, hẹn giờ bằng worker trong tiến trình — 2026-11-10
**Bối cảnh:** ADR-021 chỉ thu email, gửi bản tin bằng dịch vụ ngoài từ CSV. Chủ shop muốn soạn, gửi thử, hẹn giờ và xem báo cáo ngay trong admin. Email đơn hàng / quên mật khẩu đang qua SMTP Gmail (giới hạn ~500/ngày, dễ bị khoá khi gửi hàng loạt). Chưa có domain riêng. Backend chạy Render Free (ngủ sau ~15 phút).
**Quyết định:** Bảng `NewsletterCampaign` (DRAFT → SCHEDULED → SENDING → SENT / CANCELLED, bộ đếm người nhận / đã gửi / lỗi / huỷ) và `NewsletterDelivery` (một dòng mỗi người nhận, token huỷ riêng chỉ lưu SHA-256, sinh lúc gửi). Worker trong tiến trình chạy mỗi phút: nhận bản tin đến giờ bằng UPDATE có điều kiện + chốt danh sách CONFIRMED trong cùng transaction; nhận từng email bằng UPDATE có điều kiện (chỉ khi bản tin còn SENDING); giới hạn `NEWSLETTER_DAILY_LIMIT` (mặc định 300, cửa sổ 24 giờ) và `NEWSLETTER_BATCH_SIZE` (20/phút); lỗi tạm thử lại tối đa 3 lần, 5xx là lỗi hẳn; email kẹt quá 10 phút được thả lại (at-least-once); xoá người nhận 90 ngày sau khi xong, giữ bộ đếm. SMTP riêng `NEWSLETTER_SMTP_*` (Brevo), không bắt buộc khi khởi động; production thiếu thì hẹn giờ / gửi thử trả 409 `NEWSLETTER_NOT_CONFIGURED`. Email render ở backend (`marked` + `sanitize-html`, cùng allow-list với storefront, style inline, PNG logo), header `List-Unsubscribe` (+ `List-Unsubscribe-Post` one-click RFC 8058 khi có `PUBLIC_API_URL`), nhãn "[QC]" mặc định bật. Link huỷ của bản tin chỉ huỷ đăng ký được xác nhận trước email đó. Render Free giữ thức bằng ping ngoài (cron-job.org → `/health` mỗi 10 phút).
**Lý do:** Không đụng uy tín SMTP của email đơn hàng; nodemailer có sẵn nên không thêm SDK; điều kiện trạng thái trong chính câu UPDATE giữ đúng khi có 2 worker (đã có race test); dữ liệu cá nhân giữ ngắn.
**Phương án đã loại:** Gửi qua Gmail SMTP chung (khoá tài khoản → mất email đơn hàng); Resend API (bắt buộc domain đã xác minh); Render Cron Job / endpoint cron có secret (thêm hạ tầng, secret); theo dõi mở thư (cần pixel + đồng ý).
**Hệ quả:** Migration `20261110120000_add_newsletter_campaigns` (chỉ thêm; rollback: DROP 2 bảng + 2 enum). Dependency backend: `marked@18.0.12` (ESM-only, chạy được qua require(esm) Node ≥ 22.12 — đã thử Node 22.23 + tsx), `sanitize-html@2.18.1`. Chưa có domain nên thư dễ vào spam; Brevo có thể bắt xác minh domain. Nhãn "[QC]" theo Nghị định 91/2020 — chủ shop cần tự kiểm lại điều khoản. Một email có thể gửi lặp nếu tiến trình chết đúng giữa lúc gửi xong và lúc đánh dấu.

## ADR-026: "Thường mua kèm" do admin chọn, liên kết một chiều, thêm trường `related` vào API sản phẩm — 2026-11-10
**Bối cảnh:** Học từ trang mẫu: khối "Thường mua kèm" tăng giá trị đơn (hạt + pate + cát). Shop mới, gần như chưa có đơn để tự tính "hay mua cùng".
**Quyết định:** Bảng `ProductRelated` (cặp sản phẩm, `position`, cascade khi xoá một bên, CHECK không tự gắn). Một chiều: A gợi ý B chỉ hiện trên trang A. Tối đa 4, cùng cửa hàng. `PUT /products/:id/related` thay cả danh sách trong một transaction. `GET /products/:slug` và `GET /products/admin/:id` có thêm trường `related` (public: chỉ sản phẩm đang bán). Khối trên trang sản phẩm: tick chọn, chọn phân loại từng dòng, tổng là giá thật từng món (không combo giảm giá), một nút gọi API giỏ cho từng món, món lỗi được nêu tên.
**Lý do:** Chính xác, làm được ngay; một chiều vì "hạt → cát" hợp lý không có nghĩa "cát → hạt". Không thêm endpoint giỏ nhiều món: giỏ hiện có đủ, lỗi từng món vẫn báo rõ.
**Phương án đã loại:** Tự động từ đơn hàng (chưa đủ dữ liệu); liên kết hai chiều tự động; combo giảm giá (chưa có khuyến mãi theo combo).
**Hệ quả:** Migration `20261111120000_add_product_related` phải chạy trên live **trước** khi deploy backend (API chi tiết sản phẩm đọc bảng mới). Public API thêm trường, không đổi trường cũ. Trang sản phẩm cache 5 phút; admin lưu thì làm mới tag `products`.

## ADR-027: Đánh giá sản phẩm chỉ từ người đã mua, admin duyệt trước, số sao lưu sẵn trên Product — 2026-11-12
**Bối cảnh:** Học từ trang mẫu; rule SEO cấm rating / review giả và chỉ cho `aggregateRating` khi có đánh giá thật hiển thị trên trang.
**Quyết định:** Bảng `ProductReview` (1–5 sao, 10–2000 ký tự, ≤ 3 ảnh trên Cloudinary của shop, PENDING / APPROVED / HIDDEN, phản hồi của shop), unique (sản phẩm, khách). Chỉ khách có đơn COMPLETED chứa sản phẩm mới viết được. Admin duyệt trước khi hiện; khách sửa → về chờ duyệt. `Product.reviewCount` / `ratingSum` chỉ đếm đã duyệt, cập nhật cùng transaction với mỗi lần đổi trạng thái bằng UPDATE lạc quan (`WHERE status = s0 AND rating = r0`), thua race → 409. Tên hiển thị = chữ cuối của tên + "Đã mua hàng", không lộ email. Ảnh khách: endpoint riêng, kiểm magic bytes, 5MB, 10/giờ/tài khoản, thư mục `…/reviews`; BFF chuyển tiếp multipart. Trang sản phẩm: tóm tắt + trang đầu trong HTML server, lọc / sắp xếp ở trình duyệt (không vào URL); JSON-LD `aggregateRating` + `review` chỉ khi có đánh giá đã duyệt. Admin `/admin/danh-gia` với số chờ duyệt trên menu; quy tắc "không ẩn vì chê" ghi ngay trên trang.
**Lý do:** Đánh giá thật, kiểm soát được nội dung, số sao không lệch dưới tải đồng thời (có race test), không làm chậm trang danh mục.
**Phương án đã loại:** Hiện ngay rồi ẩn sau (nội dung xấu có thể hiện một lúc); tính trung bình mỗi lần đọc (chậm trang danh mục); cho khách tự đặt ảnh bằng URL (theo dõi người đọc, đổi ảnh sau khi duyệt).
**Hệ quả:** Migration `20261112120000_add_product_reviews` (thêm bảng + enum + 2 cột có mặc định) phải chạy trên live trước khi deploy backend. Ảnh upload mà không gửi đánh giá còn trên Cloudinary (chưa dọn tự động). Biến thể bị xoá thì đơn cũ không truy ra sản phẩm, không đánh giá được. `GET /orders/:code` có thêm `items[].product`.

## ADR-028: Dọn ảnh đánh giá mồ côi bằng quét hằng ngày, chỉ trên production — 2026-11-12
**Bối cảnh:** Ảnh khách tải lên cho đánh giá (ADR-027) nằm lại trên Cloudinary khi khách không gửi đánh giá, bỏ ảnh lúc sửa, hoặc đánh giá bị xoá theo sản phẩm / tài khoản.
**Quyết định:** Worker trong tiến trình, chạy lúc khởi động rồi mỗi 24 giờ: liệt kê `<CLOUDINARY_FOLDER>/reviews/` (Admin API, 500/trang, tối đa 10 trang), so với `public_id` của mọi ảnh mà đánh giá còn dùng (mọi trạng thái), xoá ảnh không ai dùng và cũ hơn 24 giờ, lô 100, tối đa 500 / lần. Danh sách và DB phải đọc xong trọn vẹn trước khi xoá; thiếu tên cloud thì dừng. **Chỉ chạy khi NODE_ENV=production** và Cloudinary đã cấu hình.
**Lý do:** Không cần migration hay sửa luồng đánh giá; xử lý mọi nguồn sinh ảnh mồ côi; vài lượt API mỗi ngày.
**Phương án đã loại:** Bảng ghi sổ từng lần upload (migration + sửa luồng tạo / sửa, thừa với shop nhỏ).
**Hệ quả:** Xoá không khôi phục được — rủi ro giới hạn bởi prefix `reviews/`, 24 giờ chờ, trần 500. Dev và live dùng chung tài khoản / thư mục Cloudinary nên worker không chạy ở dev (nếu chạy, ảnh của khách thật sẽ bị coi là không dùng). Ảnh thử tải từ máy dev vào thư mục chung sẽ bị worker live xoá sau 24 giờ (đúng ý).
