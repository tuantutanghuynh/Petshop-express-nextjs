import type { FieldErrors } from './forms';

// Product reviews (spec 2026-11-10, ADR-027, test/reviews.test.ts). The backend checks the same
// limits (backend/constants/review.ts); these keep mistakes on the field.
export const REVIEW_LIMITS = { contentMin: 10, contentMax: 2000, images: 3, imageBytes: 5 * 1024 * 1024 } as const;
export const REVIEW_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const REVIEWS_PAGE_SIZE = 10;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isReviewId = (v: string) => UUID.test(v);
export const isProductId = (v: string) => UUID.test(v);

// Average of the approved reviews, one decimal; null when there are none — then the page shows no
// stars and the schema has no aggregateRating (.claude/rules/seo.md: no rating without reviews).
export function averageOf(p: { reviewCount?: number; ratingSum?: number }): number | null {
  if (!p.reviewCount || !p.ratingSum) return null;
  return Math.round((p.ratingSum / p.reviewCount) * 10) / 10;
}

export const formatRating = (n: number) => n.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function distributionRows(distribution: Record<number | string, number>, total: number) {
  return [5, 4, 3, 2, 1].map((stars) => {
    const count = Number(distribution[stars] ?? 0);
    return { stars, count, percent: total > 0 ? Math.round((count / total) * 100) : 0 };
  });
}

export type ReviewSortKey = 'newest' | 'highest' | 'lowest';
export type ReviewsQuery = { rating?: number; hasImages?: boolean; sort?: ReviewSortKey; page?: number };
export const REVIEW_SORT_LABELS: Record<ReviewSortKey, string> = { newest: 'Mới nhất', highest: 'Nhiều sao nhất', lowest: 'Ít sao nhất' };

export function reviewsApiPath(slug: string, q: ReviewsQuery): string {
  const p = new URLSearchParams({ page: String(q.page ?? 1), pageSize: String(REVIEWS_PAGE_SIZE) });
  if (q.rating) p.set('rating', String(q.rating));
  if (q.hasImages) p.set('hasImages', 'true');
  if (q.sort && q.sort !== 'newest') p.set('sort', q.sort);
  return `/products/${encodeURIComponent(slug)}/reviews?${p}`;
}

export type ReviewFormValues = { rating: number; content: string; images: string[] };

export function validateReviewForm(v: ReviewFormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!Number.isInteger(v.rating) || v.rating < 1 || v.rating > 5) errors.rating = 'Chọn số sao';
  const text = v.content.trim();
  if (text.length < REVIEW_LIMITS.contentMin) errors.content = `Viết ít nhất ${REVIEW_LIMITS.contentMin} ký tự`;
  else if (text.length > REVIEW_LIMITS.contentMax) errors.content = `Tối đa ${REVIEW_LIMITS.contentMax.toLocaleString('vi-VN')} ký tự`;
  if (v.images.length > REVIEW_LIMITS.images) errors.images = `Tối đa ${REVIEW_LIMITS.images} ảnh`;
  return errors;
}
