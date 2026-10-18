// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cookieNames, cookieOptions, type CookieOptions } from '../lib/bff/cookies';
import { clientIpFrom } from '../lib/bff/clientIp';
import { isSameOrigin } from '../lib/bff/origin';
import { login, logout, optionalSession, proxy, refresh, type CookieJar } from '../lib/bff/session';

// The Next.js BFF keeps the customer's tokens in httpOnly cookies and relays calls to Express.
// Rules under test:
//   - tokens never reach the browser (not in any JSON body), only in httpOnly cookies;
//   - only POST /api/auth/refresh rotates the refresh token (it is single-use with no grace period:
//     two concurrent refreshes log the customer out), every other route answers ACCESS_EXPIRED;
//   - refresh is a no-op when a fresh access cookie already exists (another tab just refreshed);
//   - every relayed call carries Authorization, X-Brand-Slug, X-Internal-Secret and X-Client-IP;
//   - writes must come from our own origin (CSRF).

const API = 'http://api.test/api/v1';

// Behaves like a browser: a cookie written with maxAge 0 is removed.
class MemoryJar implements CookieJar {
  store = new Map<string, string>();
  writes: Array<{ name: string; options: CookieOptions }> = [];
  get(name: string) { return this.store.get(name); }
  set(name: string, value: string, options?: CookieOptions) {
    if (options) this.writes.push({ name, options });
    if (options?.maxAge === 0) this.store.delete(name); else this.store.set(name, value);
  }
}

type Call = { url: string; init: RequestInit };
let calls: Call[];

function backend(...responses: Array<[number, unknown]>) {
  calls = [];
  const queue = [...responses];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const [status, body] = queue.shift() ?? [500, { data: null, error: { code: 'NO_MOCK' } }];
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }));
}

const header = (c: Call, name: string) => new Headers(c.init.headers).get(name);
const names = cookieNames(false);
const ctx = { clientIp: '203.0.113.7' };

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', API);
  vi.stubEnv('INTERNAL_API_SECRET', 'srv-secret');
  vi.stubEnv('NEXT_PUBLIC_BRAND_SLUG', 'petshop');
  vi.stubEnv('APP_ENV', 'development');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('cookies', () => {
  it('uses the __Host- prefix and Secure only in production', () => {
    expect(cookieNames(true).access).toBe('__Host-sc_at');
    expect(cookieNames(false).access).toBe('sc_at');
    expect(cookieOptions(true, 60)).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 });
    expect(cookieOptions(false, 60)).toMatchObject({ httpOnly: true, secure: false });
  });
});

describe('clientIpFrom', () => {
  it('takes the first valid address of X-Forwarded-For, then X-Real-IP', () => {
    expect(clientIpFrom(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
    expect(clientIpFrom(new Headers({ 'x-real-ip': '2001:db8::1' }))).toBe('2001:db8::1');
    expect(clientIpFrom(new Headers({ 'x-forwarded-for': 'garbage' }))).toBeUndefined();
    expect(clientIpFrom(new Headers())).toBeUndefined();
  });
});

describe('isSameOrigin', () => {
  it('accepts only our own origin', () => {
    expect(isSameOrigin('https://shop.vn', 'https://shop.vn')).toBe(true);
    expect(isSameOrigin('https://evil.example', 'https://shop.vn')).toBe(false);
    expect(isSameOrigin('https://shop.vn.evil.example', 'https://shop.vn')).toBe(false);
    expect(isSameOrigin(null, 'https://shop.vn')).toBe(false);
  });
});

describe('login', () => {
  it('stores both tokens in cookies and returns only the user', async () => {
    backend([200, { data: { user: { id: 'u1', email: 'a@b.vn' }, accessToken: 'AT', refreshToken: 'RT' }, meta: null, error: null }]);
    const jar = new MemoryJar();
    const res = await login(jar, { email: 'a@b.vn', password: 'x' }, ctx);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { user: { id: 'u1', email: 'a@b.vn' } }, meta: null, error: null });
    expect(JSON.stringify(res.body)).not.toMatch(/AT|RT/);
    expect(jar.get(names.access)).toBe('AT');
    expect(jar.get(names.refresh)).toBe('RT');
    expect(calls[0].url).toBe(`${API}/auth/login`);
    expect(header(calls[0], 'X-Client-IP')).toBe('203.0.113.7');
    expect(header(calls[0], 'X-Internal-Secret')).toBe('srv-secret');
  });

  it('passes backend errors through and sets no cookie', async () => {
    backend([429, { data: null, meta: null, error: { code: 'RATE_LIMITED', message: 'm' } }]);
    const jar = new MemoryJar();
    const res = await login(jar, { email: 'a@b.vn', password: 'x' }, ctx);
    expect(res.status).toBe(429);
    expect(res.body.error).toMatchObject({ code: 'RATE_LIMITED' });
    expect(jar.store.size).toBe(0);
  });
});

