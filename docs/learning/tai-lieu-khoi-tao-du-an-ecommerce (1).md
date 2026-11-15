# Tài liệu khởi tạo dự án: Nền tảng Ecommerce đa ngành (Mini Amazon/Shopify)

## 1. Tổng quan dự án

### 1.1 Mục tiêu
Xây dựng một nền tảng thương mại điện tử **thu nhỏ** theo mô hình lai giữa Amazon (marketplace, nhiều sản phẩm, tìm kiếm mạnh) và Shopify (storefront tối ưu SEO, dễ tuỳ biến theo ngành hàng), có khả năng phục vụ **nhiều ngành hàng khác nhau** trên cùng một core:

- Thức ăn thú cưng (pet food)
- Mỹ phẩm (cosmetics)
- Đồ gia dụng (household)
- FMCG (hàng tiêu dùng nhanh)

Điểm mấu chốt: mỗi ngành hàng có **thuộc tính sản phẩm khác nhau** (pet food cần: trọng lượng, độ tuổi vật nuôi, thành phần; mỹ phẩm cần: dung tích, loại da, hạn sử dụng...). Kiến trúc phải hỗ trợ **attribute động** thay vì hard-code field cho từng ngành.

### 1.2 Phạm vi giai đoạn đầu (MVP → Production-ready)
- Storefront (khách mua hàng) — Next.js, SSR/ISR, tối ưu SEO
- Blog & Gallery — tăng sức mạnh SEO (topical authority, internal linking, Google Image Search)
- Admin/Seller dashboard — quản lý sản phẩm, đơn hàng, kho, bài viết, ảnh gallery
- Backend API — Node.js (NestJS khuyến nghị hoặc Express)
- Database — PostgreSQL
- Thanh toán, vận chuyển, tìm kiếm, đánh giá sản phẩm
- Hạ tầng deploy gần với production thật (không chỉ demo)

### 1.3 Không thuộc phạm vi giai đoạn đầu
- Multi-vendor marketplace hoàn chỉnh (seller tự đăng ký ồ ạt, hoa hồng, payout tự động) — để version sau
- App mobile native
- Đa ngôn ngữ / đa tiền tệ đầy đủ (chỉ chuẩn bị sẵn cấu trúc, chưa triển khai hết)

---

## 2. Kiến trúc tổng thể

```
                         ┌─────────────────────┐
                         │      CDN / Edge      │  (Cloudflare / Vercel Edge)
                         └──────────┬───────────┘
                                    │
                 ┌──────────────────┴──────────────────┐
                 │                                      │
        ┌────────▼────────┐                   ┌─────────▼─────────┐
        │  Storefront      │                   │  Admin Dashboard   │
        │  (Next.js SSR/ISR)│                  │  (Next.js CSR/SPA) │
        └────────┬─────────┘                   └─────────┬──────────┘
                 │                REST API                │
                 └──────────────────┬──────────────────────┘
                                    │
                          ┌─────────▼──────────┐
                          │   Backend API       │
                          │  (Node.js/NestJS)   │
                          │  - Auth service      │
                          │  - Catalog service   │
                          │  - Order service      │
                          │  - Payment service    │
                          │  - Search service     │
                          └─────────┬──────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
┌───────▼────────┐         ┌────────▼────────┐         ┌────────▼────────┐
│  PostgreSQL      │       │  Redis (cache,   │         │  Object Storage   │
│  (nguồn dữ liệu   │       │  session, queue)  │        │  (S3/R2 - ảnh sp) │
│  chính)           │       └──────────────────┘         └───────────────────┘
└───────────────────┘
                                    │
                          ┌─────────▼──────────┐
                          │  Elasticsearch/     │
                          │  Meilisearch         │
                          │  (full-text search)  │
                          └──────────────────────┘
```

### 2.1 Vì sao tách Storefront và Admin thành 2 Next.js app riêng
- Storefront cần SEO tối đa (SSR/ISR, sitemap, schema.org) → tối ưu cho crawler.
- Admin không cần SEO, chỉ cần UX nhanh cho nội bộ → có thể dùng CSR thuần, ít gánh nặng render.
- Tách riêng giúp scale độc lập, deploy độc lập, giảm rủi ro khi thay đổi 1 bên.

### 2.2 REST hay GraphQL — quyết định: REST

Chốt **REST**, không để ngỏ. Lý do:
- Domain tương đối CRUD-oriented (product, order, cart)
- Payment/webhook dễ map bằng REST hơn GraphQL
- Caching HTTP (CDN, browser) dễ tận dụng
- NestJS hỗ trợ REST rất tốt (decorator, validation pipe, Swagger)
- Không phải giải quyết GraphQL authorization complexity (field-level permission)
- Dễ test bằng Postman/Swagger, dễ onboard developer mới

Kiến trúc production cần một quyết định, không phải một lựa chọn còn để mở.

### 2.3 Failure isolation — nguồn dữ liệu chính vs hạ tầng phụ trợ

Tài liệu cần phân biệt rõ 2 lớp, vì mỗi lớp có mức độ chịu lỗi khác nhau:

```
PostgreSQL
    ↓
Source of Truth (bắt buộc luôn đúng, luôn sẵn sàng)

Redis / Meilisearch / Object Storage / BullMQ
    ↓
Derived / Infrastructure (có thể suy ra lại từ PostgreSQL, được phép degrade tạm thời)
```

Nguyên tắc chịu lỗi (failure isolation):
- **Meilisearch chết** → site vẫn phải bán hàng được (fallback: search cơ bản bằng PostgreSQL `ILIKE`/full-text, hoặc báo "tìm kiếm tạm gián đoạn", KHÔNG được sập trang danh mục/sản phẩm)
- **Redis chết** → API core vẫn phải hoạt động ở mức degraded (cache miss → query thẳng PostgreSQL, không phải "Redis down = website down")
- **Object storage/CDN ảnh chết** → product/order data không được mất, chỉ ảnh hiển thị lỗi tạm thời

Không được thiết kế sao cho một thành phần hạ tầng phụ trợ chết kéo theo toàn bộ luồng mua hàng chết theo.

### 2.4 Monorepo hay đa repo?
Khuyến nghị **monorepo** dùng Turborepo hoặc Nx, vì:
- Dùng chung types (TypeScript) giữa frontend và backend (tránh lệch DTO)
- Dùng chung UI component library giữa storefront/admin
- CI/CD dễ quản lý hơn khi dự án còn nhỏ/vừa

```
apps/
  storefront/         (Next.js - khách hàng)
  admin/               (Next.js - quản trị)
  api/                 (NestJS - backend)
packages/
  ui/                  (shared component library)
  types/               (shared TypeScript types/DTO)
  config/              (eslint, tsconfig chung)
```

---

## 3. Tech stack chi tiết

