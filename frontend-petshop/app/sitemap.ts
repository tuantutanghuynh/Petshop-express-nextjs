import type { MetadataRoute } from 'next';
import { buildSitemap, type SitemapCatalog, type SitemapPost } from '../lib/seo/sitemap';
import { siteUrl } from '../lib/site';
import { getAllProductEntries, getShopCategoryList } from '../services/catalog';
import { getAllPostEntries, getContentPages } from '../services/content';

// sitemap.ts is cached by default; without this a new post would only appear after the next build.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Each source fails on its own: with the API down the sitemap still lists what it can rather than
  // answering 500, which makes crawlers drop the whole file. Logged, not swallowed — the next
  // revalidation retries.
  const [[postsRes, productsRes, categoriesRes], pages] = await Promise.all([
    Promise.allSettled([getAllPostEntries(), getAllProductEntries(), getShopCategoryList()]),
    getContentPages(), // never throws
  ]);
  const pick = <T,>(r: PromiseSettledResult<T>, label: string, fallback: T): T => {
    if (r.status === 'fulfilled') return r.value;
    console.error(`sitemap: could not load ${label}`, r.reason);
    return fallback;
  };
  const posts: SitemapPost[] = pick(postsRes, 'blog posts', []);
  const catalog: SitemapCatalog = {
    products: pick(productsRes, 'products', []),
    categories: pick(categoriesRes, 'categories', []),
    pages: pages.map((p) => p.path),
  };
  return buildSitemap(siteUrl(), posts, catalog);
}
