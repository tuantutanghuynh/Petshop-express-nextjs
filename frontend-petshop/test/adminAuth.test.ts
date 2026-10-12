import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authFetch, clearTokens, getRefreshToken, getToken, setTokens } from '../lib/adminAuth';

type Call = { url: string; headers: Record<string, string> };

// Fake backend: any request carrying the old access token gets 401; refresh hands out a new pair.
function installBackend(options: { refreshOk?: boolean } = {}) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url, headers });
    if (url.endsWith('/auth/refresh')) {
      await new Promise((r) => setTimeout(r, 10));
      if (options.refreshOk === false) return { ok: false, status: 401, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ data: { accessToken: 'new-access', refreshToken: 'new-refresh' } }) };
    }
    const authorized = headers.Authorization === 'Bearer new-access';
    return { ok: authorized, status: authorized ? 200 : 401, json: async () => ({ data: 'secret', meta: null, error: null }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

beforeEach(() => {
  localStorage.clear();
  setTokens('old-access', 'old-refresh');
});
afterEach(() => vi.unstubAllGlobals());

describe('token storage', () => {
  it('stores, reads and clears both tokens', () => {
    expect(getToken()).toBe('old-access');
    expect(getRefreshToken()).toBe('old-refresh');
    clearTokens();
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});

describe('authFetch', () => {
  it('sends the bearer token and a JSON content type', async () => {
    const { calls, fetchMock } = installBackend();
    fetchMock.mockImplementationOnce(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return { ok: true, status: 200, json: async () => ({ data: 1 }) } as Response;
    });
    await authFetch('/blog/admin/list');
    expect(calls[0].headers).toMatchObject({ Authorization: 'Bearer old-access', 'Content-Type': 'application/json' });
  });

  it('does not force a JSON content type on FormData uploads', async () => {
    const { calls } = installBackend();
    const form = new FormData();
    form.append('image', new Blob(['x']), 'a.png');
    await authFetch('/uploads/image', { method: 'POST', body: form });
    expect(calls[0].headers['Content-Type']).toBeUndefined();
  });

  it('refreshes once and retries with the new token after a 401', async () => {
    const { calls } = installBackend();
    const json = await authFetch('/blog/admin/list');

    expect(json.data).toBe('secret');
    expect(getToken()).toBe('new-access');
    expect(getRefreshToken()).toBe('new-refresh');
    expect(calls.map((c) => c.url.replace('http://api.test/api/v1', ''))).toEqual([
      '/blog/admin/list', '/auth/refresh', '/blog/admin/list',
    ]);
  });

  it('shares ONE refresh request between concurrent 401s (level 6)', async () => {
    const { calls } = installBackend();

    const results = await Promise.all(Array.from({ length: 5 }, () => authFetch('/blog/admin/list')));

    expect(results.every((r) => r.data === 'secret')).toBe(true);
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('clears tokens and sends the user to login when the refresh fails', async () => {
    installBackend({ refreshOk: false });
    const location = { href: '/admin/posts' };
    vi.stubGlobal('location', location);

    await expect(authFetch('/blog/admin/list')).rejects.toThrow('Session expired');

    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(location.href).toBe('/admin/login');
  });

  it('can refresh again on a later 401 after a failed refresh released the lock', async () => {
    installBackend({ refreshOk: false });
    vi.stubGlobal('location', { href: '/' });
    await expect(authFetch('/a')).rejects.toThrow();

    setTokens('old-access', 'old-refresh');
    const { calls } = installBackend();
    await authFetch('/a');
    expect(calls.filter((c) => c.url.endsWith('/auth/refresh'))).toHaveLength(1);
  });
});
