---
name: "seo-ai-visibility"
description: "Dùng khi tạo hoặc sửa trang public Express + Next.js, áp checklist SEO, AEO, GEO, AIO, SXO (metadata, schema, SSR, Core Web Vitals, nội dung answer-first, đo AI traffic)."
---

# SEO · AEO · GEO · AIO · SXO cho dự án Express + Next.js

Skill này biến "Modern SEO Cluster" (SEO, AEO, GEO, AIO, SXO) thành **tiêu chí nghiệm thu có thể kiểm chứng** cho các trang public. Mỗi trụ cột có việc cụ thể ở Next.js (frontend), Express (backend), cách kiểm tra, và phần nào cần con người làm.

## 1. Khi nào dùng / không dùng

**Dùng khi:**
- Tạo hoặc sửa trang public: landing, blog, sản phẩm, danh mục, giới thiệu, chính sách.
- Đổi metadata, URL / slug, redirect, sitemap, robots, schema.
- Tối ưu tốc độ hoặc trải nghiệm trang public; review SEO một trang hoặc cả site.

**Không dùng khi:** dashboard, admin, giỏ hàng / thanh toán, tài khoản, API thuần, staging. Với các phần này chỉ cần đảm bảo `noindex`.

## 2. Ghi chú trung thực (đọc trước)

- 5 trụ cột **chồng lấn nhau nhiều**. Lõi chung: crawl được, nhanh, nội dung trả lời rõ, dữ liệu có cấu trúc đúng, thương hiệu / tác giả nhất quán.
- AEO / GEO / AIO là thuật ngữ thị trường, chưa có chuẩn kỹ thuật riêng. Theo hướng dẫn của Google Search Central, AI Overviews / AI Mode dựa trên nền tảng SEO thông thường. **Không có mẹo nào đã được chứng minh**; không cam kết thứ hạng hay lượt được AI trích dẫn.
- Không có kết quả tức thì: thay đổi cần thời gian để được crawl và đánh giá.
- Backlink, brand mention, được AI gợi ý, đánh giá thật: **không làm bằng code**. Ghi vào "Việc cần tôi làm", không bịa giải pháp kỹ thuật.
- Cú pháp Next.js thay đổi theo phiên bản (vd `params` là Promise từ Next 15; metadata có thể được stream từ Next 15.2; `revalidateTag` cần tham số thứ hai và `priority` của `next/image` bị thay bằng `preload` từ Next 16). **Kiểm tra phiên bản Next trong `package.json` và docs tương ứng** trước khi đưa code mẫu.
- Code mẫu ở mục 5 dành cho **App Router**. Dự án dùng Pages Router cần cách khác (`getStaticProps` / `getServerSideProps`, `next/head`): nói rõ điều này thay vì áp code mẫu.

## 3. Quy trình mỗi task

1. **Xác định phạm vi:** trang này public hay private? Private → chỉ `noindex`, dừng.
2. **Thu thập thông tin** (thiếu thì hỏi, không bịa): domain chính, ngôn ngữ, loại trang, **search intent chính** (informational / commercial / transactional / navigational), chủ đề / từ khoá chính, chính sách AI crawler, đã có analytics / Search Console chưa, phiên bản Next.js.
3. **Đi qua 5 trụ cột** ở mục 4 và chọn tiêu chí áp dụng cho loại trang này.
4. **Trình bày hướng dẫn:** nếu CLAUDE.md của project có "chế độ hướng dẫn" (mục 0.1) thì làm theo đúng cấu trúc đó (thư mục & file → giải thích → code mẫu → test cần chạy) và **không tự tạo hay sửa file**. Nếu project không có chế độ này, vẫn nêu rõ file, vị trí, lý do và cách kiểm tra.
5. **Test cần chạy:** dùng các lệnh ở mục 6, chạy trên production build.
6. **Cuối câu trả lời** luôn có mục "Việc cần tôi làm (content / marketing)" nếu có phần không làm bằng code được.
7. Đổi URL / slug / robots / sitemap / canonical / chính sách AI crawler là việc nhạy cảm: cần plan có redirect và ghi `DECISIONS.md`.

