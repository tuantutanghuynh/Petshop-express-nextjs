import { NextResponse, type NextRequest } from 'next/server';
import { hasSessionCookie, loginRedirectPath, needsSignIn } from './lib/bff/privatePaths';

// Signed-out visitors go straight to the login page instead of loading a private page first.
// Only cookie presence is checked: no backend call, no token read. needsSignIn is checked again
// so the function stays correct if the matcher is ever widened.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!needsSignIn(pathname) || hasSessionCookie((name) => request.cookies.get(name))) return NextResponse.next();
  return NextResponse.redirect(new URL(loginRedirectPath(pathname, search), request.url));
}

// Prefetches skip the proxy. The client router caches a prefetched redirect, so after signing in
// router.replace('/tai-khoan') would replay the old redirect back to /dang-nhap. A prefetch gets the
// static shell instead; a client navigation while signed out ends in SignInRedirect.
// Literal values only: Next reads the matcher at build time and ignores variables.
export const config = {
  matcher: [
    {
      source: '/tai-khoan/:path*',
      missing: [{ type: 'header', key: 'next-router-prefetch' }, { type: 'header', key: 'purpose', value: 'prefetch' }],
    },
    {
      source: '/dat-hang',
      missing: [{ type: 'header', key: 'next-router-prefetch' }, { type: 'header', key: 'purpose', value: 'prefetch' }],
    },
  ],
};
