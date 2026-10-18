// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeRevalidate } from '../lib/bff/revalidate';

// POST /api/revalidate lets the admin pages refresh the cached storefront right after a save.
// Only an admin may call it (checked against the backend, never trusted from the request), and only
// for known cache tags.

let calls: Array<{ url: string; init: RequestInit }>;
function backend(status: number, body: unknown) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }));
}

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.test/api/v1'));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const admin = { data: { id: 'a', role: 'admin' }, meta: null, error: null };

describe('authorizeRevalidate', () => {
  it('accepts an admin token and known tags', async () => {
    backend(200, admin);
    const res = await authorizeRevalidate('Bearer AT', { tags: ['blog', 'gallery'] }, {});
    expect(res).toEqual({ ok: true, tags: ['blog', 'gallery'] });
    expect(calls[0].url).toBe('http://api.test/api/v1/auth/me');
    expect(new Headers(calls[0].init.headers).get('Authorization')).toBe('Bearer AT');
  });

  it('refuses a customer token', async () => {
    backend(200, { data: { id: 'c', role: 'customer' }, meta: null, error: null });
    expect(await authorizeRevalidate('Bearer AT', { tags: ['blog'] }, {})).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses a missing or rejected token without trusting the request', async () => {
    backend(401, { data: null, error: { code: 'INVALID_TOKEN' } });
    expect(await authorizeRevalidate(null, { tags: ['blog'] }, {})).toMatchObject({ ok: false, status: 401 });
    expect(calls).toHaveLength(0);
    expect(await authorizeRevalidate('Bearer bad', { tags: ['blog'] }, {})).toMatchObject({ ok: false, status: 403 });
  });

  it('accepts only known tags, and at least one', async () => {
    backend(200, admin);
    for (const body of [{ tags: ['users'] }, { tags: [] }, { tags: 'blog' }, null, { tags: ['blog', 1] }]) {
      expect(await authorizeRevalidate('Bearer AT', body, {})).toMatchObject({ ok: false, status: 400 });
    }
    expect(calls).toHaveLength(0); // the body is checked before the backend is asked
  });

  it('reports an unreachable backend as 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('down'); }));
    expect(await authorizeRevalidate('Bearer AT', { tags: ['blog'] }, {})).toMatchObject({ ok: false, status: 502 });
  });
});
