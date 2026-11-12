import { describe, expect, it } from 'vitest';
import { categoryCrumbs } from '../lib/seo/categoryCrumbs';
import { pageCount, parsePageParam } from '../lib/pagination';
import { breadcrumbJsonLd, productJsonLd } from '../lib/seo/structuredData';
import { buildSitemap } from '../lib/seo/sitemap';
import type { Product, ProductVariant } from '../lib/types';

// Catalogue pages (.claude/rules/seo.md): structured data must match what the page shows — real
// VND prices as numbers, availability from stock minus reservations, no rating — and pagination
// uses real ?page=N URLs where anything malformed is a 404, not a duplicate of page 1.

const BASE = 'https://example.vn';

const variant = (over: Partial<ProductVariant>): ProductVariant => ({
  id: 'v', sku: 'SKU-1', price: 100000, compareAtPrice: null, stockQuantity: 5, reservedQuantity: 0,
  variantAttributes: { label: 'Mặc định' }, imageUrl: null, ...over,
});

const product = (over: Partial<Product>): Product => ({
  id: 'p', name: 'Pate mèo vị cá ngừ', slug: 'pate-meo-ca-ngu', description: '**Pate** dạng mịn cho mèo.', brand: null,
  status: 'active', updatedAt: '2026-10-18T00:00:00.000Z', attributes: {},
  category: { id: 'c', parentId: 'root', name: 'Pate', slug: 'pate', description: null },
  images: [], variants: [variant({})], ...over,
});

describe('productJsonLd', () => {
  it('describes a single-variant product with an Offer in VND', () => {
    const ld = productJsonLd(BASE, product({}));
    expect(ld).toMatchObject({
      '@type': 'Product',
      name: 'Pate mèo vị cá ngừ',
      sku: 'SKU-1',
      offers: { '@type': 'Offer', price: 100000, priceCurrency: 'VND', availability: 'https://schema.org/InStock', url: `${BASE}/san-pham/pate-meo-ca-ngu` },
    });
    expect(ld.description).toBe('Pate dạng mịn cho mèo.');
  });

  it('uses an AggregateOffer with the real price range for several variants', () => {
    const ld = productJsonLd(BASE, product({ variants: [variant({ sku: 'A', price: 18000 }), variant({ sku: 'B', price: 28000 })] }));
    expect(ld.offers).toMatchObject({ '@type': 'AggregateOffer', lowPrice: 18000, highPrice: 28000, offerCount: 2, priceCurrency: 'VND' });
    expect(ld).not.toHaveProperty('sku');
  });

  it('is OutOfStock when every unit is sold or held', () => {
    const ld = productJsonLd(BASE, product({ variants: [variant({ stockQuantity: 2, reservedQuantity: 2 })] }));
    expect(ld.offers).toMatchObject({ availability: 'https://schema.org/OutOfStock' });
  });

  it('never invents a rating, and leaves brand out when there is none', () => {
    const ld = productJsonLd(BASE, product({}));
    expect(ld).not.toHaveProperty('aggregateRating');
    expect(ld).not.toHaveProperty('review');
    expect(ld).not.toHaveProperty('brand');
    expect(productJsonLd(BASE, product({ brand: 'Acme' })).brand).toEqual({ '@type': 'Brand', name: 'Acme' });
  });

  it('adds the rating and the reviews shown on the page once approved reviews exist (ADR-027)', () => {
    const reviews = [
      { id: 'r1', rating: 5, content: 'Mèo rất thích.', images: [], authorName: 'Tú', adminReply: null, adminReplyAt: null, createdAt: '2026-11-02T03:00:00.000Z', updatedAt: '2026-11-02T03:00:00.000Z' },
      { id: 'r2', rating: 4, content: 'Giao nhanh.', images: [], authorName: 'Mai', adminReply: null, adminReplyAt: null, createdAt: '2026-11-01T03:00:00.000Z', updatedAt: '2026-11-01T03:00:00.000Z' },
    ];
    const ld = productJsonLd(BASE, product({ reviewCount: 2, ratingSum: 9 }), reviews);
    expect(ld.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 4.5, reviewCount: 2, bestRating: 5, worstRating: 1 });
    expect(ld.review).toEqual([
      { '@type': 'Review', author: { '@type': 'Person', name: 'Tú' }, datePublished: '2026-11-02', reviewBody: 'Mèo rất thích.', reviewRating: { '@type': 'Rating', ratingValue: 5, bestRating: 5, worstRating: 1 } },
      { '@type': 'Review', author: { '@type': 'Person', name: 'Mai' }, datePublished: '2026-11-01', reviewBody: 'Giao nhanh.', reviewRating: { '@type': 'Rating', ratingValue: 4, bestRating: 5, worstRating: 1 } },
    ]);
  });

  it('has no rating while the counters are zero, even with a list passed', () => {
    const ld = productJsonLd(BASE, product({ reviewCount: 0, ratingSum: 0 }), []);
    expect(ld).not.toHaveProperty('aggregateRating');
    expect(ld).not.toHaveProperty('review');
  });

  it('lists only images next/image can serve', () => {
    const ld = productJsonLd(BASE, product({ images: [
      { id: '1', url: 'https://res.cloudinary.com/x/a.jpg', altText: null, position: 0 },
      { id: '2', url: 'https://evil.example/b.jpg', altText: null, position: 1 },
    ] }));
    expect(ld.image).toEqual(['https://res.cloudinary.com/x/a.jpg']);
  });
});

