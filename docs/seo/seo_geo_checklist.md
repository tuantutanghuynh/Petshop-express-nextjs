# CHECKLIST XÂY DỰNG WEBSITE NEXT.JS + EXPRESS TỐI ƯU SEO VÀ GEO
(Bản sao từ yêu cầu của User)

1. CẤU HÌNH NEXT.JS - SEO CƠ BẢN
- Metadata & Head Tags: i18n routing, generateMetadata, canonical, Open Graph, Twitter Card, robots.txt, sitemap.xml.
- Structured Data (Schema.org): JSON-LD Organization, Product, BreadcrumbList, LocalBusiness, Article.

2. GEO-TARGETING & LOCALIZATION
- Hreflang & Language Routing: hreflang tags, Next.js i18n routing, Accept-Language.
- Geo-IP Detection: middleware detect vị trí, auto-redirect, lưu preference.
- Content Localization: Dịch nội dung, adjust currencies, prices, shipping methods.

3. PERFORMANCE & CORE WEB VITALS
- Next.js Performance: Image Optimization, Code Splitting, Font Optimization, Compression.
- Page Speed Optimization: LCP < 2.5s, FID < 100ms, CLS < 0.1, caching (ISR).
- Database & API: Optimize API responses, caching (Redis), compression.

4. EXPRESS BACKEND - SEO & GEO
- API Response: HTTP status codes chuẩn, Cache headers, Compress responses.
- Geo-Aware API: Rate limiting per geo-region.
- Search Crawlability: Return 200/404 properly, avoid redirect chains.

5. TECHNICAL SEO
- Mobile-first, responsive, optimize touch targets.
- URL Structure: descriptive URLs, hyphens, redirect 301.
