// URL state for catalogue lists (test/catalogParams.test.ts). The URL is the source of truth for
// sort, page and search, so links are shareable, back/forward works and the server renders the
// right list. Defaults are left out of the URL: each list state has exactly one address.

// Same whitelist as the backend (backend/utils/searchText.ts PRODUCT_SORTS).
export const PRODUCT_SORTS = ['-createdAt', 'price', '-price'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];
export const DEFAULT_SORT: ProductSort = '-createdAt';

export const SORT_LABELS: Record<ProductSort, string> = {
  '-createdAt': 'Mới nhất',
  price: 'Giá thấp → cao',
  '-price': 'Giá cao → thấp',
};

// The default is never written in the URL, so "?sort=-createdAt" is not a second address for page 1.
export function parseSortParam(raw: string | string[] | undefined): ProductSort | null {
  if (raw === undefined) return DEFAULT_SORT;
  if (typeof raw !== 'string' || raw === DEFAULT_SORT) return null;
  return (PRODUCT_SORTS as readonly string[]).includes(raw) ? (raw as ProductSort) : null;
}

export function listHref(basePath: string, state: { q?: string; sort?: ProductSort; page?: number }): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.sort && state.sort !== DEFAULT_SORT) params.set('sort', state.sort);
  if (state.page && state.page > 1) params.set('page', String(state.page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

// A search term the backend accepts (2–100 characters once whitespace is trimmed), or null.
export function parseSearchQuery(raw: string | string[] | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const q = raw.trim().replace(/\s+/g, ' ');
  return q.length >= 2 && q.length <= 100 ? q : null;
}
