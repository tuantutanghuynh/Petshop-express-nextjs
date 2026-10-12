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

// Gọi API backend bằng fetch gốc (không dùng axios) để tận dụng cơ chế cache/revalidate
// tích hợp sẵn của Next.js (`next: { revalidate, tags }`) — axios không tham gia được
// cơ chế này vì nó không chạy qua hàm fetch mà Next.js đã "độ" lại.
export async function apiFetch<T, M = null>(
  path: string,
  options: RequestInit = {},
): Promise<ApiEnvelope<T, M>> {
  const res = await fetch(`${API_URL}${path}`, options);
  const json = await res.json();

  if (!res.ok) {
    throw new ApiRequestError(json.error?.message || 'Yêu cầu thất bại', res.status, json.error?.code);
  }

  return json; // { data, meta, error: null }
}
