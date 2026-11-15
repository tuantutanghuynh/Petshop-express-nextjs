-- ============================================================================
-- SCHEMA DATABASE — Nền tảng Ecommerce đa ngành (Mini Amazon/Shopify)
-- PostgreSQL 15+
-- Đồng bộ với: tai-lieu-khoi-tao-du-an-ecommerce.md (mục 4, 8, 9, 10)
-- ============================================================================
-- Quy ước ON DELETE dùng trong file này:
--   CASCADE   -- dữ liệu con không có ý nghĩa tồn tại độc lập với cha (vd: ảnh sản phẩm)
--   RESTRICT  -- chặn xoá cha nếu còn con tham chiếu (vd: category còn product)
--   SET NULL  -- cha có thể mất nhưng con (đặc biệt dữ liệu lịch sử) phải giữ lại
-- Nguyên tắc: order/order_items/payment_webhook_logs là dữ liệu lịch sử — KHÔNG
-- được cascade xoá theo product/user, luôn ưu tiên SET NULL + giữ snapshot.
-- Riêng orders áp dụng soft-delete (cột deleted_at) — ON DELETE CASCADE của
-- order_items/order_reservations chỉ là lưới an toàn, không phải luồng nghiệp vụ thường.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- cần cho gen_random_uuid()

-- ============================================================================
-- 1. USERS & PHÂN QUYỀN (mục 9.2)
-- ============================================================================

CREATE TABLE roles (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code  VARCHAR(20) UNIQUE NOT NULL   -- 'customer', 'staff', 'admin' — seed sẵn 3 dòng này khi migrate
);

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(255) UNIQUE NOT NULL,
  password_hash  VARCHAR(255),
  full_name      VARCHAR(255),
  role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
                  -- RESTRICT: không cho xoá role khi vẫn còn user đang gán role đó
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role ON users (role_id);

CREATE TABLE permissions (
  code  VARCHAR(100) PRIMARY KEY   -- vd: 'product.write', 'order.refund', 'inventory.adjust'
);

CREATE TABLE role_permissions (
  role_id          UUID NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
  permission_code  VARCHAR(100) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

-- ============================================================================
-- 2. DANH MỤC & THUỘC TÍNH ĐỘNG (mục 4.1–4.3)
-- ============================================================================

CREATE TABLE categories (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id        UUID REFERENCES categories(id) ON DELETE RESTRICT,
                    -- RESTRICT: phải chuyển/xoá category con trước khi xoá category cha
  name             VARCHAR(255) NOT NULL,
  slug             VARCHAR(255) UNIQUE NOT NULL,
  description      TEXT,
  seo_title        VARCHAR(255),
  seo_description  VARCHAR(500),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE category_attributes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id        UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                      -- CASCADE: xoá category thì định nghĩa attribute của nó cũng vô nghĩa
  attribute_key      VARCHAR(100) NOT NULL,      -- vd: "weight", "skin_type"
  attribute_label    VARCHAR(255) NOT NULL,      -- vd: "Trọng lượng"
  attribute_type     VARCHAR(50) NOT NULL
                      CHECK (attribute_type IN ('text', 'number', 'select', 'boolean')),
  is_required        BOOLEAN NOT NULL DEFAULT false,
  is_filterable      BOOLEAN NOT NULL DEFAULT true,
  is_searchable      BOOLEAN NOT NULL DEFAULT false,
  is_sortable        BOOLEAN NOT NULL DEFAULT false,
  validation_rules   JSONB,                       -- vd: {"min":0,"max":100}
  options            JSONB,                        -- nếu type = select: ["1kg","3kg","5kg"]
  UNIQUE (category_id, attribute_key),
  -- DB đảm bảo tính toàn vẹn cấu trúc cơ bản; validate nghiệp vụ sâu hơn (vd min/max hợp lệ)
  -- vẫn nằm ở tầng API (DB = structural integrity, API = business validation).
  CHECK (
    (attribute_type = 'select' AND options IS NOT NULL) OR
    (attribute_type <> 'select')
  ),
  CHECK (
    (attribute_type = 'boolean' AND options IS NULL) OR
    (attribute_type <> 'boolean')
  )
);

-- ============================================================================
-- 3. SẢN PHẨM, BIẾN THỂ, ẢNH (mục 4.2)
-- ============================================================================

CREATE TABLE products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id      UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
                    -- RESTRICT: không cho xoá category khi vẫn còn sản phẩm thuộc về nó
  name             VARCHAR(500) NOT NULL,
  slug             VARCHAR(500) UNIQUE NOT NULL,
  description      TEXT,
  brand            VARCHAR(255),
  status           VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'active', 'out_of_stock', 'discontinued', 'archived')),
                    -- xem mục 6.6 tài liệu: KHÔNG xoá record khi hết hàng, chỉ đổi status
  seo_title        VARCHAR(255),
  seo_description  VARCHAR(500),
  attributes       JSONB NOT NULL DEFAULT '{}',   -- validate theo category_attributes ở tầng backend
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_attributes ON products USING GIN (attributes);
CREATE INDEX idx_products_category   ON products (category_id);
CREATE INDEX idx_products_status     ON products (status);

