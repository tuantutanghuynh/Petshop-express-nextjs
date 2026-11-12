// Shapes of the data the backend API returns. Every response is wrapped in the same envelope
// (see backend/utils/ApiResponse.ts), so pages type their data as `ApiEnvelope<T>`.

export interface ApiError {
  code: string;
  message: string;
  details: unknown;
}

export interface ApiEnvelope<T, M = null> {
  data: T;
  meta: M;
  error: ApiError | null;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface Author {
  id: string;
  fullName: string | null;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImageUrl: string | null;
  status: string;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author?: Author;
  // Topic of the post (shared Category table); included by GET /blog and /blog/:slug.
  category?: { id: string; name: string; slug: string } | null;
}

export interface GalleryItem {
  id: string;
  title: string | null;
  imageUrl: string;
  altText: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UploadResult {
  url: string;
}

// Catalogue shapes as returned by GET /api/v1/products (variants sorted by price ascending,
// images by position) and GET /api/v1/categories.
export interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
  position: number;
}

export interface ProductVariant {
  id: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  stockQuantity: number;
  reservedQuantity: number;
  variantAttributes: { label?: string } & Record<string, unknown>;
  imageUrl: string | null;
}

export interface CategoryAttribute {
  id: string;
  attributeKey: string;
  attributeLabel: string;
}

export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  // Order among siblings; GET /categories already sorts by it.
  sortOrder?: number;
  // Included by GET /categories and GET /products/:slug (spec table labels), not by the list.
  attributes?: CategoryAttribute[];
}

// GET /categories/admin/list: a category of the shop with what still uses it (/admin/danh-muc).
export interface AdminCategory extends Category {
  _count: { products: number; blogPosts: number; galleryItems: number; children: number };
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  status: string;
  updatedAt: string;
  // Spec values keyed by CategoryAttribute.attributeKey.
  attributes: Record<string, unknown>;
  category: Category;
  images: ProductImage[];
  variants: ProductVariant[];
  // Approved reviews only (ADR-027): average = ratingSum / reviewCount. Optional in old fixtures.
  reviewCount?: number;
  ratingSum?: number;
  // GET /products/:slug only: "Thường mua kèm" picked by the admin, on sale, in order (ADR-026).
  related?: RelatedProduct[];
}

export type RelatedProduct = Pick<Product, 'id' | 'name' | 'slug' | 'brand' | 'images' | 'variants'>;

// GET /products/admin/:id — any status, with the category's spec fields (text or number).
export interface AdminProduct extends Omit<Product, 'category' | 'related'> {
  categoryId: string;
  category: Category & { attributes: (CategoryAttribute & { attributeType: string })[] };
  // Every linked product whatever its status, so a hidden one can be seen and removed.
  related?: { id: string; name: string; slug: string; status: string }[];
}

// GET /api/v1/settings → { key: value } (values are strings; JSON for structured settings).
export type SiteSettings = Record<string, string>;

// GET /api/v1/cart. `available` = stockQuantity - reservedQuantity; warnings are computed by the
// backend (UNAVAILABLE | OUT_OF_STOCK | INSUFFICIENT_STOCK) and must be resolved before checkout.
export interface CartLine {
  id: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  available: number;
  warnings: string[];
  variant: { id: string; sku: string; variantAttributes: Record<string, unknown>; imageUrl: string | null };
  product: { id: string; name: string; slug: string };
}

export interface Cart {
  id: string | null;
  brandSlug: string;
  items: CartLine[];
  subtotal: number;
  hasIssues: boolean;
}

// Orders (GET /api/v1/orders, /orders/:code). Items are snapshots taken when the order was placed.
export interface ShippingAddress {
  fullName: string;
  phone: string;
  addressLine: string;
  city: string;
}

