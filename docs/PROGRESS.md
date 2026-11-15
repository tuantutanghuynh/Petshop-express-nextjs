# Progress Log

## 2026-11-12 — Dọn ảnh đánh giá mồ côi (ADR-028)
**Đã làm:** services/reviewImageCleanup.service.ts (liệt kê thư mục reviews/, so với ảnh đánh giá đang dùng, xoá ảnh không dùng > 24 giờ, lô 100, tối đa 500, dừng khi lỗi / thiếu tên cloud); workers/cleanupReviewImages.ts chạy mỗi 24 giờ, chỉ production; bin/www.ts.
**Kiểm chứng:** unit 5 + DB 4 test (Cloudinary giả lập: chỉ xoá đúng ảnh, qua nhiều trang, lô 100, không xoá khi liệt kê lỗi / thiếu tên cloud); typecheck sạch; DB-free 395/395.

## 2026-11-12 — Đánh giá sản phẩm từ người đã mua (ADR-027)
**Đã làm:** Đợt 1 c30454b (API, upload ảnh khách, duyệt / ẩn / trả lời, bộ đếm sao, race test). Đợt 2 c0b3e16 (mục đánh giá trên trang sản phẩm, form viết / sửa + ảnh, BFF multipart, JSON-LD aggregateRating, sao trên thẻ, link "Đánh giá" trong đơn đã hoàn tất). Đợt 3: /admin/danh-gia (tab Chờ duyệt / Đã duyệt / Đã ẩn / Tất cả, lọc sao, Duyệt / Ẩn, phản hồi), badge số chờ duyệt trên menu, tag cache `reviews`.
**Kiểm chứng:** backend DB-free 390/390, DB 540/540 (có lượt treo do máy ngủ, chạy lại pass), mutation check điều kiện lạc quan; frontend 419/419, lint 0 lỗi, build OK. Chưa thử trình duyệt: DB dev chưa migrate.
**Trình duyệt:** trang sản phẩm 320–1024 không cuộn ngang (sửa lưới thiếu grid-cols-1, 47d62b2), lọc sao đúng, JSON-LD aggregateRating chỉ khi có đánh giá. Luồng đăng nhập (khách viết, admin duyệt / trả lời, badge) chờ người dùng thử tay.
**Đã push:** c30454b, c0b3e16, ae5a90f, 47d62b2 sau khi migrate live (DIRECT_URL, 5432).
**Còn dang dở:** (ảnh mồ côi: xem mục ADR-028 bên trên)

## 2026-11-10 — "Thường mua kèm" (ADR-026)
**Đã làm:** Bảng ProductRelated (một chiều, ≤ 4, cùng shop, cascade, CHECK không tự gắn); `PUT /products/:id/related`; trường `related` trong API chi tiết (public: chỉ đang bán; admin: mọi trạng thái); ô "Thường mua kèm" trong trang sửa sản phẩm (lưu ngay); khối trên trang sản phẩm (tick, chọn phân loại, tổng thật, một nút thêm cả nhóm, nêu tên món lỗi). Commit 6f9350a, đã push; migration live đã chạy trước (DIRECT_URL).
**Kiểm chứng:** backend DB-free 367/367, DB 480/480; frontend 398/398, lint 0 lỗi, build OK; trình duyệt 320–1024 không cuộn ngang, tổng đúng khi bỏ tick / đổi phân loại, link có trong HTML server. Ô admin chưa thử trình duyệt (cần đăng nhập).
**Bước tiếp theo:** Đánh giá thật từ người đã mua (brainstorm).

## 2026-11-10 — Trang sản phẩm học từ trang mẫu
**Đã làm:** Biến thể dạng thẻ (ảnh, giá, -x%, hết hàng mờ), nhãn -x% cạnh giá, "Chỉ còn N" khi ≤ 5 (tồn - giữ), khối cam kết thật dưới nút mua (COD / CK, chính hãng, theo dõi đơn; link chính sách giao hàng & đổi trả chỉ khi đã viết; Zalo khi có số), thương hiệu trên thẻ sản phẩm (ad612ac). Nút "Thêm vào giỏ" một dòng ở 320px (c323fe2). Khung mô tả Thức ăn / Phụ kiện trong form sản phẩm, dòng ✎ chặn lưu (4bedc3d). Đã loại: tab che nội dung, đánh giá / "đã bán" giả, hashtag, bảng so sánh, voucher chưa có.
**Kiểm chứng:** frontend typecheck sạch, lint 0 lỗi, test 394/394, build OK; trình duyệt trang sản phẩm 320 / 390 / 768 / 1024 không cuộn ngang, "Chỉ còn 5" đúng, SEO head / h1 / JSON-LD giữ nguyên. Nhãn -x% chỉ kiểm bằng unit test (DB dev không có giá gạch); khung mô tả chưa thử trình duyệt.
**Bước tiếp theo (LARGE, khi người dùng chọn):** "Thường mua kèm" (admin chọn sản phẩm kèm, migration); đánh giá thật từ người đã mua.

