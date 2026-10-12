---
paths:
  - "frontend-petshop/app/**"
  - "frontend-petshop/components/**"
  - "frontend-petshop/lib/**"
  - "frontend-petshop/public/**"
  - "frontend-petshop/next.config.ts"
  - "backend/prisma/schema.prisma"
  - "backend/controllers/{blog,product,category,gallery,setting}.controller.ts"
  - "backend/routes/{blog,product,category,gallery,setting}.route.ts"
  - "backend/app.ts"
---

# Search & AI Visibility — SEO · AEO · GEO · AIO · SXO

Tiêu chí **nghiệm thu** cho mọi trang public. Task chạm trang public mà chưa qua checklist này = **chưa xong**. Code mẫu chi tiết: skill `seo-ai-visibility`.

## Phạm vi
- **Tối ưu:** trang chủ, blog + bài viết, danh mục, sản phẩm, gallery, giới thiệu, liên hệ, chính sách (đổi trả, giao hàng, bảo mật).
- **Chỉ `noindex`:** `/admin/**`, giỏ hàng, checkout, tài khoản, "đơn của tôi", trang tìm kiếm nội bộ, staging / preview.
- Không rõ trang thuộc nhóm nào → hỏi.

## Bối cảnh riêng của dự án
- **Chưa có domain:** mọi URL tuyệt đối từ `NEXT_PUBLIC_SITE_URL` (`metadataBase`, canonical, sitemap, robots, JSON-LD). Cấm hardcode domain; `public/robots.txt` tĩnh phải thay bằng `app/robots.ts`.
- **AI crawler: cho phép tất cả** (ADR-001). Không chặn GPTBot, Google-Extended, ClaudeBot, PerplexityBot...; không đặt `nosnippet` / `max-snippet` nhỏ. Đổi chính sách = LARGE + ADR mới.
- **Nội dung sức khỏe thú cưng là YMYL** (ảnh hưởng an toàn của con vật và tiền của chủ nuôi): bài về thú y, giun sán, ve rận, dinh dưỡng phải có **tác giả thật** (trang tác giả + `Person` schema, nêu kinh nghiệm / chuyên môn), **nguồn tham khảo**, **ngày cập nhật**, và dòng "Thông tin tham khảo, không thay thế chẩn đoán của bác sĩ thú y" ở bài điều trị / liều thuốc. Không đưa liều thuốc cụ thể khi không có nguồn.
- **Topical authority** theo cụm, mỗi cụm 1 trang trụ cột (pillar) ↔ nhiều bài vệ tinh, liên kết hai chiều bằng `<Link>` anchor mô tả, và nối sang danh mục sản phẩm liên quan:
  - Dinh dưỡng (thức ăn chó / mèo, pate, theo độ tuổi) ↔ danh mục thức ăn, pate
  - Sức khỏe & thú y (giun sán, ve rận, tiêm phòng, dấu hiệu bệnh) ↔ sản phẩm tẩy giun, trị ve rận
  - Chăm sóc (tắm, cắt móng, huấn luyện, chó con / mèo con) ↔ phụ kiện
  - Phụ kiện chó mèo ↔ danh mục phụ kiện
  - Tách nhánh **chó** và **mèo** khi nội dung khác nhau; dùng cả từ thông dụng (cún, miu) tự nhiên trong bài, **không nhồi**.
- Search intent: blog = informational; danh mục = commercial; sản phẩm = transactional; trang chủ / liên hệ = navigational. Ghi intent trong plan; CTA khớp intent (bài viết → gợi ý sản phẩm liên quan; sản phẩm → thêm giỏ / hỏi giá).

## SEO — nền tảng
- [ ] Nội dung chính có trong **HTML ban đầu** (Server Component / SSG / ISR); không CSR-only, không lấy nội dung chính trong `useEffect`.
- [ ] Status đúng: `notFound()` cho slug sai (404 thật, không soft-404); đổi URL → redirect 301/308 trong `next.config.ts`. Một hostname chuẩn, HTTPS.
- [ ] Mỗi trang: `title` + meta description **riêng**, `alternates.canonical`, đúng **1 `<h1>`**, heading h1 → h2 → h3, slug ổn định không dấu, `alt` có nghĩa, Open Graph + Twitter card, OG image.
- [ ] `app/sitemap.ts`: chỉ URL public indexable; `lastModified` = `updatedAt` thật (không `new Date()`); có `export const revalidate`; > 50.000 URL → `generateSitemaps()`. Có ảnh sản phẩm thì cân nhắc image sitemap.
- [ ] `app/robots.ts`: `allow: '/'`, disallow `/admin`, `/api`, giỏ / checkout / tài khoản; **không chặn `/_next/`**; khai báo sitemap. Disallow không thay cho `noindex`.
- [ ] URL có tham số (lọc, sort, phân trang, tìm kiếm): canonical về URL chuẩn hoặc `noindex`; không vào sitemap. Phân trang dùng URL thật (`?page=2`), không infinite scroll cho trang public.
- [ ] Staging / preview: `X-Robots-Tag: noindex` qua `headers()` trong `next.config.ts` theo `APP_ENV` (vì `robots` ở từng trang **ghi đè** layout).
- [ ] Breadcrumb hiển thị + `BreadcrumbList` cho blog, danh mục, sản phẩm.
- [ ] Entity nhất quán: tên thương hiệu **"Siêu thị của chó mèo"** viết giống nhau mọi nơi (title template `%s | Siêu thị của chó mèo`, OG `siteName`, footer, JSON-LD `name`, author fallback — không còn "Petshop" / "Miniecom"); JSON-LD `Organization` + `WebSite` (trang chủ, có `logo`, `sameAs` mạng xã hội thật), `Product` + `Offer` (giá VND số thật, `availability` theo tồn kho thật = `stockQuantity - reservedQuantity`), `BlogPosting` (`headline`, `datePublished`, `dateModified`, `author` Person, `image`), `BreadcrumbList`. Có cửa hàng thật thì `PetStore` / `LocalBusiness` + NAP.
- [ ] **Schema khớp nội dung hiển thị.** Không `aggregateRating` / review khi chưa có đánh giá thật.