describe('proxy', () => {
  it('relays with the access token, brand and visitor IP', async () => {
    backend([200, { data: { items: [] }, meta: null, error: null }]);
    const jar = new MemoryJar();
    jar.set(names.access, 'AT');
    const res = await proxy(jar, { path: '/cart', method: 'GET' }, ctx);
    expect(res.status).toBe(200);
    expect(calls[0].url).toBe(`${API}/cart`);
    expect(header(calls[0], 'Authorization')).toBe('Bearer AT');
    expect(header(calls[0], 'X-Brand-Slug')).toBe('petshop');
    expect(header(calls[0], 'X-Client-IP')).toBe('203.0.113.7');
  });

  it('forwards an Idempotency-Key when given', async () => {
    backend([201, { data: {}, meta: null, error: null }]);
    const jar = new MemoryJar();
    jar.set(names.access, 'AT');
    await proxy(jar, { path: '/orders', method: 'POST', body: {}, idempotencyKey: 'k_12345678' }, ctx);
    expect(header(calls[0], 'Idempotency-Key')).toBe('k_12345678');
  });

  it('answers ACCESS_EXPIRED without calling the backend when only the refresh cookie is left', async () => {
    backend();
    const jar = new MemoryJar();
    jar.set(names.refresh, 'RT');
    const res = await proxy(jar, { path: '/cart', method: 'GET' }, ctx);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: 'ACCESS_EXPIRED' });
    expect(calls).toHaveLength(0);
    expect(jar.get(names.refresh)).toBe('RT'); // never rotated here
  });

  it('answers UNAUTHENTICATED when there is no session at all', async () => {
    backend();
    const res = await proxy(new MemoryJar(), { path: '/cart', method: 'GET' }, ctx);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('drops an access token the backend rejects, so the client refreshes', async () => {
    backend([401, { data: null, meta: null, error: { code: 'INVALID_TOKEN' } }]);
    const jar = new MemoryJar();
    jar.set(names.access, 'AT');
    jar.set(names.refresh, 'RT');
    const res = await proxy(jar, { path: '/cart', method: 'GET' }, ctx);
    expect(res.body.error).toMatchObject({ code: 'ACCESS_EXPIRED' });
    expect(jar.get(names.access)).toBeUndefined();
    expect(jar.get(names.refresh)).toBe('RT');
  });
});

describe('refresh', () => {
  it('is a no-op while a fresh access cookie exists (another tab already refreshed)', async () => {
    backend();
    const jar = new MemoryJar();
    jar.set(names.access, 'AT');
    jar.set(names.refresh, 'RT');
    const res = await refresh(jar, ctx);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it('rotates both cookies', async () => {
    backend([200, { data: { accessToken: 'AT2', refreshToken: 'RT2' }, meta: null, error: null }]);
    const jar = new MemoryJar();
    jar.set(names.refresh, 'RT');
    const res = await refresh(jar, ctx);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/AT2|RT2/);
    expect(jar.get(names.access)).toBe('AT2');
    expect(jar.get(names.refresh)).toBe('RT2');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ refreshToken: 'RT' });
  });

  it('ends the session when the backend refuses the refresh token', async () => {
    backend([401, { data: null, meta: null, error: { code: 'INVALID_REFRESH_TOKEN' } }]);
    const jar = new MemoryJar();
    jar.set(names.refresh, 'RT');
    const res = await refresh(jar, ctx);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(jar.store.size).toBe(0);
  });
});

describe('logout', () => {
  // A __Host- cookie is only accepted — and so only removed — by a Set-Cookie that carries Secure
  // and Path=/. Next's cookies().delete() omits Secure, so in production the "deleted" cookies
  // survived and the customer stayed logged in after logging out.
  it('expires the production cookies with the same attributes they were set with', async () => {
    vi.stubEnv('APP_ENV', 'production');
    backend([200, { data: {}, meta: null, error: null }]);
    const jar = new MemoryJar();
    const prod = cookieNames(true);
    jar.store.set(prod.access, 'AT');
    jar.store.set(prod.refresh, 'RT');
    await logout(jar, ctx);
    expect(jar.store.size).toBe(0);
    for (const name of [prod.access, prod.refresh]) {
      expect(jar.writes).toContainEqual({ name, options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 } });
    }
  });

  it('revokes the refresh token and clears the cookies even if the backend fails', async () => {
    backend([500, { data: null, meta: null, error: { code: 'INTERNAL' } }]);
    const jar = new MemoryJar();
    jar.set(names.access, 'AT');
    jar.set(names.refresh, 'RT');
    const res = await logout(jar, ctx);
    expect(res.status).toBe(200);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ refreshToken: 'RT' });
    expect(jar.store.size).toBe(0);
  });
});

// GET /api/cart runs on every storefront page for every visitor. Answering a visitor who has no
// session with 401 printed a red "Failed to load resource" in every console (Lighthouse
// errors-in-console) for a perfectly normal situation. A visitor gets 200 with data: null; an
// expired access token still answers 401 ACCESS_EXPIRED, which the client needs to refresh.
describe('optionalSession', () => {
  it('turns "no session at all" into an empty 200', async () => {
    backend();
    const res = optionalSession(await proxy(new MemoryJar(), { path: '/cart', method: 'GET' }, ctx));
    expect(res).toEqual({ status: 200, body: { data: null, meta: { signedIn: false }, error: null } });
  });

  it('keeps ACCESS_EXPIRED as 401 so the client refreshes', async () => {
    backend();
    const jar = new MemoryJar();
    jar.store.set(names.refresh, 'RT');
    const res = optionalSession(await proxy(jar, { path: '/cart', method: 'GET' }, ctx));
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: 'ACCESS_EXPIRED' });
  });
});
