import { BRAND_SLUG } from '../site';
import { ACCESS_MAX_AGE, REFRESH_MAX_AGE, cookieNames, cookieOptions, isProduction, type CookieOptions } from './cookies';

// Core of the Next.js BFF, written against a small cookie-jar interface so it is unit tested
// (test/bff.test.ts); the route handlers in app/api only plug in Next's cookies().
//
// Refresh tokens are single-use with no grace period (backend/services/token.service.ts): if two
// requests refresh with the same token, the second looks like a replay and the backend revokes
// every session of that customer. So exactly ONE place rotates the token — refresh() below,
// reached only through POST /api/auth/refresh — and the browser client serialises those calls.
// Everything else answers ACCESS_EXPIRED and lets the client refresh and retry.

// No delete(): Next's cookies().delete() writes a Set-Cookie without Secure, which browsers reject
// for a __Host- cookie — the cookie silently survives and the customer stays logged in after
// logout. Cookies are removed by expire() instead, with the same attributes they were set with.
export interface CookieJar {
  get(name: string): string | undefined;
  set(name: string, value: string, options: CookieOptions): void;
}

function expire(jar: CookieJar, name: string): void {
  jar.set(name, '', cookieOptions(isProduction(), 0));
}

export type RequestContext = { clientIp?: string };

export type Envelope = { data: unknown; meta: unknown; error: { code: string; message?: string; details?: unknown } | null };
export type BffResult = { status: number; body: Envelope };

const ok = (data: unknown, status = 200): BffResult => ({ status, body: { data, meta: null, error: null } });
const fail = (status: number, code: string, message: string): BffResult => ({
  status,
  body: { data: null, meta: null, error: { code, message, details: null } },
});

const ACCESS_EXPIRED = () => fail(401, 'ACCESS_EXPIRED', 'Phiên đăng nhập cần làm mới');
const UNAUTHENTICATED = () => fail(401, 'UNAUTHENTICATED', 'Vui lòng đăng nhập');

type BackendCall = {
  path: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  accessToken?: string;
  idempotencyKey?: string;
};

