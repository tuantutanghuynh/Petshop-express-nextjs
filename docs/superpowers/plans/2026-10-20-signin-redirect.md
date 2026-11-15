# Sign-in Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-out visitors opening `/tai-khoan`, `/tai-khoan/*` or `/dat-hang` land straight on `/dang-nhap?next=…` instead of seeing a "Đăng nhập" button.

**Architecture:** A pure helper module decides which paths are private and builds the login URL. `proxy.ts` (Next 16's renamed middleware) redirects with 307 when neither session cookie exists, without calling the backend. A client component `SignInRedirect` covers the case where cookies exist but the session is dead (the page reaches `signedOut` state) by calling `router.replace`.

**Tech Stack:** Next.js 16.3.4 App Router (`proxy.ts`, `NextResponse.redirect`), React 19, Vitest (jsdom).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-20-signin-redirect-design.md`.
- Redirect scope: `/tai-khoan`, `/tai-khoan/*`, `/dat-hang` only. `/gio-hang` stays unchanged.
- Proxy never calls the backend and never reads token values, only checks whether a cookie exists.
- Cookie names come from `cookieNames()` in `lib/bff/cookies.ts` (`sc_at`/`sc_rt`, `__Host-` prefix in production).
- The 3 pages must stay static (`○`) in `npm run build`.
- No `any`, no `eslint-disable`. Code/comments in English, UI copy in Vietnamese.
- Commit: one short plain line, no attribution, user approves before commit/push. Never commit `docs/`, the PDF or the user-owned `.md` guides.

---

### Task 1: Private-path helpers

**Files:**
- Create: `frontend-petshop/lib/bff/privatePaths.ts`
- Test: `frontend-petshop/test/privatePaths.test.ts`

**Interfaces:**
- Consumes: `cookieNames(production?: boolean): { access: string; refresh: string }` from `lib/bff/cookies.ts`.
- Produces:
  - `needsSignIn(pathname: string): boolean`
  - `loginRedirectPath(pathname: string, search?: string): string`
  - `hasSessionCookie(get: (name: string) => unknown): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// frontend-petshop/test/privatePaths.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasSessionCookie, loginRedirectPath, needsSignIn } from '../lib/bff/privatePaths';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run (in `frontend-petshop`): `npx vitest run test/privatePaths.test.ts`
Expected: FAIL — cannot resolve `../lib/bff/privatePaths`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend-petshop/lib/bff/privatePaths.ts
import { cookieNames } from './cookies';

// Pages that only make sense for a signed-in customer. They are static shells that load data
// in the browser, so without this check a visitor would see a skeleton, then a "Đăng nhập" button
// to click. Exact segment match: /tai-khoan-x is not part of the account area.
const PRIVATE_PREFIXES = ['/tai-khoan', '/dat-hang'];

export function needsSignIn(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function loginRedirectPath(pathname: string, search = ''): string {
  return `/dang-nhap?next=${encodeURIComponent(pathname + search)}`;
}

// Optimistic check only: a cookie can exist while the session is revoked. The backend still
// decides access; the page falls back to SignInRedirect when it gets signedOut.
export function hasSessionCookie(get: (name: string) => unknown): boolean {
  const { access, refresh } = cookieNames();
  return Boolean(get(access) || get(refresh));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/privatePaths.test.ts`
Expected: PASS (7 tests).

---

### Task 2: proxy.ts redirect

**Files:**
- Create: `frontend-petshop/proxy.ts`

**Interfaces:**
- Consumes: `needsSignIn`, `loginRedirectPath`, `hasSessionCookie` from Task 1.
- Produces: 307 redirect for signed-out requests to the matched paths.

- [ ] **Step 1: Write the proxy**

```ts
// frontend-petshop/proxy.ts
import { NextResponse, type NextRequest } from 'next/server';
import { hasSessionCookie, loginRedirectPath, needsSignIn } from './lib/bff/privatePaths';

// Signed-out visitors go straight to the login page instead of loading a private page first.
// Only cookie presence is checked: no backend call, no token read (spec 2026-10-20).
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!needsSignIn(pathname) || hasSessionCookie((name) => request.cookies.get(name))) return NextResponse.next();
  return NextResponse.redirect(new URL(loginRedirectPath(pathname, search), request.url));
}

export const config = {
  matcher: ['/tai-khoan/:path*', '/dat-hang'],
};
```

`needsSignIn` is re-checked inside so the function stays correct if the matcher is ever widened.

- [ ] **Step 2: Build and check pages stay static**

Run: `NEXT_PUBLIC_SITE_URL=http://localhost:3000 npm run build`
Expected: build passes, `ƒ Proxy (Middleware)` listed, `/tai-khoan` and `/dat-hang` still `○`.

- [ ] **Step 3: Curl checks on the production server**

```bash
curl -sI http://localhost:3000/tai-khoan | grep -Ei '^(HTTP|location)'          # 307, /dang-nhap?next=%2Ftai-khoan
curl -sI http://localhost:3000/tai-khoan/don-hang/NP-1 | grep -Ei '^(HTTP|location)'  # 307
curl -sI http://localhost:3000/dat-hang | grep -Ei '^(HTTP|location)'           # 307
curl -sI -H 'Cookie: sc_rt=x' http://localhost:3000/tai-khoan | head -1           # 200
curl -sI http://localhost:3000/gio-hang | head -1                                 # 200
curl -sI http://localhost:3000/ | head -1                                         # 200
```

---

### Task 3: SignInRedirect client fallback

**Files:**
- Create: `frontend-petshop/components/orders/SignInRedirect.tsx`
- Modify: `frontend-petshop/components/account/AccountView.tsx:10,57`
- Modify: `frontend-petshop/components/orders/OrderDetailView.tsx:10,21`
- Modify: `frontend-petshop/components/checkout/CheckoutView.tsx:34-41`
- Delete: `frontend-petshop/components/orders/SignInPrompt.tsx` (no users left)

**Interfaces:**
- Consumes: `loginRedirectPath` from Task 1.
- Produces: `SignInRedirect({ next }: { next: string })`.

- [ ] **Step 1: Write the component**

```tsx
// frontend-petshop/components/orders/SignInRedirect.tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { loginRedirectPath } from '../../lib/bff/privatePaths';

// Reached when cookies existed (so proxy.ts let the request through) but the session turned out
// dead. replace(), not push(): Back must not return to a page that redirects again.
export function SignInRedirect({ next }: { next: string }) {
  const router = useRouter();
  const href = loginRedirectPath(next);
  useEffect(() => router.replace(href), [router, href]);
  return (
    <p role="status">
      Đang chuyển tới trang đăng nhập…{' '}
      <Link href={href} className="font-bold text-brand-deep underline">Đăng nhập</Link>
    </p>
  );
}
```

- [ ] **Step 2: Use it in the three views**

`AccountView.tsx`: import `SignInRedirect` from `'../orders/SignInRedirect'`; line 57 → `return <SignInRedirect next="/tai-khoan" />;`
`OrderDetailView.tsx`: import from `'./SignInRedirect'`; line 21 → `return <SignInRedirect next={`/tai-khoan/don-hang/${code}`} />;`
`CheckoutView.tsx`: replace the signed-out block with `if (status === 'signedOut') return <SignInRedirect next="/dat-hang" />;` plus import from `'../orders/SignInRedirect'`.
Delete `SignInPrompt.tsx` after `grep -rn SignInPrompt components app` returns nothing.

- [ ] **Step 3: Full check**

Run: `npm run lint && npm run typecheck && npm test && NEXT_PUBLIC_SITE_URL=http://172.16.3.155:3000 npm run build`
Expected: all pass; pages still `○`.

- [ ] **Step 4: Browser check**

Restart the production frontend. Signed out: tap "Tài khoản" → lands on `/dang-nhap?next=%2Ftai-khoan`; sign in → back on `/tai-khoan`. Fallback: set a bogus `sc_rt` cookie → `/tai-khoan` shows the status line briefly and replaces to `/dang-nhap`.

- [ ] **Step 5: Propose the commit message and wait for "ok"**

`redirect signed-out visitors to the login page`
Files: `frontend-petshop/lib/bff/privatePaths.ts`, `frontend-petshop/proxy.ts`, `frontend-petshop/components/orders/SignInRedirect.tsx`, the three views, deleted `SignInPrompt.tsx`, `frontend-petshop/test/privatePaths.test.ts`.