| Layer | Công nghệ | Ghi chú |
|---|---|---|
| Frontend storefront | Next.js 14+ (App Router) | SSR + ISR cho SEO |
| Frontend admin | Next.js (CSR) hoặc Vite + React | Không cần SEO |
| Backend API | Node.js + NestJS (khuyến nghị) hoặc Express | NestJS có sẵn module hoá, DI, dễ maintain khi hệ thống lớn |
| API style | REST (`/api/v1/...`) | Quyết định cuối, xem mục 2.2 — không để REST/GraphQL ngỏ |
| Database | PostgreSQL 15+ | Quan hệ mạnh, phù hợp order/inventory |
| ORM | Prisma | Type-safe, migration tốt, dev nhanh |
| Cache/Queue | Redis + BullMQ | Session, cache sản phẩm, xử lý job (gửi email, đồng bộ kho) |
| Search | Meilisearch (giai đoạn đầu) → Elasticsearch (khi scale) | Meilisearch dễ setup, đủ nhanh cho MVP |
| Object storage | Cloudflare R2 / AWS S3 | Ảnh sản phẩm, tối ưu qua CDN |
| Thanh toán | VNPay, MoMo, Stripe (nếu bán quốc tế) | Tách thành payment adapter, dễ thêm cổng mới |
| Authentication | NextAuth (storefront) + JWT (API) | OAuth (Google) + email/password |
| Deploy | Vercel (frontend) + Railway/Render/VPS (backend, DB) hoặc tất cả trên VPS + Docker | Xem mục 9 |
| CI/CD | GitHub Actions | Test, lint, build, deploy tự động |
| Monitoring | Sentry (error), Vercel Analytics/PostHog (product analytics) | |

---

## 4. Thiết kế Database (đa ngành hàng — điểm quan trọng nhất)

### 4.1 Vấn đề cần giải quyết
Pet food, mỹ phẩm, gia dụng, FMCG có thuộc tính khác nhau hoàn toàn. Nếu tạo bảng `products` với cột cố định cho từng ngành → không scale, phải sửa schema liên tục.

**Giải pháp: Category-defined attributes lưu qua JSONB có kiểm soát** — không phải EAV thuần (không có bảng `attribute_values` tách riêng từng dòng), mà là `category_attributes` đóng vai trò schema định nghĩa, còn giá trị thật lưu trong cột JSONB của `products`/`product_variants`. Cách này vừa linh hoạt, vừa tận dụng được GIN index/filter tốt hơn EAV thuần (EAV thuần phải join nhiều bảng, chậm khi filter nhiều điều kiện).

**Lưu ý quan trọng:** JSONB linh hoạt nhưng PostgreSQL không tự bảo vệ khỏi dữ liệu không nhất quán — ví dụ `{"weight":"3kg"}` và `{"weight":3}` và `{"weigth":"3kg"}` (lỗi chính tả key) đều là JSON hợp lệ nhưng phá vỡ filter. Vì vậy **backend bắt buộc validate theo định nghĩa trong `category_attributes` trước khi persist** — không được coi JSONB là "schema-free".

### 4.2 Schema cốt lõi (rút gọn)

```sql
-- Ngành hàng / category tree
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES categories(id),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,      -- dùng cho SEO url
  description TEXT,
  seo_title VARCHAR(255),
  seo_description VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Định nghĩa attribute theo từng category (VD: pet food -> "trọng lượng", "độ tuổi vật nuôi")
CREATE TABLE category_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id),
  attribute_key VARCHAR(100) NOT NULL,     -- vd: "weight", "skin_type"
  attribute_label VARCHAR(255) NOT NULL,   -- vd: "Trọng lượng"
  attribute_type VARCHAR(50) NOT NULL,     -- text, number, select, boolean
  is_required BOOLEAN DEFAULT false,
  is_filterable BOOLEAN DEFAULT true,      -- có hiện trong bộ lọc không
  is_searchable BOOLEAN DEFAULT false,     -- có đưa vào full-text search không
  is_sortable BOOLEAN DEFAULT false,       -- vd: sort theo weight
  validation_rules JSONB,                  -- vd: {"min":0,"max":100} hoặc {"pattern":"^[0-9]+kg$"}
  options JSONB                            -- nếu type = select: ["1kg","3kg","5kg"]
);
-- Backend validate product.attributes / variant.variant_attributes theo định nghĩa này
-- trước khi insert/update — không tin tưởng JSONB tự do từ client.

-- Sản phẩm gốc (product) — có thể có nhiều biến thể (variant)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id),
  name VARCHAR(500) NOT NULL,
  slug VARCHAR(500) UNIQUE NOT NULL,
  description TEXT,
  brand VARCHAR(255),
  status VARCHAR(20) DEFAULT 'draft',      -- draft, active, archived
  seo_title VARCHAR(255),
  seo_description VARCHAR(500),
  attributes JSONB DEFAULT '{}',           -- {"weight":"3kg","pet_age":"adult"} - filter nhanh bằng GIN index
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_products_attributes ON products USING GIN (attributes);

-- Biến thể sản phẩm (VD: cùng 1 sản phẩm pet food nhưng khác trọng lượng/giá)
CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id),
  sku VARCHAR(100) UNIQUE NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  compare_at_price NUMERIC(12,2),          -- giá gạch ngang (khuyến mãi)
  stock_quantity INT DEFAULT 0,
  variant_attributes JSONB DEFAULT '{}',   -- {"weight":"3kg"}
  variant_key VARCHAR(255) GENERATED ALWAYS AS (
    md5(variant_attributes::text)
  ) STORED,                                -- hash chuẩn hoá để chống trùng variant
  image_url TEXT,
  UNIQUE (product_id, variant_key)
);
-- Lưu ý: variant_attributes phải được serialize theo thứ tự key cố định (vd: sort key
-- trước khi lưu) ở tầng application trước khi insert, nếu không {"weight":"3kg","flavor":"chicken"}
-- và {"flavor":"chicken","weight":"3kg"} sẽ ra 2 hash khác nhau dù cùng nghĩa business.

-- Ảnh sản phẩm (nhiều ảnh/sản phẩm)
CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id),
  url TEXT NOT NULL,
  alt_text VARCHAR(255),                   -- quan trọng cho SEO ảnh
  position INT DEFAULT 0
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  full_name VARCHAR(255),
  role VARCHAR(20) DEFAULT 'customer',     -- customer, admin, staff
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Orders
-- Quan trọng: KHÔNG dùng 1 cột status duy nhất. Order/Payment/Fulfillment là 3 trục
-- độc lập — order có thể "confirmed" trong khi payment "paid" và fulfillment "shipped"
-- cùng lúc. Gộp chung 1 status sẽ nhanh chóng gây "state explosion". Xem state machine ở mục 9.
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code VARCHAR(30) UNIQUE NOT NULL,  -- mã đơn ngắn cho khách tra cứu, vd "ORD-20260821-0001"
  user_id UUID REFERENCES users(id),       -- NULL nếu là guest checkout
  guest_email VARCHAR(255),                -- bắt buộc nếu user_id NULL
  guest_phone VARCHAR(30),
  order_status VARCHAR(30) DEFAULT 'pending',       -- pending, confirmed, cancelled, completed
  payment_status VARCHAR(30) DEFAULT 'unpaid',       -- unpaid, pending, paid, failed, refunded, partially_refunded
  fulfillment_status VARCHAR(30) DEFAULT 'unfulfilled', -- unfulfilled, processing, packed, shipped, delivered, returned
  total_amount BIGINT NOT NULL,            -- lưu ý: INTEGER/BIGINT theo đơn vị nhỏ nhất (VND không có phần thập phân),
                                            -- không dùng FLOAT cho tiền — xem mục 9.1
  shipping_address JSONB,
  payment_method VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Nếu business bắt buộc phải login mới được mua, bỏ guest_email/guest_phone và
-- đặt user_id NOT NULL — nhưng phải quyết định rõ, không để ambiguity.

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  product_id UUID REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  -- Snapshot bắt buộc: order là bản ghi lịch sử bất biến (immutable), KHÔNG bao giờ
  -- render lại bằng product.name/product_variants.price hiện tại — sản phẩm có thể bị
  -- đổi tên/đổi giá/bị xoá sau khi đơn đã tạo.
  product_name_snapshot VARCHAR(500) NOT NULL,
  variant_name_snapshot VARCHAR(255),
  sku_snapshot VARCHAR(100) NOT NULL,
  unit_price BIGINT NOT NULL,
  quantity INT NOT NULL,
  discount_amount BIGINT DEFAULT 0,
  tax_amount BIGINT DEFAULT 0,
  subtotal BIGINT NOT NULL                 -- unit_price * quantity - discount_amount + tax_amount
);

-- Reviews
CREATE TABLE product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id),
  user_id UUID REFERENCES users(id),
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.3 Vì sao dùng JSONB thay vì EAV thuần
- EAV thuần (bảng `attribute_values` riêng, mỗi dòng 1 attribute) → join phức tạp, chậm khi filter nhiều điều kiện.
- JSONB + GIN index cho phép query kiểu `WHERE attributes @> '{"pet_age":"adult"}'` nhanh gần như native column.
- `category_attributes` đóng vai trò **schema động**: khi thêm ngành hàng mới (VD: đồ điện tử), chỉ cần insert thêm attribute definition, không cần migration.

### 4.4 Schema Blog & Gallery (bổ sung cho SEO)

```sql
-- Blog posts
CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) UNIQUE NOT NULL,
  excerpt VARCHAR(500),
  content TEXT NOT NULL,              -- Markdown hoặc rich text (JSON từ editor)
  cover_image_url TEXT,
  author_id UUID REFERENCES users(id),
  category VARCHAR(100),              -- vd: "chăm sóc thú cưng", "làm đẹp"
  status VARCHAR(20) DEFAULT 'draft', -- draft, published
  seo_title VARCHAR(255),
  seo_description VARCHAR(500),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Liên kết blog <-> sản phẩm (internal link + "sản phẩm liên quan" trong bài viết)
