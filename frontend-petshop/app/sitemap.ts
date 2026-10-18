import type { MetadataRoute } from 'next';
import { buildSitemap, type SitemapPost } from '../lib/seo/sitemap';
import { siteUrl } from '../lib/site';
import { getAllPostEntries } from '../services/content';

// sitemap.ts is cached by default; without this a new post would only appear after the next build.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let posts: SitemapPost[] = [];
  try {
    posts = await getAllPostEntries();
  } catch (err) {
    // API down: still serve the static pages rather than a 500 that makes crawlers drop the file.
    // Logged, not swallowed — the next revalidation retries.
    console.error('sitemap: could not load blog posts', err);
  }
  return buildSitemap(siteUrl(), posts);
}