CREATE TABLE product_variants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                       -- CASCADE: variant không tồn tại độc lập nếu product gốc bị xoá
  sku                 VARCHAR(100) UNIQUE NOT NULL,
  price               BIGINT NOT NULL CHECK (price >= 0),          -- đơn vị: đồng, không dùng FLOAT (mục 9.1)
  compare_at_price    BIGINT CHECK (compare_at_price >= 0),
  stock_quantity      INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  reserved_quantity   INT NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  variant_attributes  JSONB NOT NULL DEFAULT '{}',
  variant_key         VARCHAR(255) NOT NULL,
                       -- KHÔNG dùng generated column MD5(JSONB::text) — thứ tự key trong
                       -- JSON không đảm bảo cố định nên hash có thể khác nhau dù cùng nghĩa
                       -- business (vd {"weight":"3kg","flavor":"chicken"} vs thứ tự ngược lại).
                       -- Application phải tự canonicalize rồi lưu string tường minh, vd:
                       -- "flavor=chicken&weight=3kg" (sort key theo alphabet trước khi build).
  image_url           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, variant_key),
  -- Cách A (stock vật lý, khuyến nghị): stock_quantity = tồn kho thật, reserved_quantity =
  -- phần đang tạm khoá cho reservation đang active. available = stock_quantity - reserved_quantity.
  --   Khi payment confirm: stock_quantity -= qty  VÀ  reserved_quantity -= qty
  --   Khi reservation release/expire: reserved_quantity -= qty (stock_quantity giữ nguyên)
  -- (Không dùng Cách B — trừ thẳng vào stock_quantity ngay lúc reserve — vì sẽ nhầm lẫn
  -- giữa "tồn kho thật" và "tồn kho đã trừ nhưng có thể được release lại".)
  CHECK (reserved_quantity <= stock_quantity)
);
-- Schema tự nó KHÔNG đảm bảo available_stock >= requested_quantity khi có nhiều checkout
-- đồng thời trên cùng variant — đây là trách nhiệm của tầng application/service, bắt buộc
-- dùng transaction + row lock khi tạo reservation:
--   BEGIN
--     SELECT * FROM product_variants WHERE id = $1 FOR UPDATE
--     available := stock_quantity - reserved_quantity
--     IF available < requested THEN ROLLBACK
--     UPDATE product_variants SET reserved_quantity = reserved_quantity + requested WHERE id = $1
--     INSERT INTO order_reservations (...)
--   COMMIT
-- Không được đọc available rồi ghi tách rời (đọc-rồi-ghi không lock) — xem thêm mục 8.1 tài liệu.

CREATE INDEX idx_variants_product ON product_variants (product_id);

CREATE TABLE product_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  alt_text    VARCHAR(255) NOT NULL,      -- bắt buộc — quan trọng cho SEO ảnh
  position    INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_product_images_product ON product_images (product_id);

-- ============================================================================
-- 4. BLOG & GALLERY — hỗ trợ SEO (mục 4.4, 6.5)
-- ============================================================================

CREATE TABLE blog_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            VARCHAR(500) NOT NULL,
  slug             VARCHAR(500) UNIQUE NOT NULL,
  excerpt          VARCHAR(500),
  content          TEXT NOT NULL,
  cover_image_url  TEXT,
  author_id        UUID REFERENCES users(id) ON DELETE SET NULL,
                    -- SET NULL: bài viết vẫn tồn tại dù tài khoản tác giả bị xoá
  category         VARCHAR(100),
  status           VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'published')),
  seo_title        VARCHAR(255),
  seo_description  VARCHAR(500),
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE blog_post_products (
  blog_post_id  UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
                 -- CASCADE cả 2 chiều: bảng liên kết thuần, không có ý nghĩa khi 1 trong 2 mất
  PRIMARY KEY (blog_post_id, product_id)
);

