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
  // Included by GET /categories and GET /products/:slug (spec table labels), not by the list.
  attributes?: CategoryAttribute[];
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