## 4. Ma trận tiêu chí

### 4.1 SEO

| Tiêu chí | Làm ở đâu | Kiểm tra bằng |
|---|---|---|
| **Technical:** nội dung chính nằm trong HTML ban đầu | Next: Server Component / SSG / ISR / SSR. Không lấy nội dung chính trong `useEffect`; `'use client'` chỉ cho phần tương tác | `curl -s URL` thấy nội dung và `<h1>` |
| Status code & redirect đúng | Next: `notFound()`, `redirects()` trong `next.config`. Express: trả 404 / 410 đúng | `curl -sI URL` |
| **On-page:** title, description riêng; canonical; 1 h1; heading phân cấp; slug đẹp | Next: `generateMetadata`, JSX | curl + Lighthouse SEO |
| Crawl & index: sitemap, robots, noindex trang private | Next: `app/sitemap.ts`, `app/robots.ts`, `robots: { index: false }`. Express: cấp `slug`, `updated_at` | `curl /sitemap.xml`, `/robots.txt` |
| URL có tham số (lọc, sắp xếp, phân trang, tìm kiếm) | Next: `canonical` về URL chuẩn hoặc `robots: { index: false }`; không đưa vào sitemap | `curl -s URL`, xem canonical / meta robots |
| Nhiều ngôn ngữ (nếu có) | Next: `alternates.languages` (hreflang) trong metadata và sitemap | `curl -s URL`, xem `hreflang` |
| Staging / preview không bị index | Next: header `X-Robots-Tag` trong `next.config` hoặc mật khẩu (xem R1) | `curl -sI URL` |
| **Topical Authority:** pillar ↔ cluster, breadcrumb | Data: bảng topic / category, bài liên quan. Next: `<Link>` anchor mô tả | Review thủ công, crawl thử |
| **Entity & Semantic:** tên nhất quán, JSON-LD, `sameAs` | Next: `JsonLd` cho Organization / Product / Article / BreadcrumbList / Person | Schema Markup Validator |
| **Off-page** | Con người (backlink, PR) | — |

### 4.2 AEO

| Tiêu chí | Làm ở đâu | Kiểm tra bằng |
|---|---|---|
| Answer-first: câu trả lời ngắn (~40–60 từ) ngay đầu trang | Nội dung / template trang | Đọc thủ công |
| H2 / H3 dạng câu hỏi thật; trả lời bằng đoạn ngắn, list, bảng | Nội dung + JSX semantic (`ul`, `table`) | Đọc thủ công |
| FAQ hiển thị thật + `FAQPage` JSON-LD khớp | Next: component FAQ + `JsonLd` | Rich Results Test |
| Giọng tự nhiên cho voice search; NAP nếu có cửa hàng | Nội dung | Đọc thủ công |

### 4.3 GEO

| Tiêu chí | Làm ở đâu | Kiểm tra bằng |
|---|---|---|
| Nội dung dễ trích dẫn: dữ kiện cụ thể, nguồn, ngày cập nhật, tác giả thật | Nội dung; Next: `Person` / `Article` schema; trang About | Đọc thủ công + validator |
| Không giấu nội dung quan trọng sau JS / tab cần tương tác | Next: render sẵn trong HTML | `curl -s URL` |
| title, canonical nằm trong `<head>` | Next ≥ 15.2 có thể stream metadata xuống `<body>` khi trang render động. Ưu tiên prerender (SSG / ISR); nếu buộc phải động, cân nhắc `htmlLimitedBots` trong `next.config` | Lệnh 1b ở mục 6 |
| Không chặn nhầm bot tìm kiếm / AI | `robots.ts`, WAF / CDN / rate limit ở Express | `curl -A "<tên bot>" -I URL`, log |
| Chính sách từng bot | **Quyết định của chủ dự án** → `DECISIONS.md` | — |
| Brand mentions, AI recommendations | Con người | — |