## 2026-11-10 — Bản tin: soạn, gửi thử, hẹn giờ, báo cáo (Brevo SMTP)
**Đã làm:** Đợt 1 (commit 1ffc01c): migration 2 bảng bản tin + người nhận, render email (marked + sanitize-html, style inline), worker gửi mỗi phút (claim có điều kiện, giới hạn ngày / lô, retry, kẹt → thả, dừng giữa chừng, xoá người nhận sau 90 ngày), SMTP riêng NEWSLETTER_*. Đợt 2 (commit 5799a0f): API admin `/newsletter/campaigns` (CRUD, schedule, cancel, test), huỷ bằng token của từng email + one-click RFC 8058. Đợt 3: `/admin/ban-tin` (danh sách theo trạng thái, form soạn với trình soạn Tiptap + chọn bài / sản phẩm, gửi thử, hẹn giờ giờ VN, huỷ hẹn, báo cáo + dừng gửi), mục menu "Bản tin", `lib/vnTime.ts` dùng chung. ADR-025. Spec / plan `2026-11-10-newsletter-campaigns*`.
**File thay đổi:** backend (prisma schema + migration, config/env.ts, constants/newsletter.ts, services/{email,newsletter,newsletterEmail,newsletterSend,newsletterCampaign}.service.ts, controllers/newsletterCampaign.controller.ts, routes/newsletter.route.ts, workers/sendNewsletters.ts, bin/www.ts, tests); frontend (lib/{adminNewsletter,vnTime,adminPosts,adminNav,types}.ts, components/admin/newsletter/*, app/admin/ban-tin/*, tests).
**Kiểm chứng:** backend typecheck sạch, DB-free 365/365, DB 468/468 (gồm 60 race test, mutation check 2 điều kiện); frontend typecheck sạch, lint 0 lỗi, test 379/379, build OK. Trình duyệt: kịch bản campaign-e2e.mjs chờ người dùng chạy (cần tài khoản admin).
**Còn dang dở / Bug đã biết:** Đã push (1ffc01c, 5799a0f, a1b0979); migration live đã chạy (qua DIRECT_URL, pooler 5432). **Tạm hoãn gửi thật** (người dùng 2026-11-10: Brevo để sau, phát triển bản tin tiếp sau): chưa có NEWSLETTER_* / PUBLIC_API_URL trên Render → live chỉ lưu nháp, hẹn giờ / gửi thử trả 409 NEWSLETTER_NOT_CONFIGURED; chưa tạo ping cron-job.org. Kịch bản campaign-e2e.mjs chưa chạy. Chưa có domain → thư dễ vào spam khi bật.
**Bước tiếp theo:** Trang sản phẩm: biến thể dạng thẻ + % giảm + "còn N", khối cam kết dưới nút mua, thương hiệu trên thẻ sản phẩm.

## 2026-11-10 — Trình soạn thảo kiểu Word cho bài viết / mô tả sản phẩm
**Đã làm:** Tiptap 3.32.0 (ADR-024) thay textarea Markdown: toolbar H2, H3, đậm, nghiêng, gạch, danh sách chấm / số, trích dẫn, link (ô nhập, lọc scheme), ảnh (upload Cloudinary, bắt buộc alt), hoàn tác / làm lại; chế độ "Markdown" để sửa tay; nội dung có bảng / HTML tự mở chế độ Markdown. Vẫn lưu Markdown. Spec `2026-11-10-rich-text-editor-design.md`.
**File thay đổi:** frontend (package.json, package-lock.json, lib/richText.ts, components/admin/editor/{RichTextEditor,EditorToolbar,InsertPanels}.tsx, components/admin/products/MarkdownField.tsx, components/admin/posts/PostFields.tsx, test/richText.test.ts).
**Còn dang dở / Bug đã biết:** Kiểm thử trình duyệt cần tài khoản admin (kịch bản editor-e2e.mjs, người dùng chạy). npm audit: next / sharp / source-map-js có cảnh báo (có từ trước, không do Tiptap).
**Bước tiếp theo:** Cân nhắc nâng Next bản vá bảo mật (task riêng, LARGE).

## 2026-11-10 — Deploy (Supabase + Render + Vercel), thương hiệu Woofle & Meowcaron, quản lý ảnh / bài viết
**Đã làm:** Deploy: migrate + seed cây danh mục trên Supabase, backend Render (`sieuthichomeo-api.onrender.com`), frontend Vercel (`petshop-express-nextjs.vercel.app`); sửa lỗi 500 trang động trên Vercel (isomorphic-dompurify → jsdom ERR_REQUIRE_ESM) bằng `sanitize-html` (ADR-022). Dọn dữ liệu gốm trên DB live; chỉ còn 1 admin. Đổi tên thương hiệu "Woofle & Meowcaron" + logo / favicon theo brand kit (ADR-023). Hero thử thu vào khung rồi trả lại như cũ. Admin: Thư viện ảnh và Bài viết có danh sách (lọc, tìm, phân trang), sửa, xoá; `GET /blog/admin/:id`; slug bài đã đăng bị khoá (409 SLUG_LOCKED); giới hạn độ dài trường (spec `2026-11-10-admin-gallery-posts-design.md`).
**File thay đổi:** backend (routes/blog.route.ts, routes/gallery.route.ts, controllers/blog.controller.ts, services/email.service.ts, constants/newsletter.ts, config/env.ts, tests); frontend (lib/sanitize.ts, lib/excerpt.ts, lib/brand.ts, lib/adminGallery.ts, lib/adminPosts.ts, components/admin/{gallery,posts}/*, components/admin/ImageUploadField.tsx, components/layout/Logo.tsx, public/brand, app/admin/{gallery,posts}/*).
**Còn dang dở / Bug đã biết:** Render Free ngủ sau ~15 phút (lần đầu chậm 30–60s). Chưa xác nhận đã đổi mật khẩu DB bị lộ; chưa đổi `MAIL_FROM` trên Render. Bảng màu site chưa theo brand kit. 6 yêu cầu báo giá + 8 tài khoản khách cũ trên DB live chưa quyết.
**Bước tiếp theo:** Thử trên site thật: đăng nhập admin, upload ảnh, COD, đăng ký nhận tin, quên mật khẩu; viết bài / sản phẩm chó mèo thật; Search Console sau khi có domain.

## 2026-11-07 — D2: điều chỉnh tồn kho trong form sản phẩm; menu header từ 1024px
**Đã làm:** Menu header: hàng menu desktop chỉ hiện từ 1024px (768–1023 dùng ☰), ô chọn danh mục trong ô tìm kiếm header chỉ từ 1024px (commit b2c2672). D2 (spec `docs/superpowers/specs/2026-11-07-stock-adjust-ui-design.md`): nút "Điều chỉnh" cạnh tồn kho mỗi biến thể đã lưu mở `StockDialog` (portal ra body — dialog nằm trong form sản phẩm; submit dừng lan truyền để không chạy "Lưu thay đổi"): Nhập (+) / Xuất (−) theo lý do, Kiểm kê, ghi chú (bắt buộc với "Khác"), xem trước tồn sau; lịch sử kho 10 dòng / trang, có link đơn. Backend: lịch sử kho trả thêm `order.code`. `lib/adminStock.ts` + test.
**File thay đổi:** backend (controllers/product.controller.ts, test/db/inventory.test.ts); frontend (lib/adminStock.ts, lib/types.ts, components/admin/products/{StockDialog,StockHistory,VariantRows,ProductForm}.tsx, test/adminStock.test.ts).
**Kiểm chứng:** backend typecheck sạch, DB-free 315/315, DB 341/341; frontend typecheck sạch, lint 0 lỗi, test 286/286, build OK; trình duyệt (CDP): +5 → 31, −2 → 29, "Khác" thiếu ghi chú bị chặn, kiểm kê 26 (−3), lịch sử đúng, 390 / 1024px không cuộn ngang. Tồn của DEMO-SUA-TAM-300 đã về 26 (3 dòng thử nằm trong sổ kho).
**Còn dang dở / Bug đã biết:** Trang tồn kho riêng (kiểm kê hàng loạt) để sau khi cần.
**Bước tiếp theo:** Checklist production spec v2 §4.4.

## 2026-11-07 — Đăng ký nhận tin qua email (newsletter, double opt-in)
**Đã làm:** Spec `docs/superpowers/specs/2026-11-07-newsletter-signup-design.md`, plan `docs/superpowers/plans/2026-11-07-newsletter-signup.md`, ADR-021. Backend: bảng `NewsletterSubscriber` + migration (đã áp dev); `services/newsletter.service.ts` (UPDATE có điều kiện, chịu được request đồng thời), routes `/newsletter/*` có limiter riêng (5 / 10 / 10 mỗi 15 phút / IP), admin list / export CSV / xoá, worker xoá PENDING > 7 ngày, 2 email (xác nhận, chào mừng + link huỷ), `utils/csv.ts`. Frontend: form trong khối footer (luôn hiện; điền sẵn email khi khách đã đăng nhập bấm vào ô), trang `/xac-nhan-dang-ky`, `/huy-dang-ky` (noindex, no-referrer, có trong robots), trang admin `/admin/dang-ky-nhan-tin`. Sửa thêm: lưới khối footer ở ≥1024px, màu tiêu đề khối (globals.css đè màu h2). Trước đó: lỗi upload quá 15MB trả 413 `FILE_TOO_LARGE` thay vì 500.
**File thay đổi:** backend (constants/newsletter.ts, utils/csv.ts, services/email.service.ts, services/newsletter.service.ts, controllers/newsletter.controller.ts, routes/newsletter.route.ts, routes/index.ts, workers/purgePendingSubscribers.ts, bin/www.ts, prisma/schema.prisma + migration, test/csv, email.service, newsletter, db/newsletter); frontend (lib/newsletter.ts, lib/forms.ts, lib/types.ts, lib/adminNav.ts, lib/seo/robots.ts, app/api/newsletter/*, app/xac-nhan-dang-ky, app/huy-dang-ky, app/admin/dang-ky-nhan-tin, components/layout/{NewsletterForm,CommunityBand,SiteFooter}.tsx, components/newsletter/*, components/admin/newsletter/*, test/newsletter, seo, adminNav).
**Kiểm chứng:** backend typecheck sạch, DB-free 315/315, DB 340/340; frontend typecheck sạch, lint 0 lỗi (3 warning có sẵn), test 278/278, build OK; luồng thật qua BFF (đăng ký → xác nhận → link dùng lại bị từ chối → huỷ); ảnh chụp 320 / 360 / 390 / 430 / 768 / 1024px, 0px cuộn ngang.
**Còn dang dở / Bug đã biết:** Ở 768px thanh menu header bị tràn ("Liên hệ" bị cắt) — có từ trước, không thuộc task này. Chưa có dịch vụ gửi bản tin (Brevo / Mailchimp) — nhập từ CSV khi cần.
**Bước tiếp theo:** Checklist production spec v2 §4.4 (thêm migration 20261107); D2 tồn kho; menu header ở 768px.

## 2026-11-05 — Bỏ cache danh mục, đọc cây danh mục 1 lần mỗi request
**Đã làm:** Theo quyết định "cách 1": bỏ cache danh mục của luồng làm song song (`categoryCache.service.ts` xoá; `resolveBrand.ts`, `categoryScope.service.ts`, `category.controller.ts`, `test/db/helpers/db.ts`, `factories.ts` về bản đã commit). `resolveBrand` và `categoryScopeIds` đọc cả cây danh mục bằng 1 query rồi tìm trong bộ nhớ (trước 2 query) — không đọc dữ liệu cũ, script seed / nhiều instance đều đúng ngay. Test mới `test/db/category.scope.query.test.ts` (đếm query bằng pg_stat_statements, hành vi 404 giữ nguyên, danh mục tạo từ tiến trình khác thấy ngay). Sửa kiểu mock Cloudinary trong `test/upload.integration.test.ts` (bỏ `any`). Giữ `test/db/order.edge-cases.test.ts`.
**File thay đổi:** backend (middlewares/resolveBrand.ts, services/categoryScope.service.ts, test/db/category.scope.query.test.ts, test/db/order.edge-cases.test.ts, test/upload.integration.test.ts).
**Còn dang dở / Bug đã biết:** `upload.integration.test.ts` "oversized file" chấp nhận cả 500 (`[413, 422, 500]`) — assertion lỏng; nên xác định đúng mã lỗi multer trả và siết lại. Xem lại cache khi đã deploy và log `responseTime` cho thấy DB ở xa làm chậm.
**Bước tiếp theo:** Spec v2 §4.4 checklist production; đợt D2.

## 2026-11-04 — Logger có cấu trúc + request ID (spec v2 §4.3)
**Đã làm:** `pino` + `pino-http` thay `morgan` (dev: `pino-pretty`). `utils/logger.ts` (JSON ở production, che `authorization` / `cookie` / `x-internal-secret` / `set-cookie`), `middlewares/requestLogger.ts` mount đầu tiên (request 429 cũng được ghi), `X-Request-Id` (nhận id hợp lệ từ BFF, không thì UUID), log chỉ path (bỏ query string — trước đây SĐT khách tìm trong admin nằm trong log), 5xx `error` / 4xx `warn`, bỏ qua `/health*`; `errorHandler` dùng `req.log`; mọi `console.*` trong code chạy thật → logger; BFF gửi `X-Request-Id` (không thêm vào `apiClient` vì header đổi mỗi lần làm hỏng data cache của Next). `LOG_LEVEL` mới.
**File thay đổi:** backend (package.json + lock, .env.example, config/env.ts, utils/logger.ts, middlewares/requestLogger.ts, middlewares/errorHandler.ts, app.ts, bin/www.ts, workers/releaseExpiredOrders.ts, controllers/auth + gallery, services/email.service.ts, test/logging.test.ts, test/db/auth.reset.test.ts + commerce.gaps.test.ts — 2 spy chuyển từ console sang logger); frontend (lib/bff/session.ts, test/bff.test.ts).
**Còn dang dở / Bug đã biết — rà soát luồng làm song song (chưa commit, chưa sửa, theo yêu cầu "ghi nhận, sửa sau"):**
- ❌ Cache danh mục (`services/categoryCache.service.ts`, `middlewares/resolveBrand.ts`, `services/categoryScope.service.ts`, `controllers/category.controller.ts`, `test/db/helpers/db.ts`): làm 3 test DB cũ fail (`order.status` → `BRAND_NOT_FOUND` do cache cũ; `order.checkout` admin list theo brand; `commerce.query` đếm query 5 ≠ 6). Chỉ xoá cache khi ghi qua controller — script seed (tiến trình khác) và nhiều instance không xoá được, sai phạm vi shop tới 10 phút (cùng loại lỗi với 179d948). Xoá mất comment lý do không có brand mặc định. Spec v2 §6.2 đề nghị hoãn (đọc toàn bảng 0,022 ms). Đề xuất: bỏ hẳn, hoặc làm lại theo §6.2 (phiên bản / TTL vài giây, xoá cả ở seed).
- ⚠️ `test/upload.integration.test.ts`: chạy pass nhưng typecheck lỗi 2 chỗ (`any` trong mock `cloudinary.uploader.upload_stream`) → sửa kiểu mock trước khi commit.
- ✅ `test/db/order.edge-cases.test.ts`: 5 ca biên đơn hàng, pass — có thể commit riêng.
**Bước tiếp theo:** quyết định với cache danh mục; sửa kiểu test upload; spec v2 §4.4 checklist production.

## 2026-11-04 — Email + quên / đặt lại mật khẩu (spec v2 §4.1)
**Đã làm:** `services/email.service.ts` (nodemailer SMTP; development in ra console; test thay transport), cấu hình `PUBLIC_SITE_URL` + SMTP trong `config/env.ts`, production thiếu cấu hình thì không khởi động. Link `/dat-lai-mat-khau?token&email` gửi không chờ; `/reset-password` có limiter; đặt lại thu hồi mọi refresh token. BFF `forgot-password`, `reset-password`; trang `/quen-mat-khau`, `/dat-lai-mat-khau`, link ở trang đăng nhập + thông báo sau khi đổi (ADR-020). Đã thử trên trình duyệt: gửi → link ở log → đặt lại → phiên cũ 401 → đăng nhập mật khẩu mới → link dùng lại bị từ chối; 320–1280 + zoom 200%.
**File thay đổi:** backend (package.json + lock, .env.example, config/env.ts, bin/www.ts, services/email.service.ts, controllers/auth.controller.ts, routes/auth.route.ts, tests); frontend (app/api/auth/forgot-password, reset-password, app/quen-mat-khau, app/dat-lai-mat-khau, components/auth/*, app/dang-nhap, lib/forms.ts, lib/seo/robots.ts, tests).
**Còn dang dở / Bug đã biết:** Chưa gửi thật qua SMTP (cần mật khẩu ứng dụng Gmail của shop). Lỗi dưới ô chỉ cập nhật khi bấm gửi (giống form đăng nhập / đăng ký).
**Bước tiếp theo:** Spec v2 §4.3 — logger có cấu trúc + request ID.

## 2026-11-04 — Hạn mức rate limit cho admin (spec v2 §4.2)
**Đã làm:** Token admin hợp lệ được 1 000 request / 15 phút ở limiter chung, mọi người khác giữ 100 (ADR-019). `constants/rateLimit.ts`, `apiRateLimitFor` + `bearerPayload` (xác thực token một lần mỗi request) trong `middlewares/rateLimitKeys.ts`. Đính chính spec v2: link đặt lại mật khẩu chỉ in ra console ở development; production không lộ nhưng cũng không gửi được.
**File thay đổi:** backend (constants/rateLimit.ts, middlewares/rateLimitKeys.ts, app.ts, test/ratelimit.admin.test.ts).
**Còn dang dở / Bug đã biết:** Không.
**Bước tiếp theo:** Spec v2 §4.1 — email + trang quên / đặt lại mật khẩu.

## 2026-11-04 — Backend nhóm 1 (spec v2 §3)
**Đã làm:** Rà soát `docs/BACKEND_IMPROVEMENT_SPEC.md` → viết lại thành v2 (v1 giữ ở `.v1.md`). Gỡ `bcrypt` (không ai dùng), xoá `signRefreshToken` / `verifyRefreshToken` và `JWT_REFRESH_SALT`. `/health/ready` (503 khi đang tắt / DB không trả lời). Tắt server êm khi `SIGTERM` / `SIGINT` (đã thử: request đang chạy xong 200, thoát mã 0, chạy qua `tsx` cũng đúng). Pool DB: `DB_POOL_MAX` (mặc định 10), chờ kết nối 5 s, `statement_timeout` 10 s.
**File thay đổi:** backend (package.json + lock, .env.example, app.ts, bin/www.ts, config/env.ts, services/jwt.service.ts, services/prisma.ts, utils/lifecycle.ts, test/health.ready.test.ts, test/db/smoke.test.ts).
**Còn dang dở / Bug đã biết:** Nhánh 503 `db-unavailable` chưa có test tự động. Môi trường đang chạy có thể xoá `JWT_REFRESH_SALT` khỏi `.env` (vô hại nếu để).
**Bước tiếp theo:** Spec v2 nhóm 2 (email + quên mật khẩu, hạn mức admin, logger, checklist production) hoặc đợt D2.

## 2026-11-04 — Admin: Sản phẩm (đợt D1)
**Đã làm:** Mọi API admin sản phẩm giới hạn theo shop (`resolveBrand`, ngoài shop → 404, `services/productAdmin.service.ts`); `GET /products/admin/:id`; validate chặt (tên, slug, thương hiệu, mô tả, thông số, SKU, nhãn); bảng `ProductSlugRedirect` + `GET /products/resolve/:slug` + 308 ở `/san-pham/<slug-cũ>` (ADR-018). Trang `/admin/san-pham` (thẻ / bảng, lọc trạng thái / danh mục / tên trên URL, khoảng giá, tồn / giữ, "Hết hàng"), `/admin/san-pham/moi` và `/admin/san-pham/[id]` (Markdown soạn / xem trước, thông số theo danh mục, biến thể + tồn đầu, ảnh tải lên / alt / ↑↓ / xoá, xoá biến thể và sản phẩm có hỏi lại, lỗi dưới từng ô và tự mất khi sửa ô). Đã thử trên trình duyệt: tạo → sửa → đổi slug (308) → lưu trữ → xoá; 320 / 390 / 768 / 1280 / zoom 200%.
**File thay đổi:** backend (schema, migration 20261104120000, services/productAdmin, controllers/product, routes/product, tests); frontend (lib/adminProducts, lib/types, lib/adminNav, services/catalog, app/san-pham/[slug], app/admin/san-pham/*, components/admin/products/*, tests).
**Còn dang dở / Bug đã biết:**
- Giới hạn chung 100 request / 15 phút / tài khoản (ADR-006) có thể chặn admin khi nhập nhiều sản phẩm liền (mỗi lần mở form ~3 request, mỗi lần lưu 1 + số biến thể / ảnh đổi). Cần quyết định nâng hạn mức cho admin (LARGE, ADR mới).
- 2 ảnh PNG thử 64×64 đã tải lên Cloudinary trong lúc test (sản phẩm thử đã xoá, file trên Cloudinary còn).
- Production cần `npx prisma migrate deploy` (thêm 20261104120000).
**Bước tiếp theo:** Đợt D2 — điều chỉnh tồn kho + lịch sử kho trong form sản phẩm.

## 2026-10-22 — Admin: Báo giá + Tin nhắn (đợt C)
**Đã làm:** `/admin/bao-gia`: 4 ô số liệu theo kỳ, tab Mới (N) / Đã liên hệ / Đã chốt / Tất cả, thẻ yêu cầu (sản phẩm, giá web, ghi chú text thuần), Đã gọi / Chốt đơn (hộp nhập số tiền thật) / Sửa số tiền / Mở lại / Đưa về Mới / Xoá spam. `/admin/lien-he`: tab Chưa đọc (N) / Đã đọc / Tất cả, trả lời qua email (mailto "Re:"), gọi, đánh dấu đã đọc, xoá. Không đổi backend.
**File thay đổi:** frontend (lib/adminQuotes, lib/adminContacts, lib/adminNav, lib/types, components/admin/AdminTabs, components/admin/quotes/*, components/admin/contacts/*, app/admin/bao-gia, app/admin/lien-he, tests).
**Còn dang dở / Bug đã biết:** Dữ liệu thử local: yêu cầu báo giá "Lê Minh" (Mới), tin nhắn "Hà" (đã đọc); "Spam Bot" đã xoá.
**Bước tiếp theo:** Đợt D — Sản phẩm.

## 2026-10-22 — Admin: Đơn hàng (đợt B)
**Đã làm:** `GET /orders/admin/list?q=` (mã đơn không phân biệt hoa thường; SĐT so chữ số với chữ số bằng SQL `regexp_replace`; tên / email tài khoản). Trang `/admin/don-hang`: tab trạng thái + số "Chờ thanh toán", ô tìm (debounce 300 ms), thẻ / bảng, phân trang, ngăn kéo chi tiết (`?ma=`), xác nhận đã nhận tiền / Đang giao / Hoàn tất / Huỷ, 409 → tải lại; trang Tổng quan link tới đơn.
**File thay đổi:** backend (routes/order, controllers/order, tests); frontend (lib/adminOrders, lib/adminNav, lib/types, components/admin/orders/*, components/orders/OrderStatusBadge, dashboard, app/admin/don-hang, tests).
**Còn dang dở / Bug đã biết:** Đơn thử trên DB local (khách donthu…@example.com): NP-261022-29KVSW, 1GIIL6, 1U2M5C (hoàn tất), 1RRWRH, W3G55J, 1KGD60 (đã huỷ).
**Bước tiếp theo:** Đợt C — Yêu cầu báo giá + Tin nhắn liên hệ.

## 2026-10-21 — Admin: khung + Tổng quan (đợt A)
**Đã làm:** Khung admin theo wireframe (sidebar tối ≥1024px, ngăn kéo ☰ trên điện thoại, thanh trên có tên trang + email + Đăng xuất, kiểm tra đăng nhập chung, mục chưa làm hiện "Sắp có"). Trang `/admin` Tổng quan: 4 ô số liệu + "Đơn chuyển khoản sắp hết hạn" + "Khách chờ gọi lại". Đăng nhập xong vào `/admin`.
**File thay đổi:** frontend (lib/adminNav, lib/adminDashboard, lib/types, components/admin/shell/*, components/admin/dashboard/*, app/admin/layout + page + login, tests).
**Còn dang dở / Bug đã biết:** Đơn hàng, Báo giá, Sản phẩm, Tin nhắn chưa có trang (đợt B–D); Bài viết / Thư viện ảnh còn giao diện cũ (đợt E).
**Bước tiếp theo:** Đợt B — Đơn hàng.

## 2026-10-21 — Hero dạng slide (đợt 3)
**Đã làm:** Setting `homepage_hero_slides` (tối đa 6, bật/tắt, khoảng ngày), parse ở server (`lib/heroSlides.ts`), chưa lưu thì dùng hero cũ. Admin: khối "Slide hero" (thêm/sửa/↑↓/xoá). Trang chủ: `HeroSlider` tự chạy 6 s, dừng khi hover/focus/tab ẩn/⏸, reduced motion không tự chạy, vuốt, ← →, slide ẩn `inert`, 1 `<h1>`, CLS 0; 1 slide → hero tĩnh.
**File thay đổi:** frontend (lib/heroSlides, lib/useMediaState, lib/adminSettings, components/home/Hero + HeroSlider, admin HeroSlideFields + SettingsEditor, app/page, tests).
**Còn dang dở / Bug đã biết:** Chưa có ảnh hero thật.
**Bước tiếp theo:** Production setup (migration + seed cây), nhập dữ liệu shop thật.

## 2026-10-21 — Trang admin danh mục (đợt 2) + sửa lỗi giỏ hàng
**Đã làm:** Sửa `resolveBrand` (giỏ hàng từ chối sản phẩm ở mục lá — commit 179d948). `/admin/danh-muc`: cây kèm số SP, thêm / sửa / chuyển nhánh / đổi slug / ↑↓ / xoá có chặn, thông số danh mục; API admin giới hạn theo brand; bảng `CategorySlugRedirect` + 308 cho slug cũ. ADR-017.
**File thay đổi:** backend (schema, migration 20261021120000, utils/categoryTree, services/categoryAdmin, controllers/category, routes/category, tests); frontend (lib/adminCategories, types, services/catalog, danh-muc page, components/admin/categories/*, app/admin/danh-muc, admin layout, tests).
**Còn dang dở / Bug đã biết:** Số SP trên dòng loài/nhóm chỉ đếm sản phẩm gắn trực tiếp.
**Bước tiếp theo:** Đợt 3 — hero dạng slide, admin CRUD.

## 2026-10-20 — Chuyển thẳng tới đăng nhập; cây danh mục + mega menu
**Đã làm:** proxy.ts + SignInRedirect (commit ccdde5d). Cây danh mục 3 tầng (46 mục), `sortOrder`, lọc cây con cho sản phẩm/blog/gallery, `?brand=`, script `seed:category-tree` (dry run / --apply), chuyển 13 sản phẩm mẫu local; mega menu Chó/Mèo (banner + thương hiệu từ /admin/cau-hinh), bỏ dropdown ☰ (menu: Trang chủ · Chó · Mèo · …), vòng "Mua theo bé cưng" admin chỉnh (6 vòng mặc định), menu mobile nhiều tầng, breadcrumb đủ cấp, chip danh mục con, lọc `?thuong-hieu=` (noindex). ADR-016.
**File thay đổi:** backend (schema, migration 20261020120000, utils/categoryTree, services/categoryScope, controllers product/blog/gallery/category, routes/product, scripts categoryTree/seedCategoryTree/migrateDemoCategories/petshopCatalog, tests); frontend (lib categoryTree/megaMenu/catalogParams/adminSettings/seo/categoryCrumbs, services catalog/content, components layout MegaMenu/MegaMenuPanel/CategoryMenu/MobileMenu/SiteHeader, admin MegaMenuFields, ui Chevron, pages danh-muc/san-pham/layout/sitemap, tests).
**Còn dang dở / Bug đã biết:** Chưa có ảnh banner/logo thật. Production chưa chạy các migration 20261016…20261020 và seed cây.
**Bước tiếp theo:** Đợt 2 — trang admin quản lý danh mục (thêm/sửa/xoá/sắp xếp/chuyển nhánh).

## 2026-10-20 — Trang chủ, header, footer khớp wireframe; CTKM chỉnh trong admin
**Đã làm:**
- `/blog`, bài viết, `/gallery` theo wireframe (bài nổi bật, chip chủ đề, mục lục, masonry + lightbox) — ADR-013.
- `/admin/cau-hinh`: thanh thông báo, hero, 5 CTKM (bật/tắt, từ ngày–đến ngày), ảnh danh mục, thông tin shop, ngân hàng, trang nội dung; lưu → revalidate ngay — ADR-014.
- Trang mới: `/san-pham`, `/tu-van-bao-gia` (+ nút "Nhờ tư vấn" / "Hỏi giá"), `/lien-he`, `/gioi-thieu`, `/chinh-sach/*` — ADR-015.
- Trang chủ, header (tìm theo danh mục, menu đầy đủ, drawer phone), footer 4 cột khớp wireframe.
**Lỗi tìm ra và đã sửa:** limiter liên hệ / báo giá đếm theo IP server Next (cả site chung 5 lượt); checkout crash khi không có `crypto.randomUUID` (http LAN, trình duyệt cũ); focus lightbox; tương phản 4.49:1 trên nền mint; tràn khi zoom 200% ở form và header.
**File thay đổi:** commit `ae38b8d` → `ab7dc8e`.
**Còn dang dở / Bug đã biết:**
- Chưa nhập dữ liệu thật: thông tin shop, ngân hàng, ảnh danh mục, nội dung giới thiệu / chính sách (CTKM mẫu đang có trong DB local).
- Ảnh gallery bị cắt theo khung (chưa lưu kích thước ảnh).
- Admin vẫn token localStorage, gọi thẳng backend (cần `FRONTEND_URLS` đúng origin).
- Tài khoản admin test trên DB local (`admintest…@example.com`) — xoá hoặc hạ quyền khi không cần.
- Mọi mục "Còn dang dở" của 2026-10-19 vẫn còn (migration production, `INTERNAL_API_SECRET`, LCP).
**Bước tiếp theo:** setup production; trang admin sản phẩm / đơn hàng / tồn kho theo wireframe.

## 2026-10-19 — Storefront đầy đủ: trang chủ → danh mục → sản phẩm → giỏ → đặt hàng
**Đã làm:**
- Nền frontend: token màu, layout (header, footer, bottom nav), trang chủ theo wireframe, `robots.ts` / `sitemap.ts` lấy domain từ `NEXT_PUBLIC_SITE_URL`, `noindex` cho môi trường không phải production (ADR-008).
- Seed catalogue demo cho DB local (`npm run db:seed:petshop`, chặn DB không phải localhost).
- Trang `/danh-muc/[slug]`, `/san-pham/[slug]` có JSON-LD Product / Offer / BreadcrumbList (ADR-009).
- Next.js làm BFF, token khách trong cookie httpOnly; rate limit đăng nhập 10 lần / 15 phút theo IP thật của khách (`X-Client-IP` chỉ tin khi có secret) (ADR-010).
- Đăng nhập / đăng ký, giỏ hàng, đặt hàng COD / chuyển khoản (Idempotency-Key, chỉ hiện chuyển khoản khi có `bank_*`), tài khoản + đơn của tôi.
- Sửa ảnh blog / gallery hỏng (ghép `BACKEND_ORIGIN` vào URL Cloudinary), blog / gallery chuyển ISR + `/api/revalidate` cho admin, BlogPosting bỏ "Miniecom".
- Tìm kiếm không dấu + sắp xếp theo giá: cột dẫn xuất `searchName` / `minPrice`, migration `20261019120000` (ADR-011); trang `/tim-kiem`, link sắp xếp ở danh mục (ADR-012).
- Rà soát mobile: thanh "Thêm vào giỏ" / "Đặt hàng" dính đáy, focus field lỗi đầu tiên, zoom 200%, tên rất dài, `tabular-nums`, padding `md:px-6`.
**Lỗi tìm ra và đã sửa:** đăng xuất không xoá cookie `__Host-` (`cookies().delete()` thiếu Secure); Prisma `contains` không escape `%` `_` (tìm "%%" khớp mọi sản phẩm, cả ở admin); `/api/cart` trả 401 cho khách vãng lai làm lỗi console mọi trang; CLS 0.5 trang tài khoản / thanh toán; CLS 0.18 ở `/blog`.
**File thay đổi:** 13 commit `5f87784` → `bea4876` (frontend-petshop: app, components, lib, services, test; backend: rateLimitKeys, auth.route, product controller/route, catalog.service, utils/searchText, migration, scripts/seed).
**Còn dang dở / Bug đã biết:**
- Production chưa chạy 3 migration: `20261016120000`, `20261018120000`, `20261019120000` (thiếu thì đặt hàng / danh sách sản phẩm lỗi). Chạy khi setup production, backup trước.
- `INTERNAL_API_SECRET` chưa đặt ở `backend/.env`, `frontend-petshop/.env.local`, Render, Vercel (thiếu: mọi khách chung 1 bucket rate limit đăng nhập).
- LCP lab 2.6–3.5s (mục tiêu 2.5s), cao nhất ở `/blog`, `/gallery` (ảnh Cloudinary gốc lớn — giả thuyết chưa kiểm chứng) và `/gio-hang`. Cần đo PageSpeed trên production.
- Backend vẫn nhận đơn BANK_TRANSFER khi shop chưa có `bank_*` (chỉ UI ẩn). `confirm-payment` / `cancel` admin chưa lọc theo brand.
- Đổi setting (ngân hàng, hero) hiện sau tối đa 5 phút — trang admin settings chưa gọi `/api/revalidate`.
- Admin vẫn lưu token trong localStorage; admin chưa có xoá ảnh gallery.
- Chưa kiểm trên máy thật (bàn phím ảo iOS với thanh dính đáy); chưa cài Playwright.
- DB local có dữ liệu test (khách test, 2 đơn, kho pate −2).
**Bước tiếp theo:**
- Setup production (Render + Vercel): biến môi trường, 3 migration, nhập `bank_*`, đo PageSpeed.
- Chặn BANK_TRANSFER ở backend khi thiếu `bank_*`; admin settings gọi revalidate.
- Trang admin cho sản phẩm / đơn hàng / tồn kho theo wireframe (thay localStorage bằng BFF cookie).
- Hỏi trước: cài Playwright cho critical flows E2E.

## 2026-10-12 — Chuẩn hoá rule cho Claude Code
**Đã làm:**
- Đổi `CLAUDE (4).md` → `CLAUDE.md`, điền thông tin thật của dự án, rút gọn còn ~250 dòng.
- Tách rule SEO và mobile UI sang `.claude/rules/seo.md`, `.claude/rules/mobile-ui.md`.
- Tạo `docs/DECISIONS.md` (ADR-001..003) và file này.
**File thay đổi:**
- `CLAUDE.md`, `.claude/rules/seo.md`, `.claude/rules/mobile-ui.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`
**Còn dang dở / Bug đã biết:**
- Race: `confirmPayment` / `cancelOrder` đọc trạng thái ngoài transaction (trừ / hoàn kho hai lần); `rotateRefreshToken` không atomic.
- JSON-LD ở `app/blog/[slug]/page.tsx` chưa escape `<`.
- Rate limit chung 100 req / 15 phút / IP chặn nhầm SSR của Next.
- Trang chủ còn là trang mẫu; domain cũ hardcode trong `sitemap.ts`, `robots.txt`.
- Tên thương hiệu đã chốt "Siêu thị của chó mèo" nhưng code còn dùng "Petshop" / "Miniecom" (layout title, JSON-LD author fallback).
- Chưa có database test, Playwright.
**Bước tiếp theo:**
- `/transaction-race-test` cho đơn hàng + refresh token.
- `/seo-ai-visibility` + `/mobile-responsive-ui` cho trang chủ, layout, blog.