// One request to Express. X-Internal-Secret + X-Client-IP tell it this is a visitor's action relayed
// by our server: it is rate limited by that visitor (backend/middlewares/rateLimitKeys.ts).
async function callBackend(call: BackendCall, ctx: RequestContext): Promise<BffResult> {
  const headers = new Headers({ Accept: 'application/json', 'X-Brand-Slug': BRAND_SLUG });
  if (call.body !== undefined) headers.set('Content-Type', 'application/json');
  if (call.accessToken) headers.set('Authorization', `Bearer ${call.accessToken}`);
  if (call.idempotencyKey) headers.set('Idempotency-Key', call.idempotencyKey);
  const secret = process.env.INTERNAL_API_SECRET;
  if (secret) headers.set('X-Internal-Secret', secret);
  if (ctx.clientIp) headers.set('X-Client-IP', ctx.clientIp);

  let res: Response;
  try {
    res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${call.path}`, {
      method: call.method,
      headers,
      body: call.body === undefined ? undefined : JSON.stringify(call.body),
      cache: 'no-store',
    });
  } catch (err) {
    console.error('bff: backend unreachable', err);
    return fail(502, 'BACKEND_UNAVAILABLE', 'Hệ thống đang bận, vui lòng thử lại sau ít phút');
  }
  if (res.status === 204) return { status: 204, body: { data: null, meta: null, error: null } };
  try {
    return { status: res.status, body: (await res.json()) as Envelope };
  } catch {
    return fail(502, 'BAD_BACKEND_RESPONSE', 'Hệ thống đang bận, vui lòng thử lại sau ít phút');
  }
}

function saveTokens(jar: CookieJar, accessToken: string, refreshToken: string): void {
  const names = cookieNames();
  const production = isProduction();
  jar.set(names.access, accessToken, cookieOptions(production, ACCESS_MAX_AGE));
  jar.set(names.refresh, refreshToken, cookieOptions(production, REFRESH_MAX_AGE));
}

function clearTokens(jar: CookieJar): void {
  const names = cookieNames();
  expire(jar, names.access);
  expire(jar, names.refresh);
}

type TokenPayload = { user?: unknown; accessToken?: unknown; refreshToken?: unknown };

// Login / register: on success the tokens go into cookies and only the user goes back to the browser.
async function signIn(jar: CookieJar, path: string, credentials: unknown, ctx: RequestContext, successStatus: number): Promise<BffResult> {
  const res = await callBackend({ path, method: 'POST', body: credentials }, ctx);
  if (res.status >= 400) return res;
  const data = (res.body.data ?? {}) as TokenPayload;
  if (typeof data.accessToken !== 'string' || typeof data.refreshToken !== 'string') {
    return fail(502, 'BAD_BACKEND_RESPONSE', 'Hệ thống đang bận, vui lòng thử lại sau ít phút');
  }
  saveTokens(jar, data.accessToken, data.refreshToken);
  return ok({ user: data.user }, successStatus);
}

export function login(jar: CookieJar, credentials: unknown, ctx: RequestContext): Promise<BffResult> {
  return signIn(jar, '/auth/login', credentials, ctx, 200);
}

export function register(jar: CookieJar, details: unknown, ctx: RequestContext): Promise<BffResult> {
  return signIn(jar, '/auth/register', details, ctx, 201);
}

// The only place that rotates the refresh token. A no-op while an access cookie exists: another
// tab (sharing these cookies) refreshed a moment ago, and rotating again would spend the token the
// backend just issued — the replay that logs the customer out everywhere.
export async function refresh(jar: CookieJar, ctx: RequestContext): Promise<BffResult> {
  const names = cookieNames();
  if (jar.get(names.access)) return ok({ refreshed: false });
  const refreshToken = jar.get(names.refresh);
  if (!refreshToken) return UNAUTHENTICATED();

  const res = await callBackend({ path: '/auth/refresh', method: 'POST', body: { refreshToken } }, ctx);
  const data = (res.body.data ?? {}) as TokenPayload;
  if (res.status !== 200 || typeof data.accessToken !== 'string' || typeof data.refreshToken !== 'string') {
    if (res.status >= 500) return res; // backend trouble: keep the session, the client may retry
    clearTokens(jar);
    return UNAUTHENTICATED();
  }
  saveTokens(jar, data.accessToken, data.refreshToken);
  return ok({ refreshed: true });
}

// Always ends the local session, even when the backend call fails: the customer asked to log out.
export async function logout(jar: CookieJar, ctx: RequestContext): Promise<BffResult> {
  const refreshToken = jar.get(cookieNames().refresh);
  if (refreshToken) await callBackend({ path: '/auth/logout', method: 'POST', body: { refreshToken } }, ctx);
  clearTokens(jar);
  return ok({ loggedOut: true });
}

// A customer call relayed with the access token. Never refreshes (see the header comment).
export async function proxy(jar: CookieJar, call: Omit<BackendCall, 'accessToken'>, ctx: RequestContext): Promise<BffResult> {
  const names = cookieNames();
  const accessToken = jar.get(names.access);
  if (!accessToken) return jar.get(names.refresh) ? ACCESS_EXPIRED() : UNAUTHENTICATED();

  const res = await callBackend({ ...call, accessToken }, ctx);
  if (res.status === 401) {
    // The backend refused a token our cookie still holds (revoked, or a changed signing secret).
    expire(jar, names.access);
    return jar.get(names.refresh) ? ACCESS_EXPIRED() : UNAUTHENTICATED();
  }
  return res;
}

// For reads every page makes (the cart badge): a visitor with no session at all is a normal case,
// answered 200 with data: null instead of a 401 the browser logs as an error. ACCESS_EXPIRED stays
// 401 — the client needs it to refresh.
export function optionalSession(result: BffResult): BffResult {
  if (result.status === 401 && result.body.error?.code === 'UNAUTHENTICATED') {
    return { status: 200, body: { data: null, meta: { signedIn: false }, error: null } };
  }
  return result;
}

// Forms open to visitors (quote request, contact). Relayed with the brand and the visitor's IP; the
// access token is added when present so a signed-in customer's request is linked to the account
// (the backend's optionalAuthenticate ignores a token it cannot verify). Never refreshes.
export async function relayPublic(jar: CookieJar, call: Omit<BackendCall, 'accessToken'>, ctx: RequestContext): Promise<BffResult> {
  return callBackend({ ...call, accessToken: jar.get(cookieNames().access) }, ctx);
}
