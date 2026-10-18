import type { MetadataRoute } from 'next';

export type SitemapPost = { slug: string; updatedAt: string };

// Public pages that exist today. Product and category pages join this list when they are built —
// a sitemap must never point at URLs that answer 404.
const STATIC_PATHS = ['', '/blog', '/gallery'];

// Sitemap entries. lastModified is only set where a real modification date exists (a post's
// updatedAt). Stamping every URL with "now", as the old file did, tells crawlers that every page
// changes on every build — a signal they learn to ignore, which costs the real dates their value.
export function buildSitemap(base: string, posts: SitemapPost[]): MetadataRoute.Sitemap {
  return [
    ...STATIC_PATHS.map((path) => ({ url: `${base}${path}` })),
    ...posts.map((p) => ({ url: `${base}/blog/${encodeURIComponent(p.slug)}`, lastModified: p.updatedAt })),
  ];
}