export interface OrderItem {
  id: string;
  // GET /orders/:code only: which product the line is (for "Viết đánh giá"); null once deleted.
  product?: { id: string; slug: string } | null;
  productName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  code: string;
  orderStatus: string;
  paymentMethod: 'COD' | 'BANK_TRANSFER' | string;
  paymentStatus: string;
  subtotal: number;
  shippingFee: number;
  grandTotal: number;
  shippingAddress: ShippingAddress;
  note: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
  items: OrderItem[];
}

export interface Customer {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
}

// GET /orders/admin/list rows, as far as the dashboard reads them.
export interface AdminOrderSummary { id: string; code: string; grandTotal: number; expiresAt: string | null }
// GET /quote-requests/admin/list rows (dashboard view).
export interface QuoteRequestSummary { id: string; customerName: string; phone: string; items: unknown[]; createdAt: string }
// GET /quote-requests/admin/stats — conversionRate is already a percentage.
export interface QuoteStats { totalRequests: number; closedCount: number; revenue: number; averageOrderValue: number; conversionRate: number }

// GET /orders/admin/list rows: the order with its customer account (admin orders page).
export interface AdminOrder extends Order {
  user: { id: string; email: string; fullName: string | null } | null;
}

// GET /quote-requests/admin/list rows (admin quotes page).
export interface AdminQuote {
  id: string;
  customerName: string;
  phone: string;
  email: string | null;
  address: string | null;
  note: string | null;
  items: { productName: string; variantLabel: string | null; sku: string; quantity: number; unitPrice: number; lineTotal: number }[];
  status: string;
  finalAmount: number | null;
  closedAt: string | null;
  createdAt: string;
}

// GET /contact/admin/list rows (admin contact messages page).
export interface AdminContactMessage {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  subject: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

// GET /newsletter/subscribers rows (admin newsletter page). Token hashes are never sent.
export interface NewsletterSubscriber {
  id: string;
  email: string;
  status: 'PENDING' | 'CONFIRMED' | 'UNSUBSCRIBED';
  consentAt: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
}

// GET /products/variants/:id/stock-movements rows (stock history in the product form). order is
// set for SALE / CANCEL_RESTOCK; user for movements made by an admin.
export interface StockMovement {
  id: string;
  delta: number;
  quantityAfter: number;
  reason: string;
  note: string | null;
  orderId: string | null;
  order: { code: string } | null;
  createdAt: string;
  user: { id: string; fullName: string | null; email: string } | null;
}

// Newsletter campaigns (spec 2026-11-10). GET /newsletter/campaigns rows; GET …/:id adds content,
// preheader, featured and featuredItems (the name of each item and whether the email would show it).
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED';
export type FeaturedRef = { type: 'post' | 'product'; id: string };
export interface CampaignSummary {
  id: string;
  subject: string;
  status: CampaignStatus;
  isAdvertising: boolean;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  unsubscribeCount: number;
  createdAt: string;
  updatedAt: string;
}
export interface Campaign extends CampaignSummary {
  preheader: string | null;
  content: string;
  featured: FeaturedRef[];
  featuredItems: (FeaturedRef & { title: string | null; available: boolean })[];
}

// Product reviews (ADR-027). Public rows never carry the author's email.
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'HIDDEN';
export interface PublicReview {
  id: string;
  rating: number;
  content: string;
  images: string[];
  authorName: string;
  adminReply: string | null;
  adminReplyAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ReviewSummary {
  count: number;
  average: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  withImages: number;
}
export interface OwnReview {
  id: string;
  productId: string;
  rating: number;
  content: string;
  images: string[];
  status: ReviewStatus;
  adminReply: string | null;
  createdAt: string;
  updatedAt: string;
}
// GET /reviews/admin rows (admin moderation): the customer's email is shown to the admin only.
export interface AdminReview {
  id: string;
  rating: number;
  content: string;
  images: string[];
  status: ReviewStatus;
  adminReply: string | null;
  adminReplyAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  product: { id: string; name: string; slug: string };
  user: { id: string; fullName: string | null; email: string };
}
