// Product reviews (spec 2026-11-10, ADR-027).
export const REVIEW_LIMITS = { contentMin: 10, contentMax: 2000, images: 3, reply: 1000 } as const;
export const REVIEW_PAGE_SIZE = 10;
export const REVIEW_MAX_PAGE_SIZE = 20;
export const REVIEW_ADMIN_PAGE_SIZE = 20;
export const REVIEW_SORTS = ['newest', 'highest', 'lowest'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];
// Customer photo upload: smaller than admin uploads, and limited per account.
export const REVIEW_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const REVIEW_IMAGE_UPLOADS_PER_HOUR = 10;
// Shown instead of a name the customer never gave.
export const REVIEW_AUTHOR_FALLBACK = 'Khách hàng';