CREATE TABLE blog_post_products (
  blog_post_id UUID REFERENCES blog_posts(id),
  product_id UUID REFERENCES products(id),
  PRIMARY KEY (blog_post_id, product_id)
);

-- Gallery (ảnh độc lập — lifestyle, UGC, không gắn cứng vào 1 sản phẩm)
CREATE TABLE gallery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255),
  image_url TEXT NOT NULL,
  alt_text VARCHAR(255) NOT NULL,     -- bắt buộc, không để trống vì SEO ảnh
  category_id UUID REFERENCES categories(id),  -- gắn theo ngành hàng
  source VARCHAR(20) DEFAULT 'admin', -- admin, customer (UGC)
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE gallery_item_products (
  gallery_item_id UUID REFERENCES gallery_items(id),
  product_id UUID REFERENCES products(id),
  PRIMARY KEY (gallery_item_id, product_id)
);
```

### 4.5 Schema Reservation & Payment (chống overselling, chống trùng webhook)

```sql
ALTER TABLE product_variants ADD COLUMN reserved_quantity INT DEFAULT 0;
-- Tồn kho khả dụng = stock_quantity - reserved_quantity

-- Giữ chỗ tồn kho tạm thời khi order ở trạng thái pending_payment
CREATE TABLE order_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  variant_id UUID REFERENCES product_variants(id),
  quantity INT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,     -- vd: created_at + 15 phút
  status VARCHAR(20) DEFAULT 'active'  -- active, confirmed, released
);

-- Log mọi callback thanh toán nhận được, kể cả trùng lặp — chống xử lý 2 lần (idempotency)
CREATE TABLE payment_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  event_id VARCHAR(255),               -- id sự kiện từ gateway nếu có (ổn định hơn transaction_ref)
  gateway VARCHAR(20) NOT NULL,        -- vnpay, momo
  transaction_ref VARCHAR(255) NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  processing_status VARCHAR(30) DEFAULT 'received', -- received, processed, ignored_duplicate, failed
  raw_payload JSONB,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  -- QUAN TRỌNG: composite unique theo (gateway, transaction_ref), KHÔNG unique riêng
  -- transaction_ref — vì "VNPay / ABC123" và "MoMo / ABC123" không phải cùng 1 giao dịch.
  UNIQUE (gateway, transaction_ref)
  -- Nếu gateway cung cấp event_id ổn định, ưu tiên UNIQUE (gateway, event_id) thay thế.
);
```

**Chống race condition khi trừ kho thật** (nhiều order cùng confirm 1 lúc — dùng transaction + row lock, không đọc-rồi-ghi tách rời):
```sql
BEGIN;
SELECT stock_quantity FROM product_variants WHERE id = $1 FOR UPDATE;
UPDATE product_variants SET stock_quantity = stock_quantity - $2 WHERE id = $1;
COMMIT;
```

---

## 5. Cấu trúc thư mục Next.js (Storefront)

```
apps/storefront/
  app/
    (shop)/
      [category-slug]/
        page.tsx              -- trang danh mục, có filter theo attributes
      product/[product-slug]/
        page.tsx              -- trang chi tiết sản phẩm (SSG/ISR)
      cart/
      checkout/
    (content)/
      blog/
        page.tsx               -- danh sách bài viết, phân trang + filter theo category
        [slug]/
          page.tsx              -- chi tiết bài viết (SSG/ISR, revalidate khi publish)
      gallery/
        page.tsx                -- gallery tổng, filter theo ngành hàng
        [category-slug]/
          page.tsx
    api/
      revalidate/route.ts     -- webhook để ISR revalidate khi admin cập nhật SP/bài viết
    sitemap.ts                -- generate sitemap động (tách sitemap-blog riêng nếu nhiều bài)
    robots.ts
  components/
    product/
    filters/
    seo/
      JsonLd.tsx               -- structured data component
  lib/
    api-client.ts
    seo.ts                     -- helper build metadata
