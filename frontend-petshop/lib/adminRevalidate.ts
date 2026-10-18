import { getToken } from './adminAuth';

// After an admin save, refresh the cached storefront pages that show it (POST /api/revalidate,
// which checks with the backend that this token belongs to an admin). Called right after a
// successful authFetch, so the token has just been used or refreshed. A failure is only logged:
// the save itself succeeded, and the cache expires on its own within 5 minutes.
export async function revalidateStorefront(tags: Array<'blog' | 'gallery' | 'products' | 'categories' | 'settings'>): Promise<void> {
  try {
    const res = await fetch('/api/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
      body: JSON.stringify({ tags }),
    });
    if (!res.ok) console.warn('revalidateStorefront: refresh refused', res.status);
  } catch (err) {
    console.warn('revalidateStorefront: refresh failed', err);
  }
}
