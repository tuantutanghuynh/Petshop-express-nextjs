import { authFetch } from '../../../lib/adminAuth';
import { revalidateStorefront } from '../../../lib/adminRevalidate';
import { BRAND_SLUG } from '../../../lib/site';
import type { ApiEnvelope } from '../../../lib/types';

// Product admin calls carry X-Brand-Slug: the backend answers 404 for anything outside this shop.
export function productApi<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  return authFetch<T>(`/products${path}`, { ...init, headers: { 'X-Brand-Slug': BRAND_SLUG } });
}

export const jsonBody = (method: 'POST' | 'PATCH', body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

// Product, category and home pages (featured products) all show product data.
export const refreshProducts = () => revalidateStorefront(['products', 'categories']);