describe('breadcrumbJsonLd', () => {
  it('numbers the trail and links every step except the current page', () => {
    expect(breadcrumbJsonLd(BASE, [{ name: 'Trang chủ', path: '/' }, { name: 'Pate', path: '/danh-muc/pate' }, { name: 'Pate mèo' }])).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${BASE}/` },
        { '@type': 'ListItem', position: 2, name: 'Pate', item: `${BASE}/danh-muc/pate` },
        { '@type': 'ListItem', position: 3, name: 'Pate mèo' },
      ],
    });
  });
});

describe('parsePageParam', () => {
  it('reads page 1 from a missing parameter and N from "N"', () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam('1')).toBe(1);
    expect(parsePageParam('3')).toBe(3);
  });

  it('rejects anything that is not a plain positive integer (the page answers 404)', () => {
    for (const raw of ['0', '-1', 'abc', '1.5', '02', '', ' 2', '1e2', '99999999999']) expect(parsePageParam(raw)).toBeNull();
    expect(parsePageParam(['2', '3'])).toBeNull();
  });
});

describe('pageCount', () => {
  it('always has at least one page', () => {
    expect(pageCount(0, 24)).toBe(1);
    expect(pageCount(24, 24)).toBe(1);
    expect(pageCount(25, 24)).toBe(2);
  });
});

describe('sitemap with the catalogue', () => {
  it('adds products with their real updatedAt and categories without an invented date', () => {
    const entries = buildSitemap(BASE, [], {
      products: [{ slug: 'pate-meo-ca-ngu', updatedAt: '2026-10-18T00:00:00.000Z' }],
      categories: [{ slug: 'pate' }],
    });
    expect(entries).toContainEqual({ url: `${BASE}/san-pham/pate-meo-ca-ngu`, lastModified: '2026-10-18T00:00:00.000Z' });
    expect(entries).toContainEqual({ url: `${BASE}/danh-muc/pate` });
    expect(entries.some((e) => e.url.includes('page='))).toBe(false);
  });

  it('lists owner-written pages only when they have text, and never the quote form', () => {
    const urls = buildSitemap(BASE, [], { products: [], categories: [], pages: ['/gioi-thieu'] }).map((e) => e.url);
    expect(urls).toContain(`${BASE}/gioi-thieu`);
    expect(urls).not.toContain(`${BASE}/chinh-sach/bao-mat`);
    expect(urls.some((u) => u.includes('tu-van-bao-gia'))).toBe(false);
  });
});

describe('categoryCrumbs', () => {
  const trail = [{ name: 'Chó', slug: 'cho' }, { name: 'Thức ăn', slug: 'cho-thuc-an' }, { name: 'Hạt cho chó', slug: 'hat-cho-cho' }];

  it('links every ancestor and leaves the current category unlinked', () => {
    expect(categoryCrumbs(trail)).toEqual([
      { name: 'Trang chủ', path: '/' },
      { name: 'Chó', path: '/danh-muc/cho' },
      { name: 'Thức ăn', path: '/danh-muc/cho-thuc-an' },
      { name: 'Hạt cho chó' },
    ]);
  });

  it('links the whole trail when a product is the current page', () => {
    const crumbs = categoryCrumbs(trail, 'Hạt X 2kg');
    expect(crumbs.at(-2)).toEqual({ name: 'Hạt cho chó', path: '/danh-muc/hat-cho-cho' });
    expect(crumbs.at(-1)).toEqual({ name: 'Hạt X 2kg' });
  });
});
