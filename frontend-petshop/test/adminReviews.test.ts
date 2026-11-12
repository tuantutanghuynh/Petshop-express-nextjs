import { describe, expect, it } from 'vitest';
import { REVIEW_TABS, parseReviewsQuery, reviewsAdminHref, reviewsAdminApiPath, validateReply } from '../lib/adminReviews';

// /admin/danh-gia (ADR-027): the queue first, list state in the URL like the other admin lists.
describe('admin reviews list state', () => {
  it('opens on the waiting queue', () => {
    expect(REVIEW_TABS.map((t) => t.label)).toEqual(['Chờ duyệt', 'Đã duyệt', 'Đã ẩn', 'Tất cả']);
    expect(parseReviewsQuery(new URLSearchParams(''))).toEqual({ tab: 'PENDING', rating: null, page: 1 });
  });
  it('reads tab, stars and page, ignoring junk', () => {
    expect(parseReviewsQuery(new URLSearchParams('tab=HIDDEN&sao=2&page=3'))).toEqual({ tab: 'HIDDEN', rating: 2, page: 3 });
    expect(parseReviewsQuery(new URLSearchParams('tab=x&sao=9&page=-2'))).toEqual({ tab: 'PENDING', rating: null, page: 1 });
  });
  it('writes the admin URL and the API path', () => {
    expect(reviewsAdminHref({ tab: 'PENDING', rating: null, page: 1 })).toBe('/admin/danh-gia');
    expect(reviewsAdminHref({ tab: 'all', rating: 1, page: 2 })).toBe('/admin/danh-gia?tab=all&sao=1&page=2');
    expect(reviewsAdminApiPath({ tab: 'PENDING', rating: null, page: 1 })).toBe('/reviews/admin?page=1&pageSize=20&status=PENDING');
    expect(reviewsAdminApiPath({ tab: 'all', rating: 4, page: 2 })).toBe('/reviews/admin?page=2&pageSize=20&rating=4');
  });
});

describe('validateReply', () => {
  it('allows an empty reply (clears it) and refuses over 1000 characters', () => {
    expect(validateReply('')).toBeNull();
    expect(validateReply('Cảm ơn bạn!')).toBeNull();
    expect(validateReply('x'.repeat(1001))).toBe('Tối đa 1.000 ký tự');
  });
});