### 4.4 AIO

| Tiêu chí | Làm ở đâu | Kiểm tra bằng |
|---|---|---|
| Không có kỹ thuật riêng; bám SEO nền + nội dung hữu ích | — | — |
| Không đặt `nosnippet` / `max-snippet` nhỏ ngoài ý muốn | Metadata / header | `curl -sI`, xem meta robots |
| **AI Search Analytics:** ghi referrer AI, log User-Agent bot, Search Console | Analytics frontend (referrer); log ở **tầng nhận request trang**: CDN / reverse proxy / Next.js. Express chỉ thấy bot khi tự phục vụ trang | Báo cáo analytics, log |
| `llms.txt` (tuỳ chọn, ưu tiên thấp, chưa có bằng chứng được nền tảng lớn dùng) | `public/llms.txt` | — |

### 4.5 SXO

| Tiêu chí | Làm ở đâu | Kiểm tra bằng |
|---|---|---|
| **Search Intent:** mỗi trang một intent chính, CTA khớp intent | Plan + nội dung | Review |
| **Core Web Vitals:** LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 | Next: `next/image` (width / height; ảnh LCP: Next 16+ dùng `preload` hoặc `fetchPriority="high"`, Next ≤ 15 dùng `priority`), `next/font`, `next/script`, dynamic import. Express: TTFB nhanh (index, tránh N+1), `Cache-Control` | Lighthouse (lab); PageSpeed Insights / Search Console (field) |
| UX & Page Experience: mobile-first, đọc được, không popup che nội dung | CSS / layout | Thử trên điện thoại thật |
| **CRO:** CTA rõ, form ngắn, tín hiệu tin cậy thật, theo dõi sự kiện | Component + analytics events | Xem sự kiện trong analytics |
| **Content Experience:** dễ lướt, mục lục khi bài dài, ảnh / bảng minh hoạ | Nội dung + layout | Đọc thủ công |
| **Engagement & Retention:** liên kết liên quan, trạng thái loading / empty / error | Next: component gợi ý, UI state | Thử thủ công |

## 5. Code mẫu (Next.js App Router + TypeScript + Express)

### R1. Metadata gốc và chặn index ở môi trường không phải production

```tsx
// frontend/src/app/layout.tsx
import type { Metadata } from 'next';

const isProd = process.env.APP_ENV === 'production';

export const metadata: Metadata = {
  // production BẮT BUỘC đặt NEXT_PUBLIC_SITE_URL, nếu không canonical / OG sẽ sai
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: 'Tên site', template: '%s | Tên site' },
  description: 'Mô tả ngắn của site',
  openGraph: { siteName: 'Tên site', locale: 'vi_VN', type: 'website' },
  // staging / preview không được index
  robots: isProd ? { index: true, follow: true } : { index: false, follow: false },
};
```

Lưu ý: metadata của các cấp được gộp kiểu "nông" (shallow merge), nên trang nào tự khai báo `robots` sẽ **ghi đè** `robots` của layout gốc. Để chặn index chắc chắn ở staging / preview, thêm header (hoặc đặt mật khẩu):

```ts
// frontend/next.config.ts  (Next 14: next.config.mjs)
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    // APP_ENV phải có giá trị lúc build và lúc start
    if (process.env.APP_ENV === 'production') return [];
    return [
      { source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};

export default nextConfig;
```

### R2. Metadata động cho trang chi tiết

