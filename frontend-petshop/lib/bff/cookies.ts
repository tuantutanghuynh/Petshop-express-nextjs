// Session cookies of the Next.js BFF. httpOnly: page scripts (and any injected script) cannot read
// the tokens. SameSite=Lax: other sites cannot make the browser send them with a cross-site POST.
// In production the __Host- prefix also pins them to this exact host, over HTTPS, at path "/" —
// the browser rejects the cookie otherwise. Plain http://localhost cannot use the prefix (it
// requires Secure), so development uses unprefixed names.

// One minute shorter than the 15-minute JWT: while the cookie exists the token is still valid, so
// an expired token is noticed by the cookie's absence instead of a failed backend call.
export const ACCESS_MAX_AGE = 14 * 60;
export const REFRESH_MAX_AGE = 7 * 24 * 60 * 60; // backend refresh token lifetime

export type CookieOptions = { httpOnly: true; secure: boolean; sameSite: 'lax'; path: '/'; maxAge: number };

export function isProduction(): boolean {
  return process.env.APP_ENV === 'production';
}

export function cookieNames(production = isProduction()): { access: string; refresh: string } {
  const prefix = production ? '__Host-' : '';
  return { access: `${prefix}sc_at`, refresh: `${prefix}sc_rt` };
}

export function cookieOptions(production: boolean, maxAge: number): CookieOptions {
  return { httpOnly: true, secure: production, sameSite: 'lax', path: '/', maxAge };
}
