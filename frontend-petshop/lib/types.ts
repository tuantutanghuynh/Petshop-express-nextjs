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