```tsx
// frontend/src/app/products/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProduct } from '@/services/products';

// Next 15+: params là Promise. Next 14: type Props = { params: { slug: string } } và dùng params.slug trực tiếp
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: 'Không tìm thấy', robots: { index: false } };

  const path = `/products/${product.slug}`;
  const title = product.metaTitle ?? product.name;
  const description = product.metaDescription ?? product.summary;

  return {
    title,
    description,
    alternates: { canonical: path }, // được nối với metadataBase
    openGraph: {
      title,
      description,
      url: path,
      images: product.ogImage ? [{ url: product.ogImage }] : undefined,
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound(); // trả 404 thật, tránh soft-404

  return (
    <main>
      <h1>{product.name}</h1>
      {/* nội dung chính render phía server */}
    </main>
  );
}
```

### R3. JSON-LD an toàn (escape `<`) và schema mẫu

```tsx
// frontend/src/components/seo/JsonLd.tsx
type JsonLdProps = { data: Record<string, unknown> };

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      // escape "<" để nội dung không thể đóng thẻ script (chống XSS)
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
```

```tsx
// trong page.tsx của sản phẩm
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

const productJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: product.name,
  description: product.summary,
  image: product.images,
  sku: product.sku,
  brand: { '@type': 'Brand', name: 'Tên thương hiệu' },
  offers: {
    '@type': 'Offer',
    url: `${siteUrl}/products/${product.slug}`,
    priceCurrency: 'VND',
    price: product.price, // số thật, không định dạng
    availability: 'https://schema.org/InStock', // đổi theo tồn kho thật
  },
  // CHỈ thêm aggregateRating khi trang hiển thị đánh giá thật của khách
};

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: siteUrl },
    { '@type': 'ListItem', position: 2, name: 'Sản phẩm', item: `${siteUrl}/products` },
    { '@type': 'ListItem', position: 3, name: product.name },
  ],
};

// trong JSX:
// <JsonLd data={productJsonLd} />
// <JsonLd data={breadcrumbJsonLd} />
```

Các loại schema khác: `Organization` / `WebSite` (trang chủ, kèm `logo`, `sameAs` trỏ tới các trang mạng xã hội chính thức), `BlogPosting` (`headline`, `datePublished`, `dateModified`, `author` kiểu `Person`, `image`), `Person` (trang tác giả). Schema **phải khớp nội dung đang hiển thị**.

### R4. Sitemap và robots

```ts
// frontend/src/app/sitemap.ts
import type { MetadataRoute } from 'next';
import { getPublishedProductSlugs } from '@/services/products';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

// sitemap.ts được cache mặc định: thiếu dòng này thì sitemap chỉ đổi khi build lại.
// (Dự án bật cacheComponents thì dùng cơ chế cache tương ứng, xem docs.)
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getPublishedProductSlugs(); // [{ slug, updatedAt }] từ Express
  return [
    { url: siteUrl }, // không đặt lastModified giả cho trang không có ngày sửa thật
    ...products.map((p) => ({
      url: `${siteUrl}/products/${p.slug}`,
      lastModified: p.updatedAt, // ngày sửa THẬT từ DB
    })),
  ];
}
// Quá 50.000 URL: dùng generateSitemaps() để tách nhiều sitemap
```

```ts
// frontend/src/app/robots.ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // KHÔNG chặn /_next/ (cần cho render). Disallow không thay thế noindex.
        disallow: ['/admin', '/api', '/cart', '/checkout', '/account'],
      },
      // Ví dụ chính sách cho bot AI, CHỈ thêm sau khi chủ dự án quyết định và ghi DECISIONS.md.
      // Tên bot có thể thay đổi: kiểm tra tài liệu của từng nhà cung cấp.
      // { userAgent: 'GPTBot', disallow: '/' },            // bot huấn luyện của OpenAI
      // { userAgent: 'OAI-SearchBot', allow: '/' },         // bot tìm kiếm của OpenAI
      // { userAgent: 'PerplexityBot', allow: '/' },
      // { userAgent: 'Google-Extended', disallow: '/' },    // không ảnh hưởng Google Search
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
```

### R5. Lấy dữ liệu từ Express có cache + làm mới khi nội dung đổi

