import { afterEach, describe, expect, it, vi } from 'vitest';
import { bffFetch } from '../lib/bffClient';

// Browser side of the BFF. The refresh token is single-use: if the cart page fires five requests
// at once and they all find the access token expired, they must share ONE refresh — five would
// make the backend see replays and log the customer out of every device.

type Handler = (url: string, init?: RequestInit) => { status: number; body: unknown };

function stubFetch(handler: Handler) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const { status, body } = handler(url, init);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const envelope = (data: unknown) => ({ data, meta: null, error: null });
const error = (code: string) => ({ data: null, meta: null, error: { code, message: code } });

afterEach(() => vi.unstubAllGlobals());

describe('bffFetch', () => {
  it('returns the envelope of a successful call', async () => {
    stubFetch(() => ({ status: 200, body: envelope({ items: [] }) }));
    await expect(bffFetch('/api/cart')).resolves.toEqual({ ok: true, status: 200, data: { items: [] }, error: null });
  });

  it('shares one refresh between concurrent calls, then retries each once', async () => {
    let refreshed = false;
    const fn = stubFetch((url) => {
      if (url === '/api/auth/refresh') { refreshed = true; return { status: 200, body: envelope({ refreshed: true }) }; }
      return refreshed ? { status: 200, body: envelope({ url }) } : { status: 401, body: error('ACCESS_EXPIRED') };
    });
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => bffFetch(`/api/cart?n=${n}`)));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(fn.mock.calls.filter(([u]) => u === '/api/auth/refresh')).toHaveLength(1);
  });

  it('reports UNAUTHENTICATED when the refresh fails, without looping', async () => {
    const fn = stubFetch((url) => (url === '/api/auth/refresh' ? { status: 401, body: error('UNAUTHENTICATED') } : { status: 401, body: error('ACCESS_EXPIRED') }));
    const res = await bffFetch('/api/cart');
    expect(res).toMatchObject({ ok: false, status: 401, error: { code: 'UNAUTHENTICATED' } });
    expect(fn).toHaveBeenCalledTimes(2); // the call + one refresh, no retry
  });

  it('sends JSON bodies and the same-origin credentials', async () => {
    const fn = stubFetch(() => ({ status: 201, body: envelope({}) }));
    await bffFetch('/api/cart/items', { method: 'POST', body: { variantId: 'v', quantity: 1 } });
    const init = fn.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe('same-origin');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ variantId: 'v', quantity: 1 }));
  });

  it('turns a network failure into an error result instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(bffFetch('/api/cart')).resolves.toMatchObject({ ok: false, status: 0, error: { code: 'NETWORK_ERROR' } });
  });
});