```

---

## 6. Tối ưu SEO (tiệm cận production)

Đây là phần bắt buộc phải làm đúng ngay từ đầu vì sửa sau rất tốn công.

### 6.1 Rendering strategy
- Trang sản phẩm & danh mục: **ISR** (Incremental Static Regeneration) — `revalidate: 3600` hoặc revalidate on-demand khi admin update sản phẩm (gọi API `res.revalidate()`).
- Trang chủ, landing theo ngành hàng: SSG + revalidate định kỳ.
- Trang giỏ hàng/checkout: CSR (không cần SEO, cần tương tác nhanh).

### 6.2 Metadata động (Next.js App Router)
```tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const product = await getProduct(params.slug);
  return {
    title: product.seoTitle ?? `${product.name} | TênShop`,
    description: product.seoDescription ?? product.description.slice(0, 155),
    openGraph: {
      images: [product.images[0]?.url],
      type: 'website',
    },
    alternates: { canonical: `https://domain.com/product/${product.slug}` },
  };
}
```

### 6.3 Structured data (Schema.org)
Bắt buộc cho trang sản phẩm — giúp Google hiện rich snippet (giá, rating, tồn kho):
```json
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "...",
  "image": ["..."],
  "brand": {"@type":"Brand","name":"..."},
  "offers": {
    "@type": "Offer",
    "priceCurrency": "VND",
    "price": "150000",
    "availability": "https://schema.org/InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.5",
    "reviewCount": "23"
  }
}
```

### 6.4 Checklist SEO kỹ thuật
- [ ] URL slug thân thiện: `/pet-food/hat-cho-cho-adult-3kg` thay vì `/product?id=123`
- [ ] `sitemap.xml` sinh động, tách theo category (tránh 1 sitemap quá lớn > 50.000 URL)
- [ ] `robots.txt` chặn crawl trang `/cart`, `/checkout`, `/admin`
- [ ] Ảnh: dùng `next/image`, có `alt`, nén WebP/AVIF, lazy load
- [ ] Core Web Vitals: LCP < 2.5s, CLS < 0.1, INP < 200ms — đo bằng Lighthouse/PageSpeed Insights
- [ ] Canonical URL cho mọi trang (tránh duplicate content khi có filter/query params)
- [ ] Breadcrumb + BreadcrumbList schema
- [ ] Hreflang nếu sau này hỗ trợ đa ngôn ngữ
- [ ] 404/410 xử lý đúng cho sản phẩm ngừng bán (tránh soft-404)
- [ ] Internal linking: sản phẩm liên quan, "khách cũng mua"

### 6.5 SEO riêng cho Blog & Gallery

**Blog:**
- Structured data `Article`/`BlogPosting` (có `datePublished`, `dateModified`, `author`)
- Sitemap riêng `sitemap-blog.xml` (tách khỏi sitemap sản phẩm, dễ quản lý khi blog nhiều bài)
- Mỗi bài bắt buộc có ít nhất 1-2 internal link về sản phẩm/danh mục liên quan (qua bảng `blog_post_products`) — đây là cơ chế chính giúp blog "bơm" link equity về trang bán hàng
- Heading structure chuẩn (H1 duy nhất, H2/H3 phân đoạn rõ)
- Target từ khóa long-tail (VD: "cách chọn hạt cho chó theo độ tuổi") thay vì cạnh tranh trực tiếp từ khóa sản phẩm

**Gallery:**
- Ảnh nén WebP/AVIF qua `next/image`, `alt_text` bắt buộc, mô tả rõ ràng (không nhồi keyword)
- Structured data `ImageObject` cho ảnh quan trọng
- Tên file ảnh mô tả nội dung (`hat-cho-cho-adult-3kg.webp` thay vì `IMG_2381.jpg`) — tăng traffic từ Google Image Search
- Gallery UGC (ảnh khách hàng thực tế) tăng trust signal, giảm bounce rate

### 6.6 Trạng thái sản phẩm và ảnh hưởng SEO

`products.status` không nên chỉ có `draft/active/archived` — cần phân biệt rõ hơn để xử lý đúng khi hết hàng, vì mỗi trạng thái ảnh hưởng SEO khác nhau:

| Status | Có index không | HTTP status | Hiển thị |
|---|---|---|---|
| `active` | Có | 200 | Bán bình thường |
| `out_of_stock` | **Vẫn có** (giữ link equity đã tích luỹ) | 200 | Hiện "hết hàng", gợi ý sản phẩm thay thế |
| `discontinued` | Tuỳ policy | 200 hoặc redirect | Ngừng bán vĩnh viễn nhưng vẫn có traffic |
| `archived` | Không | 410 (Gone) hoặc redirect 301 về danh mục | Xoá khỏi index |

**Nguyên tắc bắt buộc:** không bao giờ code kiểu `stock = 0 → xoá product record`. Hết hàng tạm thời (`out_of_stock`) và ngừng bán vĩnh viễn (`archived`) là 2 việc khác nhau hoàn toàn — xoá nhầm sẽ mất toàn bộ SEO equity đã tích luỹ cho URL đó.

---

## 7. Search & Filter (hỗ trợ đa ngành)

- Đồng bộ dữ liệu từ PostgreSQL → Meilisearch qua job nền (BullMQ) mỗi khi sản phẩm thay đổi.
- Index Meilisearch cấu hình `filterableAttributes` động theo `category_attributes` — vì mỗi ngành có bộ lọc riêng (pet food lọc theo "độ tuổi vật nuôi", mỹ phẩm lọc theo "loại da").
- Facet count (số lượng sản phẩm theo từng giá trị filter) lấy trực tiếp từ Meilisearch, không query PostgreSQL trực tiếp để tránh chậm.

**Eventual consistency — cần ghi rõ trong tài liệu vận hành:** PostgreSQL là source of truth, Meilisearch chỉ là **search projection** cập nhật bất đồng bộ.

```
Admin sửa product → PostgreSQL update ngay lập tức → job đồng bộ (BullMQ) → Meilisearch update sau ~vài giây
```

Admin không nên nhầm lẫn "đã lưu vào database" với "đã cập nhật trên kết quả tìm kiếm" — UI admin nên hiển thị rõ trạng thái đồng bộ (vd: "Đang cập nhật chỉ mục tìm kiếm...") thay vì giả định đồng bộ tức thời.

---

## 8. Luồng nghiệp vụ chính (business flow)

1. **Khách duyệt sản phẩm** → Next.js SSR fetch từ API → cache qua Redis/ISR
2. **Thêm vào giỏ** → lưu ở client (Zustand/localStorage) hoặc server-side cart nếu đã login
3. **Checkout** → tạo `order` (status: `pending_payment`) → **tạm giữ tồn kho** (xem mục 8.1) → gọi payment gateway (VNPay/MoMo) → nhận callback → update `payment_status`
4. **Xác nhận đơn** → trigger job: trừ kho thật (`stock_quantity`), gửi email xác nhận, revalidate trang sản phẩm nếu hết hàng
5. **Vận chuyển** → cập nhật trạng thái đơn hàng, gửi tracking (tích hợp GHTK/GHN/Viettel Post nếu cần)
6. **Đánh giá** → sau khi đơn hoàn thành, cho phép khách review sản phẩm

### 8.1 Cơ chế Reservation & Payment (chống overselling)

**Vấn đề cần giải quyết:**
- Khách bấm "Mua ngay" nhưng chưa thanh toán xong → có nên trừ kho ngay không?
- Khách bỏ giỏ hàng giữa chừng (không thanh toán) → kho có bị "khóa" mãi mãi không?
- Callback thanh toán bị gọi 2 lần (network retry) → có bị trừ kho 2 lần không?

**Cơ chế: Reservation có thời hạn (soft-lock)**

1. Khách tạo order → `order_status = pending`, hệ thống **tạm giữ tồn kho** (không trừ thật, chỉ tăng `reserved_quantity`) với thời hạn ví dụ 15 phút, ghi vào `order_reservations`
2. Redirect sang cổng thanh toán (VNPay/MoMo)
3. Có 2 đường xác nhận song song (bắt buộc cả 2, không chỉ dựa vào 1):
   - **Callback/IPN** từ cổng thanh toán gọi về server → nguồn xác nhận thật, phải verify checksum/signature trước khi tin
   - **Return URL** khi khách quay lại site → chỉ hiển thị UI, KHÔNG dùng để xác nhận thanh toán thật (khách có thể tắt trình duyệt giữa chừng, hoặc giả mạo URL)
4. Khi nhận callback hợp lệ → trừ kho thật (transaction + row lock), `payment_status = paid`, `order_status = confirmed`, reservation chuyển `confirmed`
5. Nếu hết 15 phút mà chưa thanh toán → job nền (BullMQ) tự hủy reservation (`released`), trả tồn kho về pool chung, `order_status = cancelled`

**Transaction boundary — ranh giới bắt buộc rõ ràng.** Bước tạo reservation phải nằm gọn trong 1 transaction DB, và **không bao giờ** gọi cổng thanh toán bên trong transaction đó:

```
Đúng:
BEGIN
  1. SELECT variant FOR UPDATE
  2. Validate: available >= requested (stock_quantity - reserved_quantity)
  3. INSERT order_reservations
  4. UPDATE product_variants SET reserved_quantity = reserved_quantity + qty
  5. INSERT order + order_items