CREATE TABLE gallery_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        VARCHAR(255),
  image_url    TEXT NOT NULL,
  alt_text     VARCHAR(255) NOT NULL,
  category_id  UUID REFERENCES categories(id) ON DELETE SET NULL,
                -- SET NULL: ảnh vẫn giữ được dù category bị xoá, chỉ mất phân loại
  source       VARCHAR(20) NOT NULL DEFAULT 'admin'
                CHECK (source IN ('admin', 'customer')),
  position     INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gallery_item_products (
  gallery_item_id  UUID NOT NULL REFERENCES gallery_items(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES products(id)      ON DELETE CASCADE,
  PRIMARY KEY (gallery_item_id, product_id)
);

-- ============================================================================
-- 5. ĐƠN HÀNG (mục 4.2, 8, 9.1) — order/payment/fulfillment tách 3 trục độc lập
-- ============================================================================

CREATE TABLE orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code          VARCHAR(30) UNIQUE NOT NULL,     -- vd "ORD-20260821-0001"
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
                       -- SET NULL: đơn hàng là dữ liệu lịch sử/kế toán, không được mất theo user
  guest_email         VARCHAR(255),
  guest_phone         VARCHAR(30),
  order_status        VARCHAR(30) NOT NULL DEFAULT 'pending'
                       CHECK (order_status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  payment_status      VARCHAR(30) NOT NULL DEFAULT 'unpaid'
                       CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded')),
  fulfillment_status  VARCHAR(30) NOT NULL DEFAULT 'unfulfilled'
                       CHECK (fulfillment_status IN ('unfulfilled', 'processing', 'packed', 'shipped', 'delivered', 'returned')),
  total_amount        BIGINT NOT NULL CHECK (total_amount >= 0),   -- đơn vị: đồng nguyên (hoặc cent nếu currency khác VND)
  currency             CHAR(3) NOT NULL DEFAULT 'VND',   -- chuẩn bị sẵn cho multi-currency (Stripe/quốc tế sau này)
  shipping_address    JSONB,
  payment_method      VARCHAR(50),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
                       -- Soft delete: orders KHÔNG BAO GIỜ hard-delete ở tầng application.
                       -- ON DELETE CASCADE của order_items/order_reservations bên dưới chỉ là
                       -- lưới an toàn cho trường hợp hiếm (xoá dữ liệu test, GDPR request),
                       -- không phải luồng nghiệp vụ bình thường.
  CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL)
        -- bắt buộc: nếu không login thì phải có guest_email (chốt chính sách guest checkout)
);

CREATE INDEX idx_orders_user      ON orders (user_id);
CREATE INDEX idx_orders_status    ON orders (order_status, payment_status, fulfillment_status);
CREATE INDEX idx_orders_created   ON orders (created_at);

CREATE TABLE order_items (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id               UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                          -- CASCADE: item không có ý nghĩa tồn tại khi order bị xoá cứng
  product_id             UUID REFERENCES products(id)         ON DELETE SET NULL,
  variant_id             UUID REFERENCES product_variants(id) ON DELETE SET NULL,
                          -- SET NULL: sản phẩm/variant có thể bị xoá sau này, nhưng đơn hàng
                          -- vẫn phải đọc được nhờ các cột snapshot bên dưới (bất biến)
  product_name_snapshot  VARCHAR(500) NOT NULL,
  variant_name_snapshot  VARCHAR(255),
  sku_snapshot           VARCHAR(100) NOT NULL,
  unit_price             BIGINT NOT NULL CHECK (unit_price >= 0),
  quantity               INT NOT NULL CHECK (quantity > 0),
  discount_amount        BIGINT NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount             BIGINT NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  subtotal               BIGINT NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX idx_order_items_order   ON order_items (order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);

CREATE TABLE product_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
                       -- SET NULL: giữ lại review dù user bị xoá tài khoản (hiện "người dùng đã xoá")
  order_item_id       UUID REFERENCES order_items(id) ON DELETE SET NULL,
                       -- dùng để xác định user có thực sự mua variant này chưa (chống review giả)
  verified_purchase   BOOLEAN NOT NULL DEFAULT false,
  rating              SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- verified_purchase KHÔNG được set trực tiếp từ client request — backend tự suy ra
  -- (user → order → order_item → payment_status = 'paid') trong transaction xác nhận,
  -- không tin giá trị boolean gửi lên từ frontend. Ràng buộc dưới đây chỉ đảm bảo tính
  -- nhất quán tối thiểu: không thể verified_purchase=true mà không gắn order_item nào.
  CHECK (NOT verified_purchase OR order_item_id IS NOT NULL)
);

