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

export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  status: string;
  updatedAt: string;
  category: Category;
  images: ProductImage[];
  variants: ProductVariant[];
}

// GET /api/v1/settings → { key: value } (values are strings; JSON for structured settings).
export type SiteSettings = Record<string, string>;