COMMIT
→ (sau khi commit xong) mới gọi API VNPay/MoMo để lấy payment URL

Sai (anti-pattern):
BEGIN DB transaction → call VNPay (network I/O) → wait → COMMIT
-- giữ transaction mở trong lúc chờ network là nguyên nhân gây lock timeout,
-- deadlock, và block toàn bộ request khác đang cần lock variant đó.
```

**Atomic state transition — chống race condition giữa hết hạn và thanh toán.** Reservation hết hạn (job nền) và callback thanh toán đến có thể xảy ra gần như đồng thời. Không được đọc-rồi-ghi tách rời:

```sql
-- SAI: đọc trạng thái rồi mới update, có thể bị race condition
-- if (reservation.status == 'active') { update to 'confirmed' }

-- ĐÚNG: update có điều kiện ngay trong câu lệnh, kiểm tra affectedRows
UPDATE order_reservations
SET status = 'confirmed'
WHERE id = $1 AND status = 'active';
-- Ở tầng application: nếu affectedRows === 0 → có transition khác đã thắng (vd job
-- expire chạy trước) → xử lý theo nhánh tương ứng, KHÔNG tiếp tục trừ kho.
```

Đảm bảo tại một thời điểm, chỉ một trong hai transition (`active → confirmed` hoặc `active → released`) thành công — PostgreSQL đảm bảo tính atomic cho câu `UPDATE ... WHERE` này.

### 8.2 State machine chính thức của Order

| Trạng thái hiện tại | Sự kiện | Trạng thái tiếp theo |
|---|---|---|
| `pending` (order) | `payment_success` | `confirmed` |
| `pending` (order) | `payment_timeout` | `cancelled` |
| `confirmed` (order) | `start_fulfillment` | fulfillment → `processing` |
| `processing` (fulfillment) | `shipment_created` | fulfillment → `shipped` |
| `shipped` (fulfillment) | `delivery_confirmed` | fulfillment → `delivered`, order → `completed` |
| `confirmed` (order) | `cancel` (trước khi giao) | `cancelled` |

Mọi transition phải đi qua 1 hàm/service duy nhất có whitelist các bước hợp lệ (vd: `OrderStateMachine.transition(order, event)`). **Không cho phép** code ở bất kỳ đâu tự ý gán trực tiếp `order.status = "delivered"` mà bỏ qua whitelist — đây là nguồn lỗi nghiệp vụ phổ biến khi nhiều người/nhiều chỗ trong code cùng sửa order.

**Idempotency cho webhook:** dùng cặp `(gateway, transaction_ref)` làm `UNIQUE` trong `payment_webhook_logs` (xem mục 4.5) — nếu VNPay/MoMo gọi callback 2 lần cùng mã, lần thứ 2 bị chặn ở tầng DB, tránh xử lý trùng (trừ kho 2 lần, gửi email 2 lần...).

**Lưu ý khi tích hợp VNPay/MoMo tại VN:**
- Luôn verify checksum/signature trong callback trước khi tin nội dung — lỗ hổng bảo mật hay gặp nhất nếu bỏ qua bước này
- Sandbox đôi khi không gọi callback về được `localhost` khi dev → dùng ngrok/webhook.site để test, hoặc deploy staging có domain thật sớm
- Log toàn bộ raw payload callback (bảng `payment_webhook_logs`) để debug khi có tranh chấp đơn hàng

### 8.3 Payment reconciliation — không phụ thuộc 100% vào webhook

Webhook có thể timeout hoặc không bao giờ đến (lỗi mạng, gateway retry giới hạn số lần). Nếu chỉ dựa vào webhook, hệ thống có thể rơi vào trạng thái:

```
VNPay: đã thanh toán thành công (PAID)
Database: vẫn pending_payment (vì webhook chưa từng đến)
```

Cần thêm 1 job chạy định kỳ (vd mỗi 5-10 phút, chỉ quét các order `pending` quá X phút):

```
Payment Reconciliation Worker
  → query trạng thái giao dịch trực tiếp từ API gateway (VNPay/MoMo có endpoint tra cứu)
  → so sánh với payment_status trong DB
  → nếu lệch: gọi lại đúng logic xác nhận thanh toán (idempotent) để tự sửa
```

Đây không phải P0 bắt buộc có ở tuần đầu, nhưng nên có trong roadmap trước go-live — vì đây là nguyên nhân phổ biến nhất gây ra "khách đã trả tiền nhưng đơn không lên" trong thực tế.

---

## 9. Chuẩn hoá dữ liệu, RBAC & Bảo mật API (bắt buộc trước go-live)

### 9.1 Tiền tệ (money handling)
- **Không bao giờ dùng kiểu số thực (FLOAT/DOUBLE) cho tiền** — sai số làm tròn tích luỹ sẽ gây lệch số liệu kế toán.
- Với VND (không có phần thập phân): lưu `BIGINT`, đơn vị là đồng nguyên (150000, không phải 150000.00).
- Nếu sau này bán quốc tế (USD...): lưu số nguyên theo đơn vị nhỏ nhất của đồng tiền đó (cent), kèm cột `currency`.
- Cần quy định rõ ràng ở tầng business logic: quy tắc làm tròn (rounding), cách tính thuế, cách áp discount, cách tính phí vận chuyển — để tránh mỗi chỗ trong code tính một kiểu.

### 9.2 RBAC theo permission, không chỉ theo role

`users.role = 'admin'` là quá thô cho production — một admin marketing không nên có quyền hoàn tiền hay chỉnh tồn kho. Cần mô hình permission chi tiết hơn:

```sql
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) UNIQUE NOT NULL   -- vd: "product.write", "order.refund", "inventory.adjust"
);

CREATE TABLE role_permissions (
  role VARCHAR(20) NOT NULL,
  permission_code VARCHAR(100) REFERENCES permissions(code),
  PRIMARY KEY (role, permission_code)
);
```

Ví dụ các permission tối thiểu cho MVP: `product.read`, `product.write`, `inventory.adjust`, `order.read`, `order.refund`, `payment.read`, `user.manage`, `blog.write`, `gallery.write`. Middleware kiểm tra permission thay vì chỉ kiểm tra `role === 'admin'`.

### 9.3 File upload security

Vì kiến trúc dùng object storage (R2), upload ảnh phải qua flow có kiểm soát, **không cho client upload trực tiếp bằng URL public tuỳ ý**:

```
Admin → API request "signed upload URL" (kèm điều kiện: MIME, max size)
      → R2 nhận file trực tiếp qua signed URL (không qua backend, đỡ tải)
      → Admin gọi API xác nhận metadata (url, alt_text, kích thước) sau khi upload xong
      → Backend lưu record vào product_images/gallery_items
