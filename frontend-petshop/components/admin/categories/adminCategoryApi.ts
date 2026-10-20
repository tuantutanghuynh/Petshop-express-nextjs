import { authFetch } from '../../../lib/adminAuth';
import { revalidateStorefront } from '../../../lib/adminRevalidate';
import { BRAND_SLUG } from '../../../lib/site';
import type { ApiEnvelope } from '../../../lib/types';

// Category admin calls carry X-Brand-Slug: the backend limits every change to this shop's tree.
export function categoryApi<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  return authFetch<T>(`/categories${path}`, { ...init, headers: { 'X-Brand-Slug': BRAND_SLUG } });
}

// Menus, category pages, product breadcrumbs and the sitemap all read categories.
export const refreshStorefront = () => revalidateStorefront(['categories', 'products']);