## AEO
- [ ] Mở đầu bằng câu trả lời ngắn 40–60 từ cho câu hỏi chính (answer-first), có dữ kiện cụ thể.
- [ ] H2 / H3 là **câu hỏi thật** người nuôi hay hỏi ("Bao lâu tẩy giun cho mèo một lần?"); trả lời bằng đoạn ngắn, danh sách, bảng (vd bảng lịch tẩy giun theo tuổi, bảng so sánh thức ăn).
- [ ] FAQ **hiển thị thật** + `FAQPage` khớp từng câu (tín hiệu cho máy, không hứa rich result).
- [ ] Văn tự nhiên, câu ngắn (voice search).

## GEO
- [ ] Dễ trích dẫn: số liệu, đơn vị, tên, ngày; có nguồn; "Cập nhật lần cuối"; tác giả thật; trang Giới thiệu.
- [ ] Không giấu nội dung quan trọng sau tab / accordion cần JS.
- [ ] Trang public **prerender** (SSG / ISR) để title + canonical nằm trong `<head>` (Next ≥ 15.2 stream metadata xuống `<body>` khi render động). Bắt buộc động thì cân nhắc `htmlLimitedBots`.
- [ ] Không chặn nhầm bot ở robots, rate limit (Express giới hạn chung 100 req / 15 phút / IP — SSR của Next đi chung một IP), WAF / CDN.
- [ ] ISR + on-demand revalidate (`revalidateTag(tag, …)` cú pháp Next 16) thay cho `cache: 'no-store'` trên trang public.

## AIO
- [ ] Không mẹo riêng: bám SEO nền + nội dung hữu ích tự viết.
- [ ] Đo: referrer AI (chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com, claude.ai) trong analytics; log User-Agent bot ở tầng nhận request trang (Next / CDN, không phải Express); Google Search Console + Bing Webmaster.
- [ ] `llms.txt`: tuỳ chọn, ưu tiên thấp.

## SXO
- [ ] Core Web Vitals trên production build: **LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1** (đo cả mobile). `next/image` có width / height + `sizes`; ảnh LCP dùng `preload` / `fetchPriority="high"` (Next 16 bỏ `priority`); `next/font` có subset `vietnamese`; `next/script` cho script bên thứ ba; `next/dynamic` cho component nặng.
- [ ] Mobile-first theo `.claude/rules/mobile-ui.md`; không popup che nội dung.
- [ ] CRO: một CTA chính rõ; form ngắn; tín hiệu tin cậy **thật** (chính sách đổi trả, giao hàng, liên hệ); theo dõi sự kiện (thêm giỏ, đặt hàng, gửi báo giá, click CTA).
- [ ] Bài dài có mục lục; đoạn ngắn; ảnh / bảng minh hoạ; bài liên quan + sản phẩm liên quan; trạng thái loading / empty / error tử tế.

## Yêu cầu backend
- Bảng nội dung public cần: `slug` (unique, ổn định), meta title / description, OG image, `publishedAt`, `updatedAt`, `isIndexable`. Đổi slug → lưu slug cũ để redirect. (Product hiện chưa có trường SEO, Category chưa có `updatedAt` — thêm là migration, LARGE.)
- API public trả đủ trường để dựng metadata + sitemap; list có phân trang; có endpoint nhẹ cho sitemap (chỉ `slug`, `updatedAt`).
- `GET` public gửi `Cache-Control` hợp lý; không cache công khai dữ liệu theo người dùng. TTFB nhanh (index, tránh N+1, `select` cột cần).
- `/api` gắn `X-Robots-Tag: noindex`.
- `.env.example` (frontend) có: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BACKEND_ORIGIN`, `APP_ENV`, `REVALIDATE_SECRET`.
- JSON-LD qua component `JsonLd` **escape `<`**; không lọt dữ liệu nhạy cảm vào HTML.

## Test (trên `npm run build && npm start`, không dùng dev)
```bash
curl -s <url> | grep -Eo '<title>[^<]*|<h1[^>]*>|rel="canonical"[^>]*|application/ld\+json'
curl -s <url> | grep -o '<head>.*</head>' | grep -Eo '<title>[^<]*|rel="canonical"[^>]*'
curl -sI <url-khong-ton-tai> | head -n 1          # 404
curl -s <host>/robots.txt ; curl -s <host>/sitemap.xml | head -n 20
curl -sI -A "GPTBot" <url> | head -n 1            # bot AI không bị chặn
npx lighthouse <url> --only-categories=performance,seo,accessibility,best-practices
```
Rồi: Schema Markup Validator / Rich Results Test; sau deploy: URL Inspection trong Search Console.

## Cấm
Nhồi từ khoá, text ẩn, cloaking, review / rating giả, schema không khớp nội dung, hàng loạt trang mỏng tự động · CSR-only · đổi slug không redirect · `noindex` lọt production hoặc thiếu ở staging · chặn `/_next/` · `lastModified` giả · hardcode domain · tự đổi chính sách AI crawler.

## Cuối mỗi task chạm trang public
Liệt kê **"Việc cần tôi làm (content / marketing)"**: viết / cập nhật nội dung, chọn từ khoá, backlink, mạng xã hội, đánh giá thật, Search Console, analytics + đồng ý cookie.