```

Checklist bắt buộc:
- [ ] Giới hạn MIME type cho phép (chỉ image/jpeg, image/png, image/webp...)
- [ ] Giới hạn kích thước file tối đa
- [ ] Giới hạn kích thước ảnh (width/height) hợp lý
- [ ] Sanitize filename (không giữ nguyên tên file gốc từ client)
- [ ] Strip EXIF metadata trước khi lưu (tránh lộ vị trí GPS ảnh nếu có)
- [ ] Signed URL có thời hạn ngắn, không public write vĩnh viễn

### 9.4 Chuẩn API response & idempotency

**Response format thống nhất** (không trả raw exception của NestJS ra client):
```json
// Thành công
{ "data": { }, "meta": { }, "error": null }

// Lỗi
{ "data": null, "meta": null, "error": { "code": "INSUFFICIENT_STOCK", "message": "...", "details": {} } }
```

**Idempotency-Key** cho các endpoint có side-effect quan trọng: `POST /orders`, `POST /payments`, `POST /refunds`, `POST /checkout`. Client gửi header `Idempotency-Key: <uuid>`; nếu request với cùng key được gửi lại (retry do mất mạng, double-tap trên mobile), server trả về đúng kết quả lần đầu thay vì tạo bản ghi mới. Lưu key này kèm response đã trả, có thời hạn hết hạn (vd 24h).

### 9.5 Health check — phân biệt liveness và readiness

```
GET /health/live    -- process còn sống không? (không kiểm tra dependency ngoài)
GET /health/ready    -- đã sẵn sàng nhận traffic chưa? (kiểm tra Postgres, Redis...)
```

Không để Meilisearch/Redis chết làm `/live` fail — vì `/live` fail sẽ khiến orchestrator (Docker/K8s/Railway) restart cả service một cách không cần thiết, trong khi service backend core vẫn hoạt động bình thường ở chế độ degraded (xem failure isolation, mục 2.3).

**Security checklist tổng quát trước go-live** (ngoài các mục trên):
- [ ] Rate limiting theo IP/user cho API công khai
- [ ] Input validation ở mọi endpoint (class-validator của NestJS)
- [ ] Chống SQL injection (Prisma tham số hoá query sẵn, tránh raw query nối chuỗi)
- [ ] Chống XSS ở phần render nội dung blog (sanitize HTML từ rich text editor)
- [ ] CSRF strategy cho form quan trọng (nếu dùng cookie-based session)
- [ ] CORS policy chỉ cho phép domain storefront/admin hợp lệ
- [ ] Security headers (CSP, X-Frame-Options, HSTS...)
- [ ] Secret management (không hard-code API key, dùng biến môi trường + secret manager)

---

## 10. Analytics & Marketing Layer (Event Tracking)

### 10.1 Vì sao cần thiết kế ngay từ MVP
Nếu không track hành vi người dùng ngay từ đầu, sau này sẽ mất toàn bộ dữ liệu lịch sử để phân tích funnel, tối ưu conversion rate, hay cá nhân hoá gợi ý sản phẩm theo ngành hàng (VD: khách xem pet food thường quay lại mua theo chu kỳ, khác hành vi mua mỹ phẩm). Việc thêm tracking sau này không lấy lại được dữ liệu đã mất.

### 10.2 Chiến lược đề xuất: Hybrid (PostHog + bảng event nội bộ)

Không nên chọn 1 trong 2 tuyệt đối — mỗi bên phục vụ mục đích khác nhau:

| | PostHog | Bảng `events` nội bộ (PostgreSQL) |
|---|---|---|
| Mục đích | Product analytics, funnel, session replay, A/B test, dashboard dựng sẵn | Dữ liệu thô, gắn chặt với business logic (order, product, user) để BI/ML sau này |
| Ưu điểm | Setup nhanh, có UI phân tích sẵn, không phải tự xây dashboard | Toàn quyền dữ liệu, join trực tiếp với `orders`/`products`, không phụ thuộc bên thứ 3 |
| Nhược điểm | Dữ liệu nằm ở bên thứ 3 (dù self-host được), khó join sâu với dữ liệu nghiệp vụ | Phải tự xây dashboard/BI nếu cần trực quan hoá |

→ **PostHog**: dùng để phân tích UX/conversion nhanh (funnel, heatmap, session replay) — việc marketing/product cần hằng ngày.
→ **Bảng `events` nội bộ**: dùng làm nguồn dữ liệu "sự thật" (source of truth) để sau này xây recommendation engine, phân khúc khách hàng theo ngành hàng, hoặc export cho công cụ BI khác (Metabase, Superset) mà không phụ thuộc PostHog.

Cả 2 cùng nhận event từ 1 lớp trung gian (xem 9.4) — tránh phải gọi tracking 2 lần rải rác trong code.

### 10.3 Thiết kế bảng `events`

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name VARCHAR(50) NOT NULL,        -- view_item, add_to_cart, remove_from_cart,
                                            -- begin_checkout, abandon_cart, purchase,
                                            -- view_category, search, view_blog_post
  session_id VARCHAR(100) NOT NULL,        -- gắn theo phiên, dùng cả khi chưa login
  user_id UUID REFERENCES users(id),       -- NULL nếu khách chưa đăng nhập
  product_id UUID REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  category_id UUID REFERENCES categories(id),
  order_id UUID REFERENCES orders(id),     -- gắn khi event = purchase/abandon_cart
  metadata JSONB DEFAULT '{}',             -- dữ liệu phụ: giá tại thời điểm xem, vị trí trong danh sách,
                                            -- nguồn traffic (utm_source, utm_campaign), thiết bị...
  occurred_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_events_name_time ON events (event_name, occurred_at);
CREATE INDEX idx_events_session ON events (session_id);
CREATE INDEX idx_events_user ON events (user_id);
CREATE INDEX idx_events_product ON events (product_id);
```

**Ghi chú thiết kế:**
- Dùng `event_name` dạng chuỗi tự do (không ENUM cứng) để dễ thêm event mới mà không cần migration — nhưng nên có 1 danh sách chuẩn quản lý ở tầng code (xem 9.5) để tránh loạn tên (`add_to_cart` vs `AddToCart` vs `cart_add`).
- `metadata` JSONB chứa các field không cố định theo từng loại event (VD: `abandon_cart` cần `cart_value`, `items_count`; `search` cần `query`, `results_count`).
- Bảng này sẽ lớn rất nhanh (mỗi lượt xem trang = 1 dòng) → cần cân nhắc partition theo tháng (`occurred_at`) khi traffic tăng, hoặc archive dữ liệu cũ (> 6-12 tháng) sang cold storage.

### 10.4 Lớp trung gian tracking (tránh gọi rải rác trong code)

```
lib/analytics/
  track.ts        -- hàm duy nhất gọi từ UI: track('add_to_cart', { productId, price, ... })
  providers/
    posthog.ts     -- gửi sang PostHog qua posthog-js (client) / posthog-node (server)
    internal.ts     -- ghi vào bảng events qua API nội bộ (POST /api/events)
```

```ts
// lib/analytics/track.ts
export function track(eventName: string, payload: Record<string, any>) {
  posthogTrack(eventName, payload);      // real-time, cho dashboard PostHog
  internalTrack(eventName, payload);      // async, ghi vào bảng events (qua queue, không block UI)
}
```

Việc gửi vào bảng `events` nội bộ nên qua **BullMQ queue** (không insert trực tiếp đồng bộ) để không làm chậm trải nghiệm người dùng khi traffic cao.

### 10.5 Danh sách event chuẩn cho MVP

