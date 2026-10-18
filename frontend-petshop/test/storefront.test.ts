import { describe, expect, it, vi } from 'vitest';
import { formatVnd, imageSrc, parsePromo, parseSocialLinks, priceSummary } from '../lib/storefront';
import type { ProductVariant } from '../lib/types';

// Pure helpers behind the homepage. They turn raw API values into what the page shows, and they
// are where "never show something that is not true" is enforced (.claude/rules/seo.md: no fake
// promotions, availability from real stock).

const variant = (over: Partial<ProductVariant>): ProductVariant => ({
  id: 'v', sku: 'S', price: 100000, compareAtPrice: null, stockQuantity: 5, reservedQuantity: 0,
  variantAttributes: {}, imageUrl: null, ...over,
});

describe('formatVnd', () => {
  it('formats an integer amount as Vietnamese dong', () => {
    expect(formatVnd(289000).replace(/\s/g, ' ')).toBe('289.000 ₫');
  });
});

describe('priceSummary', () => {
  it('uses the cheapest variant and says "from" when there are several prices', () => {
    const s = priceSummary([variant({ price: 249000 }), variant({ price: 399000 })]);
    expect(s).toMatchObject({ price: 249000, hasRange: true, isOutOfStock: false });
  });

  it('shows a discount only when the compare-at price is really higher', () => {
    expect(priceSummary([variant({ price: 164000, compareAtPrice: 193000 })])).toMatchObject({ compareAtPrice: 193000, discountPercent: 15 });
    expect(priceSummary([variant({ price: 164000, compareAtPrice: 164000 })])).toMatchObject({ compareAtPrice: null, discountPercent: null });
  });

  it('is out of stock when nothing is left after reservations', () => {
    expect(priceSummary([variant({ stockQuantity: 3, reservedQuantity: 3 })])?.isOutOfStock).toBe(true);
    expect(priceSummary([variant({ stockQuantity: 0 }), variant({ stockQuantity: 2, price: 200000 })])?.isOutOfStock).toBe(false);
  });

  it('returns null for a product without variants', () => {
    expect(priceSummary([])).toBeNull();
  });
});

describe('parsePromo', () => {
  it('reads an admin-configured banner', () => {
    const raw = JSON.stringify({ title: 'Đồ chơi', subtitle: 'Vui chơi', href: '/blog', cta: 'Mua ngay', big: '-50%', image: 'https://res.cloudinary.com/x/a.jpg' });
    expect(parsePromo(raw)).toEqual({ title: 'Đồ chơi', subtitle: 'Vui chơi', href: '/blog', cta: 'Mua ngay', big: '-50%', image: 'https://res.cloudinary.com/x/a.jpg' });
  });

  it('hides the banner when the setting is missing, broken or has no title / link', () => {
    expect(parsePromo(undefined)).toBeNull();
    expect(parsePromo('{not json')).toBeNull();
    expect(parsePromo(JSON.stringify({ title: 'X' }))).toBeNull();
    expect(parsePromo(JSON.stringify({ href: '/blog' }))).toBeNull();
  });

  it('refuses links that could run script', () => {
    expect(parsePromo(JSON.stringify({ title: 'X', href: 'javascript:alert(1)' }))).toBeNull();
    expect(parsePromo(JSON.stringify({ title: 'X', href: '//evil.example' }))).toBeNull();
  });
});

describe('parseSocialLinks', () => {
  it('keeps only https URLs, from a JSON array or one URL per line', () => {
    expect(parseSocialLinks('["https://facebook.com/a","javascript:x","http://zalo.me/1"]')).toEqual(['https://facebook.com/a']);
    expect(parseSocialLinks('https://facebook.com/a\n https://instagram.com/b ')).toEqual(['https://facebook.com/a', 'https://instagram.com/b']);
    expect(parseSocialLinks(undefined)).toEqual([]);
  });
});

describe('imageSrc', () => {
  it('keeps Cloudinary URLs and resolves legacy /uploads paths against the backend', () => {
    vi.stubEnv('NEXT_PUBLIC_BACKEND_ORIGIN', 'http://localhost:4000');
    expect(imageSrc('https://res.cloudinary.com/demo/image/upload/a.jpg')).toBe('https://res.cloudinary.com/demo/image/upload/a.jpg');
    expect(imageSrc('/uploads/a.jpg')).toBe('http://localhost:4000/uploads/a.jpg');
    vi.unstubAllEnvs();
  });

  it('drops hosts next/image is not configured for, instead of crashing the page', () => {
    expect(imageSrc('https://evil.example/a.jpg')).toBeNull();
    expect(imageSrc('http://res.cloudinary.com/a.jpg')).toBeNull();
    expect(imageSrc(null)).toBeNull();
    expect(imageSrc('')).toBeNull();
  });
});
