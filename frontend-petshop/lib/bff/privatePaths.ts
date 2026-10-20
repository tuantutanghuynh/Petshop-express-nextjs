import { cookieNames } from './cookies';

// Pages that only make sense for a signed-in customer. They are static shells that load their data
// in the browser, so without a check before rendering a visitor would see a skeleton, then a
// "Đăng nhập" button to click. Whole-segment match: /tai-khoan-x is not part of the account area.
const PRIVATE_PREFIXES = ['/tai-khoan', '/dat-hang'];

export function needsSignIn(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function loginRedirectPath(pathname: string, search = ''): string {
  return `/dang-nhap?next=${encodeURIComponent(pathname + search)}`;
}

// Optimistic check only: a cookie can outlive a revoked session. The backend still decides access,
// and a page that ends up signed out falls back to SignInRedirect.
export function hasSessionCookie(get: (name: string) => unknown): boolean {
  const { access, refresh } = cookieNames();
  return Boolean(get(access) || get(refresh));
}
