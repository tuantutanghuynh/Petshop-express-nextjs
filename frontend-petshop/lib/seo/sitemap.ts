import type { MetadataRoute } from 'next';
import { categoryPath, productPath } from './structuredData';

export type SitemapPost = { slug: string; updatedAt: string };
export type SitemapCatalog = {
  products: { slug: string; updatedAt: string }[];
  categories: { slug: string }[];
  // Owner-written pages that have text (about, policies); empty ones answer 404 and stay out.
  pages?: string[];
};

// Public pages that exist today. A sitemap must never point at URLs that answer 404.
const STATIC_PATHS = ['', '/san-pham', '/blog', '/gallery', '/lien-he'];

// Sitemap entries. lastModified is only set where a real modification date exists (a post's or
// product's updatedAt). Stamping every URL with "now", as the old file did, tells crawlers that every
// page changes on every build — a signal they learn to ignore, which costs the real dates their value.
// Categories have no updatedAt column, so they get no date. Paginated URLs (?page=N) are never listed.
export function buildSitemap(
  base: string,
  posts: SitemapPost[],
  catalog: SitemapCatalog = { products: [], categories: [] },
): MetadataRoute.Sitemap {
  return [
    ...STATIC_PATHS.map((path) => ({ url: `${base}${path}` })),
    ...(catalog.pages ?? []).map((path) => ({ url: `${base}${path}` })),
    ...catalog.categories.map((c) => ({ url: `${base}${categoryPath(c.slug)}` })),
    ...catalog.products.map((p) => ({ url: `${base}${productPath(p.slug)}`, lastModified: p.updatedAt })),
    ...posts.map((p) => ({ url: `${base}/blog/${encodeURIComponent(p.slug)}`, lastModified: p.updatedAt })),
  ];
}