```ts
// frontend/src/services/products.ts
const API = process.env.API_BASE_URL!; // URL Express, chỉ dùng phía server

export async function getProduct(slug: string) {
  const res = await fetch(`${API}/api/v1/products/${slug}`, {
    // cache 5 phút; gắn tag để làm mới đúng trang khi sản phẩm đổi
    next: { revalidate: 300, tags: [`product:${slug}`] },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json(); // { success, data }
  return json.data;
}
```

Làm mới theo yêu cầu (on-demand): Express gọi một route handler bảo vệ bằng secret của Next (`app/api/revalidate/route.ts`) sau khi sản phẩm / bài viết được sửa, route này gọi `revalidateTag`. **Cú pháp theo phiên bản:** Next 16+ bắt buộc tham số thứ hai — `revalidateTag(tag, 'max')` (phục vụ bản cũ trong lúc làm mới) hoặc `revalidateTag(tag, { expire: 0 })` (hết hạn ngay, hợp với webhook từ Express); Next 14 / 15 dùng `revalidateTag(tag)`. Secret so sánh ở server, không để lộ ra client.

### R6. FAQ hiển thị thật + FAQPage

```tsx
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.question,
    acceptedAnswer: { '@type': 'Answer', text: f.answer },
  })),
};
// Mỗi câu hỏi / đáp trong faqs PHẢI đang hiển thị trên trang (h3 + đoạn trả lời).
// Google đã giới hạn rich result FAQ: coi đây là tín hiệu cho máy, không hứa hiển thị đặc biệt.
```

### R7. Express: header cho API và cache công khai

```ts
// backend/src/app.ts
// API không phải trang để index
app.use('/api', (_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
```

Header này chỉ có tác dụng khi API truy cập được công khai (trình duyệt gọi trực tiếp hoặc API có domain riêng).

```ts
// backend/src/middlewares/public-cache.ts
import type { Request, Response, NextFunction } from 'express';

// CHỈ dùng cho GET công khai, KHÔNG dùng cho dữ liệu theo người dùng / có auth
export const publicCache =
  (seconds = 60) =>
  (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 5}`);
    next();
  };

// dùng: router.get('/products', publicCache(60), controller.list);
```

### R8. Mẫu nội dung answer-first

```markdown
# [Câu hỏi hoặc tên chủ đề — đúng 1 H1]

**Trả lời ngắn:** [40–60 từ, trả lời thẳng câu hỏi chính, có dữ kiện cụ thể.]

## [Câu hỏi con 1]
[Đoạn ngắn, hoặc danh sách, hoặc bảng so sánh.]

## [Câu hỏi con 2]
...

## Câu hỏi thường gặp
### [Câu hỏi 1?]
[Trả lời ngắn.]

Cập nhật lần cuối: [ngày] · Tác giả: [tên thật, link trang tác giả]
Nguồn: [liên kết nguồn đáng tin]
```

## 6. Lệnh kiểm chứng (chạy trên production build: `build` rồi `start`)

```bash
# 1. HTML trả về có đủ nội dung / metadata / schema mà KHÔNG cần chạy JS?
curl -s http://localhost:3000/products/slug-mau | grep -Eo '<title>[^<]*|<h1[^>]*>|rel="canonical"[^>]*|application/ld\+json'

# 1b. title và canonical có nằm trong <head> không? (Next >= 15.2 có thể stream metadata xuống <body>)
curl -s http://localhost:3000/products/slug-mau | grep -o '<head>.*</head>' | grep -Eo '<title>[^<]*|rel="canonical"[^>]*'

# 2. 404 thật?
curl -sI http://localhost:3000/products/khong-ton-tai | head -n 1

# 3. robots và sitemap
curl -s http://localhost:3000/robots.txt
curl -s http://localhost:3000/sitemap.xml | head -n 20

# 4. Header (X-Robots-Tag cho API, Cache-Control cho GET công khai)
curl -sI http://localhost:4000/api/v1/products | head -n 15

