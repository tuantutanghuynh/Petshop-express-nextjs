import { ApiRequestError, apiFetch } from '../lib/apiClient';
import { BRAND_SLUG } from '../lib/site';
import type { Category, PageMeta, Product } from '../lib/types';

// Catalogue reads for public pages. Every call is cached by Next (ISR) for REVALIDATE_SECONDS:
// the storefront is served from the cache and the Express API is asked at most once per window,
// instead of on every page view. Errors are NOT swallowed: during a build they fail it loudly,
// and on a background revalidation Next keeps serving the last good page.
const REVALIDATE_SECONDS = 300;

export async function getNewestProducts(limit: number): Promise<Product[]> {
  const { data } = await apiFetch<Product[], PageMeta>(
    `/products?page=1&pageSize=${limit}&categorySlug=${encodeURIComponent(BRAND_SLUG)}`,
    { next: { revalidate: REVALIDATE_SECONDS, tags: ['products'] } },
  ).catch((err: unknown) => {
    // The brand root does not exist yet (fresh database): show an empty catalogue, not an error page.
    if (err instanceof ApiRequestError && err.code === 'CATEGORY_NOT_FOUND') return { data: [] as Product[] };
    throw err;
  });
  return data;
}

// The shop's own categories: the children of the brand root category.
export async function getShopCategories(): Promise<Category[]> {
  const { data } = await apiFetch<Category[]>('/categories', {
    next: { revalidate: REVALIDATE_SECONDS, tags: ['categories'] },
  });
  const root = data.find((c) => c.parentId === null && c.slug === BRAND_SLUG);
  return root ? data.filter((c) => c.parentId === root.id) : [];
}