| Event | Khi nào bắn | Metadata quan trọng |
|---|---|---|
| `view_item` | Khách mở trang chi tiết sản phẩm | `price`, `category_id`, nguồn (`from_search`, `from_category`) |
| `view_category` | Khách mở trang danh mục | `filters_applied` |
| `search` | Khách tìm kiếm | `query`, `results_count` |
| `add_to_cart` | Thêm sản phẩm vào giỏ | `quantity`, `price` |
| `remove_from_cart` | Bỏ sản phẩm khỏi giỏ | `quantity` |
| `begin_checkout` | Bắt đầu điền thông tin checkout | `cart_value`, `items_count` |
| `abandon_cart` | Có `order` ở `pending_payment` quá hạn reservation (job nền bắn, xem mục 8.1) | `cart_value`, `items_count`, `last_step` |
| `purchase` | `order` chuyển `paid` (bắn từ webhook handler, không phải client) | `order_id`, `total_amount` |
| `view_blog_post` | Khách mở bài blog | `blog_post_id` |

**Lưu ý về `abandon_cart` và `purchase`:** 2 event này nên bắn từ **server** (không phải client-side JS), vì gắn trực tiếp với state machine ở mục 8.1 — job hủy reservation hết hạn sẽ đồng thời bắn `abandon_cart`, webhook xác nhận thanh toán sẽ đồng thời bắn `purchase`. Nếu chỉ bắn từ client, dữ liệu sẽ thiếu khi khách tắt trình duyệt hoặc chặn tracking script (ad blocker).

### 10.6 Quyền riêng tư & tuân thủ
- Không lưu thông tin định danh nhạy cảm (email, số điện thoại) trực tiếp trong `metadata` — chỉ dùng `user_id` để join khi cần.
- Cần banner xin đồng ý cookie/tracking (Nghị định về bảo vệ dữ liệu cá nhân tại VN, và chuẩn bị sẵn nếu sau này bán quốc tế thì liên quan GDPR).
- PostHog nên bật chế độ ẩn danh (anonymize IP) nếu cần tuân thủ nghiêm hơn.

---

## 11. Hạ tầng & Deploy (gần production thật)

| Thành phần | Gợi ý hosting | Lý do |
|---|---|---|
| Storefront (Next.js) | Vercel | Tối ưu ISR/Edge sẵn, tích hợp CDN toàn cầu |
| Admin (Next.js) | Vercel hoặc VPS riêng | Không cần edge network |
| Backend API (NestJS) | Railway/Render (giai đoạn đầu) → VPS/Docker khi scale | Dễ setup, có free/cheap tier |
| PostgreSQL | Railway/Neon/Supabase (đầu) → managed DB (RDS) khi scale | Có backup tự động |
| Redis | Upstash (serverless Redis) | Phù hợp Vercel/serverless |
| Object storage | Cloudflare R2 | Không tính phí egress như S3 |
| Domain + SSL | Cloudflare | DNS + CDN + SSL free |

### 11.1 CI/CD — pipeline đầy đủ

Không nên deploy thẳng khi push `main`. Pipeline production nên có đủ bước sau (có thể rút gọn ở MVP nhưng phải có tối thiểu lint/test/build):

```
Pull Request → lint → typecheck → unit tests → integration tests → build
             → security scan (vd: npm audit, Snyk)
             → deploy staging → smoke test
             → deploy production
```

### 11.2 Database migration — chính sách forward-compatible

Khi deploy backend version mới, không được `DROP COLUMN` ngay lập tức nếu vẫn còn traffic dùng schema cũ (vd đang rolling deploy nhiều instance). Áp dụng chiến lược **expand → migrate → contract**:

```
Phase 1: thêm cột mới (không xoá cột cũ)
Phase 2: deploy code dùng cột mới, vẫn tương thích ngược
Phase 3: backfill dữ liệu từ cột cũ sang cột mới
Phase 4: sau khi chắc chắn ổn định, mới xoá cột cũ
```

### 11.3 Disaster Recovery (DR) — backup & khôi phục

Đây là phần hay bị bỏ qua ở giai đoạn MVP nhưng bắt buộc phải có trước khi có traffic/đơn hàng thật:

- [ ] Backup PostgreSQL đầy đủ hằng ngày (full backup)
- [ ] Bật continuous WAL / point-in-time recovery (PITR) nếu hosting hỗ trợ (Railway/Neon/Supabase đều có)
- [ ] Xác định rõ **RPO** (Recovery Point Objective — chấp nhận mất tối đa bao nhiêu dữ liệu, vd 15 phút) và **RTO** (Recovery Time Objective — khôi phục xong trong bao lâu, vd 1 giờ)
- [ ] **Test restore định kỳ** — backup chưa từng được restore thử thì không thể coi là backup đáng tin

### 11.4 Checklist trước khi go-live
- [ ] Migration DB chạy qua Prisma Migrate, không sửa DB thủ công trên production
- [ ] Biến môi trường tách biệt dev/staging/production
- [ ] Rate limiting cho API (chống spam/bot)
- [ ] HTTPS bắt buộc toàn site
- [ ] Backup DB tự động hằng ngày + đã test restore ít nhất 1 lần
- [ ] Logging tập trung (Sentry cho lỗi, Logtail/Better Stack cho log)
- [ ] Có trang staging riêng để test trước khi lên production
- [ ] Health check `/health/live` và `/health/ready` đã tách riêng (xem mục 9.5)

---

## 12. Lộ trình triển khai đề xuất

| Giai đoạn | Nội dung | Thời gian ước tính |
|---|---|---|
| 1. Nền tảng | Setup monorepo, DB schema, auth, CRUD sản phẩm cơ bản | 2 tuần |
| 2. Storefront cơ bản | Trang danh mục, chi tiết sản phẩm, giỏ hàng | 2 tuần |
| 3. SEO & performance | Metadata, structured data, ISR, sitemap, tối ưu ảnh | 1 tuần |
| 3b. Blog & Gallery | Schema, API, trang blog (list/detail) + rich text editor, trang gallery + quản lý ảnh | 1.5 tuần |
| 4. Checkout & thanh toán | Tích hợp VNPay/MoMo, luồng đơn hàng, reservation tồn kho, atomic state transition, idempotency webhook | 2.5 tuần |
| 4b. Payment reconciliation & order state machine | Tách order/payment/fulfillment status, whitelist transition, reconciliation worker | 1 tuần |
| 5. Search & filter đa ngành | Meilisearch, filter động theo category_attributes | 1 tuần |
| 5b. Analytics & event tracking | Bảng `events`, lớp trung gian tracking, tích hợp PostHog | 1 tuần |
| 6. Admin dashboard | Quản lý sản phẩm, đơn hàng, kho, bài viết, gallery | 1.5 tuần |
| 6b. RBAC & bảo mật | Permission model, file upload security, chuẩn hoá API response, idempotency-key | 1 tuần |
| 7. Hoàn thiện & go-live | Testing (bao gồm concurrency test), monitoring, health check, DR/backup, deploy production | 1.5 tuần |

**Tổng ước tính MVP → production-ready: ~15.5 tuần** (làm part-time có thể gấp 3-4 lần thời gian, xem thảo luận riêng về mốc thời gian solo). Con số này đã bao gồm các hạng mục P0 (bắt buộc đúng ngay từ đầu: order state machine, reservation atomicity, money handling) và P1 (cần cho production thật: reconciliation, RBAC, security). Các hạng mục P2 ở mục 14 **chưa tính vào con số này** — đó là điểm mở rộng để dành chỗ trong kiến trúc, không phải việc phải làm ở MVP.

