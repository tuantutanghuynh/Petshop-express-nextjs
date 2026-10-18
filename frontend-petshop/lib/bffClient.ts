// Browser-side caller of the Next.js BFF (/api/*). Never throws: every outcome, including a lost
// connection, comes back as a BffResponse so forms can show a message instead of crashing.
//
// Refresh tokens are single-use (backend/services/token.service.ts), so concurrent calls that find
// the access token expired must share ONE refresh: within a tab through a shared promise, across
// tabs through the Web Locks API where available. The refresh route itself is a no-op when another
// tab has just refreshed (lib/bff/session.ts), so the second tab in line spends nothing.

export type BffError = { code: string; message?: string; details?: unknown };
export type BffResponse<T> =
  | { ok: true; status: number; data: T; error: null }
  | { ok: false; status: number; data: null; error: BffError };

type Options = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; headers?: Record<string, string> };

const NETWORK_ERROR: BffError = { code: 'NETWORK_ERROR', message: 'Không kết nối được. Kiểm tra mạng và thử lại.' };

async function send<T>(path: string, options: Options): Promise<BffResponse<T>> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, status: 0, data: null, error: NETWORK_ERROR };
  }
  if (res.status === 204) return { ok: true, status: 204, data: null as T, error: null };
  let json: { data?: T; error?: BffError | null };
  try {
    json = await res.json();
  } catch {
    return { ok: false, status: res.status, data: null, error: { code: 'BAD_RESPONSE', message: 'Có lỗi xảy ra, vui lòng thử lại.' } };
  }
  if (res.ok) return { ok: true, status: res.status, data: json.data as T, error: null };
  return { ok: false, status: res.status, data: null, error: json.error ?? { code: 'UNKNOWN' } };
}

let refreshing: Promise<boolean> | null = null;

async function refreshOnce(): Promise<boolean> {
  const run = async () => (await send<unknown>('/api/auth/refresh', { method: 'POST' })).ok;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request('bff-refresh', run) : run();
}

function sharedRefresh(): Promise<boolean> {
  refreshing ??= refreshOnce().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function bffFetch<T>(path: string, options: Options = {}): Promise<BffResponse<T>> {
  const first = await send<T>(path, options);
  if (first.ok || first.error.code !== 'ACCESS_EXPIRED') return first;
  if (!(await sharedRefresh())) {
    return { ok: false, status: 401, data: null, error: { code: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập lại.' } };
  }
  return send<T>(path, options); // retried once; a second ACCESS_EXPIRED is returned as is
}
