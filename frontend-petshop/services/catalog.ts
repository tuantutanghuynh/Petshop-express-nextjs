import { ApiRequestError, apiFetch } from '../lib/apiClient';
import { DEFAULT_SORT, type ProductSort } from '../lib/catalogParams';
import { BRAND_SLUG } from '../lib/site';
import { buildCategoryTree, categoryTrail, flattenTree, type CategoryNode } from '../lib/categoryTree';
import type { Category, PageMeta, Product } from '../lib/types';

// Catalogue reads for public pages. Every call is cached by Next (ISR) for REVALIDATE_SECONDS:
// the storefront is served from the cache and the Express API is asked at most once per window,
// instead of on every page view. Errors are NOT swallowed: during a build they fail it loudly,
// and on a background revalidation Next keeps serving the last good page.
const REVALIDATE_SECONDS = 300;
const MAX_PAGE_SIZE = 50; // backend cap for GET /products
export const CATEGORY_PAGE_SIZE = 24;

const cached = (tags: string[]) => ({ next: { revalidate: REVALIDATE_SECONDS, tags } });

export type ProductPage = { products: Product[]; total: number };

// One page of active products in a category (the backend includes every descendant category),
// optionally narrowed to one brand (mega menu "featured brands").
// A category that does not exist yields an empty page; callers decide whether that is a 404.
async function listProducts(
  categorySlug: string,
  page: number,
  pageSize: number,
  options: { sort?: ProductSort; q?: string; brand?: string } = {},
): Promise<ProductPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), categorySlug });
  if (options.sort && options.sort !== DEFAULT_SORT) params.set('sort', options.sort);
  if (options.q) params.set('q', options.q);
  if (options.brand) params.set('brand', options.brand);
  try {
    const { data, meta } = await apiFetch<Product[], PageMeta>(`/products?${params}`, cached(['products']));
    return { products: data, total: meta.total };
  } catch (err) {
    if (err instanceof ApiRequestError && err.code === 'CATEGORY_NOT_FOUND') return { products: [], total: 0 };
    throw err;
  }
}

export async function getNewestProducts(limit: number): Promise<Product[]> {
  return (await listProducts(BRAND_SLUG, 1, limit)).products;
}

export function getCategoryProducts(categorySlug: string, page: number, sort: ProductSort = DEFAULT_SORT, brand?: string): Promise<ProductPage> {
  return listProducts(categorySlug, page, CATEGORY_PAGE_SIZE, { sort, brand });
}

// Every product of this shop (the brand root includes every category below it), for /san-pham.
export function getAllShopProducts(page: number, sort: ProductSort = DEFAULT_SORT): Promise<ProductPage> {
  return listProducts(BRAND_SLUG, page, CATEGORY_PAGE_SIZE, { sort });
}

// Accent-insensitive search over this shop's products only (the brand root covers the whole tree).
// `category` (one of the shop's category slugs) narrows the search, from the header's select.
export function searchProducts(q: string, page: number, sort: ProductSort = DEFAULT_SORT, category?: string): Promise<ProductPage> {
  return listProducts(category ?? BRAND_SLUG, page, CATEGORY_PAGE_SIZE, { q, sort });
}

async function getAllCategories(): Promise<Category[]> {
  const { data } = await apiFetch<Category[]>('/categories', cached(['categories']));
  return data;
}

// The shop's category tree (children of the brand root, nested, in sortOrder).
export async function getShopCategoryTree(): Promise<CategoryNode[]> {
  return buildCategoryTree(await getAllCategories(), BRAND_SLUG);
}

// Top level of the tree (Chó, Mèo) with their subtrees: header, footer, homepage circles, search select.
export async function getShopCategories(): Promise<CategoryNode[]> {
  return getShopCategoryTree();
}

// Every category of the shop, at any depth, parents first (sitemap, product ownership).
export async function getShopCategoryList(): Promise<CategoryNode[]> {
  return flattenTree(await getShopCategoryTree());
}

// A category page exists for any category in our tree, at any depth. The database also holds other
// storefronts (legacy pottery brand); their slugs must answer 404 here, not render under our name.
export async function getShopCategory(slug: string): Promise<CategoryNode | null> {
  return (await getShopCategoryList()).find((c) => c.slug === slug) ?? null;
}

// Species → … → the category, for breadcrumbs; [] when the slug is not ours.
export async function getCategoryTrail(slug: string): Promise<CategoryNode[]> {
  return categoryTrail(await getShopCategoryTree(), slug);
}

// Current slug of a renamed category (ADR-017), or null when `slug` was never a category slug.
export async function resolveCategorySlug(slug: string): Promise<string | null> {
  try {
    const { data } = await apiFetch<{ slug: string }>(`/categories/resolve/${encodeURIComponent(slug)}`, cached(['categories']));
    return data.slug;
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) return null;
    throw err;
  }
}

// Product detail, or null when it does not exist, is not active (the API answers 404 for both)
// or belongs to another storefront.
export async function getShopProduct(slug: string): Promise<Product | null> {
  let product: Product;
  try {
    ({ data: product } = await apiFetch<Product>(`/products/${encodeURIComponent(slug)}`, cached(['products', `product:${slug}`])));
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) return null;
    throw err;
  }
  const isOurs = (await getShopCategoryList()).some((c) => c.id === product.category.id);
  return isOurs ? product : null;
}

// Every active product's slug and updatedAt, for the sitemap (walks all pages; the API caps at 50).
export async function getAllProductEntries(): Promise<{ slug: string; updatedAt: string }[]> {
  const out: { slug: string; updatedAt: string }[] = [];
  for (let page = 1; ; page += 1) {
    const { products, total } = await listProducts(BRAND_SLUG, page, MAX_PAGE_SIZE);
    out.push(...products.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt })));
    if (products.length === 0 || page * MAX_PAGE_SIZE >= total) return out;
  }
}