# 5. Điểm số (số liệu lab)
npx lighthouse http://localhost:3000/products/slug-mau --only-categories=performance,seo,accessibility,best-practices --view
```

Sau đó: dán JSON-LD vào Schema Markup Validator hoặc Rich Results Test; sau khi triển khai, dùng URL Inspection trong Search Console. Lighthouse là số liệu lab; INP thực tế cần dữ liệu field (PageSpeed Insights, CrUX, Search Console).

## 7. Việc cần con người (không giao cho code)

- Viết và cập nhật nội dung gốc, hữu ích; chọn chủ đề / từ khoá; xác định search intent.
- Backlink, PR, citation, brand mention, đánh giá thật từ khách hàng.
- Quyết định chính sách cho từng AI crawler.
- Thiết lập và xác minh Google Search Console, Bing Webmaster Tools, analytics (kèm cơ chế đồng ý cookie theo luật nơi có người dùng).
- Theo dõi kết quả theo thời gian (vài tuần đến vài tháng), không đánh giá sau một lần triển khai.

## 8. Lỗi hay gặp và điều cấm

- Trang public chỉ render phía client (nội dung nằm trong `useEffect` hoặc chỉ có sau khi JS chạy).
- Title / description trùng nhau trên nhiều trang; nhiều `<h1>`; thiếu canonical; canonical trỏ sai domain do thiếu `metadataBase`.
- `noindex` lọt lên production, hoặc staging không có `noindex`; chặn `/_next/` trong robots.txt; tưởng `Disallow` là `noindex`.
- Đổi slug / URL mà không redirect; soft-404 (trả 200 cho trang không tồn tại); redirect chain dài.
- Schema không khớp nội dung hiển thị; `aggregateRating` / review giả; FAQPage cho câu hỏi không hiển thị.
- `lastModified` trong sitemap luôn là `new Date()` (tín hiệu sai, làm mất độ tin cậy).
- `sitemap.ts` không đặt chu kỳ làm mới, nên URL mới không xuất hiện cho tới lần build sau.
- Trang public render động làm title / canonical bị stream xuống `<body>`; chỉ dựa vào `robots` của layout để chặn index staging.
- Đặt log bot AI ở Express trong khi bot chỉ gọi vào Next.js / CDN.
- Nhồi từ khoá, text ẩn, cloaking, tạo hàng loạt trang mỏng tự động.
- Ảnh không có kích thước (gây CLS), ảnh LCP không được ưu tiên tải, script bên thứ ba chặn render.
- Tối ưu "cho AI" bằng mẹo không có bằng chứng thay vì làm tốt nền tảng.
- Dùng `dangerouslySetInnerHTML` cho nội dung khác ngoài JSON-LD đã escape.

## 9. Checklist trước khi báo xong (trang public)

- [ ] Đã xác định loại trang, search intent, chủ đề chính.
- [ ] Nội dung chính có trong HTML khi không chạy JS (kết quả curl).
- [ ] title, description, canonical riêng; đúng 1 h1; heading phân cấp.
- [ ] JSON-LD hợp lệ, khớp nội dung hiển thị, đã escape.
- [ ] title và canonical nằm trong `<head>`; staging có `X-Robots-Tag: noindex`.
- [ ] Có trong sitemap (nếu public); trang private có `noindex`; robots không chặn `/_next/`.
- [ ] Internal link bằng `<Link>`, anchor mô tả; breadcrumb nếu có phân cấp.
- [ ] Answer-first + câu hỏi thật làm heading (nếu là trang nội dung).
- [ ] Core Web Vitals / Lighthouse trên production build đã được đo (hoặc ghi rõ "chưa đo").
- [ ] Express: có `slug`, `updated_at`, các trường SEO; `/api` có `X-Robots-Tag`; cache công khai đúng chỗ.
- [ ] Đã liệt kê "Việc cần tôi làm" và ghi `DECISIONS.md` nếu đổi URL / robots / chính sách bot.