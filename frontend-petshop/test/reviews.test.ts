import { describe, expect, it } from 'vitest';
import { averageOf, distributionRows, formatRating, reviewsApiPath, validateReviewForm } from '../lib/reviews';

// Product reviews on the storefront (ADR-027): honest numbers, and the form refuses what the API would.

describe('averageOf', () => {
  it('is null without approved reviews (no stars, no schema)', () => {
    expect(averageOf({ reviewCount: 0, ratingSum: 0 })).toBeNull();
    expect(averageOf({})).toBeNull();
  });
  it('rounds to one decimal', () => {
    expect(averageOf({ reviewCount: 3, ratingSum: 14 })).toBe(4.7);
    expect(averageOf({ reviewCount: 4, ratingSum: 16 })).toBe(4);
  });
});

describe('formatRating', () => {
  it('uses a Vietnamese decimal comma', () => {
    expect(formatRating(4.7)).toBe('4,7');
    expect(formatRating(4)).toBe('4,0');
  });
});

describe('distributionRows', () => {
  it('lists 5 to 1 stars with whole percentages', () => {
    expect(distributionRows({ 1: 0, 2: 1, 3: 0, 4: 1, 5: 2 }, 4)).toEqual([
      { stars: 5, count: 2, percent: 50 }, { stars: 4, count: 1, percent: 25 }, { stars: 3, count: 0, percent: 0 },
      { stars: 2, count: 1, percent: 25 }, { stars: 1, count: 0, percent: 0 },
    ]);
  });
  it('is all zero without reviews', () => {
    expect(distributionRows({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, 0).every((r) => r.percent === 0)).toBe(true);
  });
});

describe('reviewsApiPath', () => {
  it('asks the API for a filtered, sorted page', () => {
    expect(reviewsApiPath('pate-meo', {})).toBe('/products/pate-meo/reviews?page=1&pageSize=10');
    expect(reviewsApiPath('pate-meo', { rating: 5, hasImages: true, sort: 'lowest', page: 2 })).toBe('/products/pate-meo/reviews?page=2&pageSize=10&rating=5&hasImages=true&sort=lowest');
  });
});

describe('validateReviewForm', () => {
  const ok = { rating: 5, content: 'Mèo nhà mình rất thích.', images: [] as string[] };
  it('accepts a complete review', () => {
    expect(validateReviewForm(ok)).toEqual({});
  });
  it.each([
    [{ rating: 0 }, 'rating', 'Chọn số sao'],
    [{ content: 'Tốt' }, 'content', 'Viết ít nhất 10 ký tự'],
    [{ content: 'x'.repeat(2001) }, 'content', 'Tối đa 2.000 ký tự'],
    [{ images: ['a', 'b', 'c', 'd'] }, 'images', 'Tối đa 3 ảnh'],
  ])('refuses %j', (patch, field, message) => {
    expect(validateReviewForm({ ...ok, ...patch })[field]).toBe(message);
  });
});
