import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, apiFetch } from '../lib/apiClient';

const reply = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('apiFetch', () => {
  it('calls the configured base URL and returns the envelope', async () => {
    const fetchMock = reply(200, { data: [1], meta: null, error: null });
    vi.stubGlobal('fetch', fetchMock);

    const json = await apiFetch<number[]>('/blog', { cache: 'no-store' });

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/v1/blog', { cache: 'no-store' });
    expect(json.data).toEqual([1]);
  });

  it('throws ApiRequestError carrying status and code for a non-2xx answer', async () => {
    vi.stubGlobal('fetch', reply(404, { data: null, error: { code: 'POST_NOT_FOUND', message: 'Không tìm thấy' } }));

    const error = await apiFetch('/blog/x').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 404, code: 'POST_NOT_FOUND', message: 'Không tìm thấy' });
  });

  it('falls back to a generic message when the error body has none', async () => {
    vi.stubGlobal('fetch', reply(500, {}));
    await expect(apiFetch('/x')).rejects.toThrow('Yêu cầu thất bại');
  });

  it('rejects when the server answers with a non-JSON body (e.g. an HTML 502 page)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new SyntaxError('Unexpected token <'); } }));
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(SyntaxError);
  });

  it('propagates a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiFetch('/x')).rejects.toThrow('Failed to fetch');
  });

  // Server-side rendering calls the API from the Next.js server's single IP; the backend exempts
  // those calls from its rate limiter only when they carry X-Internal-Secret. The secret must
  // never be sent from a browser (it would be visible in DevTools) — apiFetch also runs there,
  // e.g. on the admin login page.
  describe('X-Internal-Secret', () => {
    const headersOf = (fetchMock: ReturnType<typeof vi.fn>) => new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);

    it('is added on the server when INTERNAL_API_SECRET is set, keeping the caller\'s headers', async () => {
      vi.stubEnv('INTERNAL_API_SECRET', 'server-only-secret');
      vi.stubGlobal('window', undefined);
      const fetchMock = reply(200, { data: null, meta: null, error: null });
      vi.stubGlobal('fetch', fetchMock);

      await apiFetch('/blog', { headers: { 'X-Brand-Slug': 'petshop' }, cache: 'no-store' });

      const h = headersOf(fetchMock);
      expect(h.get('X-Internal-Secret')).toBe('server-only-secret');
      expect(h.get('X-Brand-Slug')).toBe('petshop');
      expect((fetchMock.mock.calls[0][1] as RequestInit).cache).toBe('no-store');
    });

    it('is never sent from the browser, even if the variable is somehow defined', async () => {
      vi.stubEnv('INTERNAL_API_SECRET', 'server-only-secret');
      const fetchMock = reply(200, { data: null, meta: null, error: null });
      vi.stubGlobal('fetch', fetchMock);

      await apiFetch('/auth/login', { method: 'POST' });

      expect(headersOf(fetchMock).get('X-Internal-Secret')).toBeNull();
    });

    it('is not sent on the server when INTERNAL_API_SECRET is unset or empty', async () => {
      vi.stubEnv('INTERNAL_API_SECRET', '');
      vi.stubGlobal('window', undefined);
      const fetchMock = reply(200, { data: null, meta: null, error: null });
      vi.stubGlobal('fetch', fetchMock);

      await apiFetch('/blog');

      expect(headersOf(fetchMock).get('X-Internal-Secret')).toBeNull();
    });
  });
});