---

## 13. Gợi ý bước tiếp theo
1. Setup monorepo (Turborepo) + Prisma schema như mục 4 — bao gồm luôn schema order/payment/reservation đã tách đúng từ đầu (mục 4, 8, 9), vì sửa lại state machine sau khi đã có dữ liệu thật rất tốn công.
2. Seed thử dữ liệu cho **2 ngành hàng khác nhau** (pet food + mỹ phẩm) để kiểm chứng thiết kế attribute động ngay từ đầu — tránh việc sau này phải refactor lại khi thêm ngành thứ 3.
3. Dựng trang chi tiết sản phẩm với metadata/structured data trước, vì đây là phần khó nhất về SEO và nên làm chuẩn ngay từ đầu.
4. Cài lớp `track()` (mục 10.4) ngay từ khi dựng trang sản phẩm đầu tiên — gắn tracking sau cùng dễ bị quên bắn event ở nhiều nơi trong code.
5. Viết test concurrency cho reservation (mục 15.7) sớm — đây là loại lỗi chỉ lộ ra khi có traffic thật, rất khó phát hiện bằng test tay.

**Lưu ý về overengineering:** kiến trúc hiện tại (Next.js, NestJS, Prisma, PostgreSQL, Redis, BullMQ, Meilisearch, R2, VNPay/MoMo, Sentry, PostHog, Docker, GitHub Actions, Cloudflare, Turborepo) có khá nhiều thành phần chuyển động. Kiến trúc *có thể* production-grade ngay từ tài liệu, nhưng **implementation nên làm tuần tự (incremental)**, không setup và vận hành tất cả cùng lúc — nhất là khi vừa học vừa xây một mình. Ưu tiên: core domain (product/order/payment) đúng trước, hạ tầng phụ trợ (search, analytics, monitoring nâng cao) thêm dần sau.

---

## 14. Điểm mở rộng tương lai (P2 — chưa implement ở MVP)

Các mục dưới đây **không nằm trong roadmap MVP** (mục 12) — mục đích là để kiến trúc "chừa chỗ" cho việc mở rộng sau này mà không phải thiết kế lại từ đầu, không phải việc cần code ngay.

### 14.1 Outbox Pattern
Vấn đề: DB transaction commit thành công (`order = paid`) nhưng job gửi email/search-index/notification (BullMQ enqueue) lại thất bại — dữ liệu và tác vụ phụ trợ bị lệch nhau.

```
Transaction:
  ├── update order
  ├── update payment
  └── insert outbox_event   -- ghi trong CÙNG transaction với 2 dòng trên
COMMIT
      ↓
Outbox worker (poll bảng outbox_event) → enqueue vào BullMQ
```
Chưa cần triển khai ở MVP, nhưng nên biết trước để không thiết kế write-path theo cách chặn việc thêm outbox sau này.

### 14.2 Shipping domain đầy đủ
MVP hiện chỉ có `shipping_address` (JSONB) trên order. Khi cần hỗ trợ giao nhiều kiện (split shipment) hoặc nhiều đơn vị vận chuyển, cần domain riêng:
```sql
-- Đặt chỗ cho tương lai, chưa tạo ở MVP
shipping_methods, shipments, shipment_items, tracking_events
```
Một order có thể tách thành nhiều `shipment` (mỗi shipment chứa 1 phần `order_items`).

### 14.3 Promotion/Coupon
Domain khá lớn nếu làm đầy đủ: `coupons`, `promotions`, `promotion_rules`, `promotion_usage` — hỗ trợ giảm giá %, giảm tối thiểu đơn hàng, giới hạn theo category, giới hạn đơn đầu tiên, ngày hết hạn... Không cần implement ở MVP, chỉ cần không thiết kế `order_items`/`orders` theo cách chặn việc cộng thêm `discount_amount` sau này (thực tế đã có sẵn cột này ở mục 4.2).

### 14.4 Audit log
Ecommerce production cần trả lời được: ai đã sửa gì, khi nào, giá trị trước/sau — đặc biệt với `price`, `stock`, `refund`, `order status`, `user role`. Schema gợi ý cho tương lai:
```sql
-- audit_logs: actor_id, action, entity_type, entity_id, before, after, occurred_at
```
Ưu tiên bật cho các entity nhạy cảm nhất trước (giá, tồn kho, hoàn tiền) khi có nhu cầu thực tế, không cần audit toàn bộ hệ thống ngay từ đầu.

### 14.5 Observability 3 lớp & Correlation ID
Khi hệ thống lớn hơn, giám sát nên tách 3 lớp: **Logs** (structured JSON, có `request_id`), **Metrics** (`checkout_success_rate`, `payment_failure_rate`, `reservation_expired`, `queue_depth`...), **Traces** (request đi qua NestJS → Postgres → Redis → gateway thanh toán).

Correlation ID giúp nối các sự kiện của cùng 1 giao dịch (`request_id`, `order_id`, `payment_id`, `reservation_id`, `webhook_id`) — khi VNPay báo lỗi, chỉ cần search theo `order_id` là ra toàn bộ log liên quan. Nên cân nhắc thêm khi hệ thống có traffic thật, MVP có Sentry + log cơ bản là đủ để bắt đầu.

### 14.6 BullMQ — retry/backoff/dead-letter
Khi các queue (reservation expiry, email, search sync, reconciliation) đã chạy ổn định ở MVP, nên bổ sung chính sách retry rõ ràng thay vì để mặc định:
```
attempt 1 → fail → chờ 5s → attempt 2 → fail → chờ 30s → attempt 3 → fail → chuyển Dead-Letter Queue
```
Không nên để job retry vô hạn — cần giới hạn số lần và có nơi lưu các job thất bại để xử lý thủ công.

### 14.7 Admin optimistic locking
Khi có nhiều admin cùng sửa 1 sản phẩm (vd Admin A sửa giá, Admin B sửa mô tả cùng lúc), nếu không kiểm soát, người save sau sẽ ghi đè thay đổi của người save trước. Giải pháp khi cần: thêm cột `version` (hoặc dùng `updated_at`), kiểm tra trong câu update:
```sql
UPDATE products SET ... WHERE id = $1 AND version = $2;
-- affectedRows = 0 → báo "dữ liệu đã bị người khác thay đổi, tải lại trang"
```
Chưa cấp thiết khi chỉ có 1-2 admin ở MVP, nhưng nên biết trước khi đội ngũ vận hành lớn hơn.

### 14.8 Testing production-grade (khi có traffic thật)
Ngoài unit/integration test thông thường, các test có giá trị nhất cho ecommerce là test concurrency — nên viết trước khi launch traffic thật:
- **Inventory concurrency**: 100 request đồng thời mua 1 sản phẩm còn 10 tồn kho → kỳ vọng số lượng thành công ≤ 10, không phải 100
- **Payment duplicate**: cùng 1 webhook gửi 10 lần → kỳ vọng chỉ 1 payment record, 1 lần trừ kho
- **Reservation race**: job hết hạn và callback thanh toán đến gần như đồng thời → kỳ vọng đúng 1 trong 2 transition thắng
- **Load test** cho các endpoint trên critical path: `GET /products`, `GET /products/:slug`, `POST /cart`, `POST /checkout`, `POST /payment/webhook`
