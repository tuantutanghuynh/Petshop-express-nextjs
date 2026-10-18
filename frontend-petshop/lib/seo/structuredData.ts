import { excerptFromContent } from '../markdown';
import { imageSrc, priceSummary } from '../storefront';
import type { Product } from '../types';

// JSON-LD builders. Each describes only what the page shows (.claude/rules/seo.md): prices are
// the real VND integers, availability comes from stock minus reservations, and there is never an
// aggregateRating or review — the shop has no reviews. Output goes through <JsonLd>, which escapes it.

const IN_STOCK = 'https://schema.org/InStock';
const OUT_OF_STOCK = 'https://schema.org/OutOfStock';

export function productPath(slug: string): string {
  return `/san-pham/${encodeURIComponent(slug)}`;
}

export function categoryPath(slug: string): string {
  return `/danh-muc/${encodeURIComponent(slug)}`;
}

export function productJsonLd(base: string, product: Product): Record<string, unknown> {
  const url = `${base}${productPath(product.slug)}`;
  const summary = priceSummary(product.variants);
  const availability = summary && !summary.isOutOfStock ? IN_STOCK : OUT_OF_STOCK;
  const images = product.images.map((i) => imageSrc(i.url)).filter((u): u is string => u !== null);
  const prices = product.variants.map((v) => v.price);
  const single = product.variants.length === 1 ? product.variants[0] : null;

  const offers = single
    ? { '@type': 'Offer', url, price: single.price, priceCurrency: 'VND', availability }
    : {
        '@type': 'AggregateOffer',
        url,
        lowPrice: Math.min(...prices),
        highPrice: Math.max(...prices),
        offerCount: product.variants.length,
        priceCurrency: 'VND',
        availability,
      };

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    url,
    ...(product.description && { description: excerptFromContent(product.description, 300) }),
    ...(images.length > 0 && { image: images }),
    ...(single && { sku: single.sku }),
    ...(product.brand && { brand: { '@type': 'Brand', name: product.brand } }),
    ...(product.variants.length > 0 && { offers }),
  };
}

export type Crumb = { name: string; path?: string };

// The last crumb is the current page and carries no `item`, as Google's examples do.
export function breadcrumbJsonLd(base: string, crumbs: Crumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      ...(c.path && { item: `${base}${c.path}` }),
    })),
  };
}