CREATE INDEX idx_reviews_product ON product_reviews (product_id);
-- PostgreSQL cho phép nhiều NULL trong UNIQUE constraint thường — nếu dùng
-- UNIQUE(user_id, product_id) ở mức bảng, nhiều dòng NULL + cùng product_id vẫn lọt qua.
-- Vì user_id nullable (đề phòng sau này có guest review, hoặc review bị anonymize sau khi
-- user xoá tài khoản), dùng PARTIAL UNIQUE INDEX để chỉ áp constraint khi user_id có giá trị:
CREATE UNIQUE INDEX idx_reviews_user_product
  ON product_reviews (user_id, product_id) WHERE user_id IS NOT NULL;
-- Nếu chính sách là "chỉ user đã đăng nhập mới được review" (không cho guest review),
-- thêm ràng buộc tại tầng API: từ chối request review khi chưa authenticate — schema vẫn
-- giữ user_id nullable để không phá vỡ ON DELETE SET NULL khi user bị xoá về sau.

CREATE TABLE order_status_history (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  old_order_status         VARCHAR(30),
  new_order_status         VARCHAR(30),
  old_payment_status       VARCHAR(30),
  new_payment_status       VARCHAR(30),
  old_fulfillment_status   VARCHAR(30),
  new_fulfillment_status   VARCHAR(30),
  changed_by               UUID REFERENCES users(id) ON DELETE SET NULL,   -- NULL = hệ thống tự đổi (job, webhook)
  reason                   TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Ghi 1 dòng mỗi khi bất kỳ trạng thái nào trong 3 trục của order thay đổi, lưu cả
-- old → new (không chỉ snapshot sau khi đổi) để đọc lại lịch sử trực quan, vd:
-- "pending → confirmed", "unpaid → paid", "unfulfilled → processing". Phục vụ customer
-- support, audit, debug tranh chấp đơn hàng, và làm nguồn dữ liệu cho analytics.

CREATE INDEX idx_order_status_history_order ON order_status_history (order_id, created_at);

-- ============================================================================
-- 6. RESERVATION & THANH TOÁN (mục 4.5, 8.1–8.3)
-- ============================================================================

CREATE TABLE order_reservations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id)          ON DELETE CASCADE,
  variant_id  UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
              -- CASCADE: reservation vô nghĩa nếu order hoặc variant gốc bị xoá
  quantity    INT NOT NULL CHECK (quantity > 0),
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'confirmed', 'released')),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, variant_id)
  -- 1 order chỉ có 1 reservation record cho mỗi variant — nếu quantity thay đổi
  -- (khách sửa số lượng trong giỏ trước khi thanh toán) thì UPDATE record này,
  -- không INSERT thêm dòng mới.
);

CREATE INDEX idx_reservations_variant       ON order_reservations (variant_id);
CREATE INDEX idx_reservations_expiry_active ON order_reservations (expires_at)
             WHERE status = 'active';   -- tối ưu cho job quét reservation hết hạn

CREATE TABLE outbox_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(50) NOT NULL,     -- vd: 'order', 'product'
  aggregate_id  UUID NOT NULL,
  event_type    VARCHAR(50) NOT NULL,      -- vd: 'order.paid', 'product.updated'
  payload       JSONB NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'published', 'failed')),
  retry_count   INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);
-- Ghi cùng transaction với thay đổi nghiệp vụ chính (vd update order + insert outbox_event
-- trong cùng BEGIN...COMMIT), sau đó 1 worker riêng poll bảng này và đẩy vào BullMQ.
-- Tránh tình huống "DB commit thành công nhưng BullMQ enqueue thất bại" làm mất việc gửi
-- email/đồng bộ search/notification (xem mục 14.1 tài liệu — P2, chưa bắt buộc ở MVP).

