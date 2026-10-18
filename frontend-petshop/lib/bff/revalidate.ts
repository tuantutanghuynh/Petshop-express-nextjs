import type { RequestContext } from './session';

// Core of POST /api/revalidate (unit tested in test/revalidate.test.ts). The admin pages call it
// right after saving so the cached storefront shows the change at once instead of after the
// 5-minute cache window. The caller must be an admin: the bearer token is checked by asking the
// backend who it belongs to — the role is never read from the request itself. Only known cache
// tags can be refreshed; anything else is refused before the backend is called.

export const REVALIDATE_TAGS = ['blog', 'gallery', 'products', 'categories', 'settings'] as const;
type Tag = (typeof REVALIDATE_TAGS)[number];

export type RevalidateDecision = { ok: true; tags: Tag[] } | { ok: false; status: number; code: string };

const isTag = (t: unknown): t is Tag => typeof t === 'string' && (REVALIDATE_TAGS as readonly string[]).includes(t);

function parseTags(body: unknown): Tag[] | null {
  if (typeof body !== 'object' || body === null) return null;
  const tags = (body as { tags?: unknown }).tags;
  if (!Array.isArray(tags) || tags.length === 0 || !tags.every(isTag)) return null;
  return [...new Set(tags)];
}

export async function authorizeRevalidate(authorization: string | null, body: unknown, ctx: RequestContext): Promise<RevalidateDecision> {
  const tags = parseTags(body);
  if (!tags) return { ok: false, status: 400, code: 'BAD_REQUEST' };
  if (!authorization?.startsWith('Bearer ')) return { ok: false, status: 401, code: 'UNAUTHENTICATED' };

  const headers = new Headers({ Accept: 'application/json', Authorization: authorization });
  const secret = process.env.INTERNAL_API_SECRET;
  if (secret) headers.set('X-Internal-Secret', secret);
  if (ctx.clientIp) headers.set('X-Client-IP', ctx.clientIp);

  let res: Response;
  try {
    res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, { headers, cache: 'no-store' });
  } catch (err) {
    console.error('revalidate: backend unreachable', err);
    return { ok: false, status: 502, code: 'BACKEND_UNAVAILABLE' };
  }
  const role = res.ok ? ((await res.json().catch(() => null)) as { data?: { role?: unknown } } | null)?.data?.role : undefined;
  if (role !== 'admin') return { ok: false, status: 403, code: 'FORBIDDEN' };
  return { ok: true, tags };
}
