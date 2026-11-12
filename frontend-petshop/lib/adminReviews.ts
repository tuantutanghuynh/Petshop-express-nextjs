import type { ReviewStatus } from './types';

// /admin/danh-gia (ADR-027, test/adminReviews.test.ts). The queue (PENDING) is the default view; list
// state lives in the URL like the other admin lists. Stars filter is "sao" in the URL.
export const REVIEW_TABS = [
  { key: 'PENDING', label: 'Chờ duyệt' },
  { key: 'APPROVED', label: 'Đã duyệt' },
  { key: 'HIDDEN', label: 'Đã ẩn' },
  { key: 'all', label: 'Tất cả' },
] as const;
export type ReviewTab = (typeof REVIEW_TABS)[number]['key'];
export type ReviewsAdminQuery = { tab: ReviewTab; rating: number | null; page: number };
export const REVIEWS_ADMIN_PAGE_SIZE = 20;
export const REPLY_MAX = 1000;
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', HIDDEN: 'Đã ẩn' };
const BASE = '/admin/danh-gia';

export function parseReviewsQuery(sp: URLSearchParams): ReviewsAdminQuery {
  const page = Number(sp.get('page'));
  const rating = Number(sp.get('sao'));
  return {
    tab: REVIEW_TABS.find((t) => t.key === sp.get('tab'))?.key ?? 'PENDING',
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function reviewsAdminHref(q: ReviewsAdminQuery): string {
  const p = new URLSearchParams();
  if (q.tab !== 'PENDING') p.set('tab', q.tab);
  if (q.rating) p.set('sao', String(q.rating));
  if (q.page > 1) p.set('page', String(q.page));
  const qs = p.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

export function reviewsAdminApiPath(q: ReviewsAdminQuery): string {
  const p = new URLSearchParams({ page: String(q.page), pageSize: String(REVIEWS_ADMIN_PAGE_SIZE) });
  if (q.tab !== 'all') p.set('status', q.tab);
  if (q.rating) p.set('rating', String(q.rating));
  return `/reviews/admin?${p}`;
}

// null = fine; an empty reply removes the shop's answer.
export function validateReply(text: string): string | null {
  return text.trim().length > REPLY_MAX ? `Tối đa ${REPLY_MAX.toLocaleString('vi-VN')} ký tự` : null;
}
