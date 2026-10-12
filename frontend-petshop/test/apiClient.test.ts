import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, apiFetch } from '../lib/apiClient';

const reply = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });

afterEach(() => vi.unstubAllGlobals());

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
});
