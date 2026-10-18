import type { ApiEnvelope } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Error thrown for any non-2xx response, carrying the HTTP status and the backend's error code.
export class ApiRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// On the Next.js server, identifies the request as ours so the backend skips its rate limiter:
// every page is rendered from the server's single IP, and limiting that IP would block the whole
// storefront after a few dozen visitors (backend/middlewares/rateLimitKeys.ts). INTERNAL_API_SECRET
// has no NEXT_PUBLIC_ prefix, so Next never bundles it for the browser; the `window` check is a
// second guard because apiFetch also runs client-side (admin login), where the header must not go.
function withServerSecret(options: RequestInit): RequestInit {
  const secret = process.env.INTERNAL_API_SECRET;
  if (typeof window !== 'undefined' || !secret) return options;
  const headers = new Headers(options.headers);
  headers.set('X-Internal-Secret', secret);
  return { ...options, headers };
}

// Gọi API backend bằng fetch gốc (không dùng axios) để tận dụng cơ chế cache/revalidate
// tích hợp sẵn của Next.js (`next: { revalidate, tags }`) — axios không tham gia được
// cơ chế này vì nó không chạy qua hàm fetch mà Next.js đã "độ" lại.
export async function apiFetch<T, M = null>(
  path: string,
  options: RequestInit = {},
): Promise<ApiEnvelope<T, M>> {
  const res = await fetch(`${API_URL}${path}`, withServerSecret(options));
  const json = await res.json();

  if (!res.ok) {
    throw new ApiRequestError(json.error?.message || 'Yêu cầu thất bại', res.status, json.error?.code);
  }

  return json; // { data, meta, error: null }
}
