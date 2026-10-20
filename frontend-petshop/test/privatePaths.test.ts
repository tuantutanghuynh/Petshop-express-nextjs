import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasSessionCookie, loginRedirectPath, needsSignIn } from '../lib/bff/privatePaths';

// Signed-out visitors are sent straight to the login page from private pages (proxy.ts). These
// helpers decide which paths count as private, where to send the visitor, and whether a session
// cookie is present at all — the proxy only checks presence, the backend still decides access.

afterEach(() => vi.unstubAllEnvs());

describe('needsSignIn', () => {
  it('covers the account area and checkout', () => {
    for (const p of ['/tai-khoan', '/tai-khoan/', '/tai-khoan/don-hang/NP-1', '/dat-hang']) expect(needsSignIn(p)).toBe(true);
  });

  it('leaves every other page public, including look-alike paths and the cart', () => {
    for (const p of ['/', '/gio-hang', '/tai-khoan-x', '/dat-hang-ngay', '/dang-nhap']) expect(needsSignIn(p)).toBe(false);
  });
});

describe('loginRedirectPath', () => {
  it('sends the visitor back to the same page and query after signing in', () => {
    expect(loginRedirectPath('/tai-khoan')).toBe('/dang-nhap?next=%2Ftai-khoan');
    expect(loginRedirectPath('/tai-khoan/don-hang/NP-1', '?a=1')).toBe('/dang-nhap?next=%2Ftai-khoan%2Fdon-hang%2FNP-1%3Fa%3D1');
  });
});

describe('hasSessionCookie', () => {
  const jar = (names: string[]) => (name: string) => (names.includes(name) ? { value: 'x' } : undefined);

  it('is true with either the access or the refresh cookie', () => {
    expect(hasSessionCookie(jar(['sc_at']))).toBe(true);
    expect(hasSessionCookie(jar(['sc_rt']))).toBe(true);
  });

  it('is false with no session cookie', () => {
    expect(hasSessionCookie(jar(['other']))).toBe(false);
  });

  it('uses the __Host- names in production', () => {
    vi.stubEnv('APP_ENV', 'production');
    expect(hasSessionCookie(jar(['sc_rt']))).toBe(false);
    expect(hasSessionCookie(jar(['__Host-sc_rt']))).toBe(true);
  });
});
