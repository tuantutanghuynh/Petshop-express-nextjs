import 'server-only';
import { cookies, headers } from 'next/headers';
import { isSameOrigin } from '../bff/origin';
import { clientIpFrom } from '../bff/clientIp';
import type { BffResult, CookieJar, RequestContext } from '../bff/session';
import { siteUrl } from '../site';

// Glue between Next's request APIs and the BFF core (lib/bff/session.ts). `server-only` makes the
// build fail if a Client Component ever imports this file — it touches the session cookies and,
// through the core, INTERNAL_API_SECRET.

export async function sessionJar(): Promise<CookieJar> {
  const store = await cookies();
  return {
    get: (name) => store.get(name)?.value,
    set: (name, value, options) => store.set(name, value, options),
  };
}

export async function requestContext(): Promise<RequestContext> {
  return { clientIp: clientIpFrom(await headers()) };
}

// Customer data must never be cached by the browser, a CDN or Next.
export function toResponse(result: BffResult): Response {
  if (result.status === 204) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}

// CSRF guard for every write handler: null when the request may proceed.
export function rejectCrossOrigin(request: Request): Response | null {
  if (isSameOrigin(request.headers.get('origin'), siteUrl())) return null;
  return toResponse({
    status: 403,
    body: { data: null, meta: null, error: { code: 'CROSS_ORIGIN', message: 'Yêu cầu không hợp lệ', details: null } },
  });
}

// Reads a JSON body, or null for a malformed one (answered as 400 by the caller).
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function badRequest(): Response {
  return toResponse({
    status: 400,
    body: { data: null, meta: null, error: { code: 'BAD_REQUEST', message: 'Dữ liệu gửi lên không hợp lệ', details: null } },
  });
}