CREATE INDEX idx_outbox_pending ON outbox_events (created_at) WHERE status = 'pending';
-- Outbox giải quyết vấn đề "DB commit thành công nhưng BullMQ enqueue thất bại", nhưng
-- KHÔNG tự giải quyết duplicate delivery: worker có thể publish vào BullMQ thành công
-- rồi crash trước khi kịp UPDATE outbox_events.status = 'published' → lần chạy lại sẽ
-- publish trùng (vd gửi email 2 lần). Vì vậy consumer (job xử lý BullMQ) BẮT BUỘC
-- idempotent — dùng chính outbox_events.id làm BullMQ job ID (deterministic, không phải
-- random UUID mới mỗi lần enqueue) để BullMQ tự chặn job trùng ID, hoặc consumer tự lưu
-- lại danh sách event_id đã xử lý trước khi thực hiện side-effect (gửi email, cập nhật index...).

CREATE TABLE payment_webhook_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID REFERENCES orders(id) ON DELETE SET NULL,
                       -- SET NULL: log webhook vẫn giữ để audit dù order bị xoá
  event_id            VARCHAR(255),
  gateway             VARCHAR(20) NOT NULL CHECK (gateway IN ('vnpay', 'momo', 'stripe')),
  transaction_ref     VARCHAR(255) NOT NULL,
  signature_valid     BOOLEAN NOT NULL,
  processing_status   VARCHAR(30) NOT NULL DEFAULT 'received'
                       CHECK (processing_status IN ('received', 'processed', 'ignored_duplicate', 'failed')),
  raw_payload         JSONB,
  error_message       TEXT,
  retry_count         INT NOT NULL DEFAULT 0,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at        TIMESTAMPTZ,
  UNIQUE (gateway, transaction_ref)   -- transaction_ref luôn có, dùng làm ràng buộc mặc định
);

CREATE INDEX idx_webhook_logs_order ON payment_webhook_logs (order_id);
-- Nếu gateway cung cấp event_id ổn định (event_id và transaction_ref là 2 khái niệm
-- khác nhau — 1 giao dịch có thể phát nhiều event khác thời điểm), thêm ràng buộc unique
-- riêng cho event_id khi có giá trị:
CREATE UNIQUE INDEX idx_webhook_logs_gateway_event
  ON payment_webhook_logs (gateway, event_id) WHERE event_id IS NOT NULL;

-- ============================================================================
-- 7. ANALYTICS / EVENT TRACKING (mục 10.3)
-- ============================================================================

CREATE TABLE events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name   VARCHAR(50) NOT NULL,   -- view_item, add_to_cart, abandon_cart, purchase...
  session_id   VARCHAR(100) NOT NULL,
  user_id      UUID REFERENCES users(id)             ON DELETE SET NULL,
  product_id   UUID REFERENCES products(id)          ON DELETE SET NULL,
  variant_id   UUID REFERENCES product_variants(id)  ON DELETE SET NULL,
  category_id  UUID REFERENCES categories(id)        ON DELETE SET NULL,
  order_id     UUID REFERENCES orders(id)            ON DELETE SET NULL,
               -- toàn bộ SET NULL: events là dữ liệu phân tích, không nên bị cascade xoá
               -- theo dữ liệu nghiệp vụ chính — mất liên kết vẫn còn nguyên hàng dữ liệu thô
  metadata     JSONB NOT NULL DEFAULT '{}',
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_name_time ON events (event_name, occurred_at);
CREATE INDEX idx_events_session   ON events (session_id);
CREATE INDEX idx_events_user      ON events (user_id);
CREATE INDEX idx_events_product   ON events (product_id);
-- Lưu ý vận hành: bảng này tăng rất nhanh (mỗi lượt xem trang = 1 dòng). Ở MVP, giữ
-- nguyên trong PostgreSQL là hợp lý. Khi traffic đủ lớn (ước lượng hàng triệu event/ngày),
-- cân nhắc chuyển pipeline ghi event sang queue/stream riêng rồi đổ vào kho phân tích
-- (data warehouse) thay vì ghi trực tiếp vào PostgreSQL nghiệp vụ — tránh Postgres chính
-- bị quá tải bởi khối lượng ghi analytics. Không cần làm ngay ở MVP.

-- ============================================================================
-- HẾT SCHEMA
-- ============================================================================
