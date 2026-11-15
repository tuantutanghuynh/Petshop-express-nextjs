# Admin Shell + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A wireframe-faithful admin shell (dark sidebar on desktop, ☰ drawer on phones, top bar with page title, admin email and logout, one shared auth gate) and a `/admin` dashboard with 4 stat cards and 2 to-do lists.

**Architecture:** Pure helpers in `lib/adminNav.ts` (menu + active item) and `lib/adminDashboard.ts` (date range, expiring orders, relative times) carry the logic and the tests. A client `AdminShell` in `app/admin/layout.tsx` gates by token and renders the chrome; the dashboard is a client component that loads each card independently through `authFetch` with `X-Brand-Slug`.

**Tech Stack:** Next.js 16.3.4, React 19, Tailwind v4, Vitest. No backend change.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-21-admin-shell-dashboard-design.md`; wireframe `design/wireframes/layout.js`, `wf.css` (.admin*), `admin-dashboard.html`.
- Field names (checked against the running API): orders `code`, `grandTotal`, `expiresAt`, `meta.total`; quote requests `customerName`, `phone`, `items[]`, `createdAt`, `meta.total`; stats `revenue`, `conversionRate` (already a %); contacts `meta.total`; `/auth/me` → `email`; `POST /auth/logout { refreshToken }`.
- Every dashboard call sends `X-Brand-Slug: BRAND_SLUG` (quote endpoints require it).
- Menu order / URLs / icons exactly as the spec; not-ready items (Đơn hàng, Báo giá, Sản phẩm, Tin nhắn) are disabled spans with "Sắp có".
- Sidebar 240px from 1024px; drawer below; tap targets ≥ 44px; content padding 16px / 24px from md; `min-h-dvh`; no horizontal scroll.
- No `any`, no `eslint-disable`, no setState synchronously in effects. Commit short, no attribution, user approves; never commit `docs/`, the PDF or the user's guide `.md` files.

---

### Task 1: `lib/adminNav.ts` + `lib/adminDashboard.ts`

**Files:**
- Create: `frontend-petshop/lib/adminNav.ts`, `frontend-petshop/lib/adminDashboard.ts`
- Test: `frontend-petshop/test/adminNav.test.ts`, `frontend-petshop/test/adminDashboard.test.ts`

**Interfaces:**
- Produces:
  - `type AdminNavItem = { href: string; label: string; icon: string; ready: boolean }`; `ADMIN_NAV: AdminNavItem[]`; `activeNavItem(pathname: string): AdminNavItem | undefined`; `isNavReady(href: string): boolean`
  - `type Period = '30d' | 'month'`; `rangeFor(period: Period, now: Date): { from: string; to: string }`
  - `expiringOrders<T extends { expiresAt: string | null }>(orders: T[], limit?: number): T[]`
  - `timeLeft(expiresAt: string, now: Date): string`; `timeAgo(createdAt: string, now: Date): string`

- [ ] **Step 1: Failing tests**

```ts
// frontend-petshop/test/adminNav.test.ts
import { describe, expect, it } from 'vitest';
import { ADMIN_NAV, activeNavItem, isNavReady } from '../lib/adminNav';

// Admin sidebar (wireframe layout.js): fixed order, and the current page highlighted — /admin only
// for the dashboard itself, a section also for its sub-pages (/admin/posts/new → Bài viết).
describe('admin nav', () => {
  it('lists the wireframe sections in order', () => {
    expect(ADMIN_NAV.map((i) => i.label)).toEqual([
      'Tổng quan', 'Đơn hàng', 'Yêu cầu báo giá', 'Sản phẩm', 'Danh mục & thông số', 'Bài viết', 'Thư viện ảnh', 'Tin nhắn liên hệ', 'Cấu hình trang chủ',
    ]);
  });

  it('finds the current section', () => {
    expect(activeNavItem('/admin')?.label).toBe('Tổng quan');
    expect(activeNavItem('/admin/posts/new')?.label).toBe('Bài viết');
    expect(activeNavItem('/admin/danh-muc')?.label).toBe('Danh mục & thông số');
    expect(activeNavItem('/admin/postsx')).toBeUndefined();
  });

  it('marks pages not built yet', () => {
    expect(isNavReady('/admin/don-hang')).toBe(false);
    expect(isNavReady('/admin/cau-hinh')).toBe(true);
  });
});
```

```ts
// frontend-petshop/test/adminDashboard.test.ts
import { describe, expect, it } from 'vitest';
import { expiringOrders, rangeFor, timeAgo, timeLeft } from '../lib/adminDashboard';

// Dashboard helpers (spec 2026-10-21 admin shell): the quote-revenue period in Vietnam time, bank
// transfer orders closest to losing their stock hold first, and short Vietnamese relative times.
const now = new Date('2026-10-21T05:00:00.000Z'); // 12:00 in Vietnam

describe('rangeFor', () => {
  it('covers the last 30 days up to now', () => {
    expect(rangeFor('30d', now)).toEqual({ from: '2026-09-21T05:00:00.000Z', to: '2026-10-21T05:00:00.000Z' });
  });
  it('starts "this month" at 00:00 on the 1st in Vietnam', () => {
    expect(rangeFor('month', now).from).toBe('2026-09-30T17:00:00.000Z');
    expect(rangeFor('month', new Date('2026-10-31T18:00:00.000Z')).from).toBe('2026-10-31T17:00:00.000Z'); // already 1 Nov in Vietnam
  });
});

describe('expiringOrders', () => {
  it('sorts by hold expiry, skips orders without one, and caps the list', () => {
    const o = (code: string, expiresAt: string | null) => ({ code, expiresAt });
    const list = [o('C', '2026-10-21T09:00:00Z'), o('A', '2026-10-21T06:00:00Z'), o('X', null), o('B', '2026-10-21T07:00:00Z')];
    expect(expiringOrders(list, 2).map((x) => x.code)).toEqual(['A', 'B']);
  });
});

describe('timeLeft / timeAgo', () => {
  it('says how long a hold still runs', () => {
    expect(timeLeft('2026-10-21T07:30:00.000Z', now)).toBe('còn 2 giờ');
    expect(timeLeft('2026-10-21T05:15:00.000Z', now)).toBe('còn 15 phút');
    expect(timeLeft('2026-10-21T04:59:00.000Z', now)).toBe('đã quá hạn');
  });
  it('says how long ago something arrived', () => {
    expect(timeAgo('2026-10-21T04:59:30.000Z', now)).toBe('vừa xong');
    expect(timeAgo('2026-10-21T04:50:00.000Z', now)).toBe('10 phút trước');
    expect(timeAgo('2026-10-21T04:00:00.000Z', now)).toBe('1 giờ trước');
    expect(timeAgo('2026-10-18T05:00:00.000Z', now)).toBe('3 ngày trước');
  });
});
```
Run `cd frontend-petshop && npx vitest run test/adminNav.test.ts test/adminDashboard.test.ts` → FAIL (modules missing).

- [ ] **Step 2: Implement**

```ts
// frontend-petshop/lib/adminNav.ts
// Admin sidebar, in the wireframe's order (design/wireframes/layout.js). `ready: false` marks a page
// still to be built (spec 2026-10-21 admin shell, waves B–D): it shows as "Sắp có" and is not a
// link, so the admin never lands on a 404. Flip it when the page ships.
export type AdminNavItem = { href: string; label: string; icon: string; ready: boolean };

export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/admin', label: 'Tổng quan', icon: '◧', ready: true },
  { href: '/admin/don-hang', label: 'Đơn hàng', icon: '🧾', ready: false },
  { href: '/admin/bao-gia', label: 'Yêu cầu báo giá', icon: '☎', ready: false },
  { href: '/admin/san-pham', label: 'Sản phẩm', icon: '📦', ready: false },
  { href: '/admin/danh-muc', label: 'Danh mục & thông số', icon: '🗂', ready: true },
  { href: '/admin/posts', label: 'Bài viết', icon: '📝', ready: true },
  { href: '/admin/gallery', label: 'Thư viện ảnh', icon: '🖼', ready: true },
  { href: '/admin/lien-he', label: 'Tin nhắn liên hệ', icon: '✉', ready: false },
  { href: '/admin/cau-hinh', label: 'Cấu hình trang chủ', icon: '⚙', ready: true },
];

// /admin matches only itself; a section also owns its sub-pages (/admin/posts/new → Bài viết).
export function activeNavItem(pathname: string): AdminNavItem | undefined {
  return ADMIN_NAV.find((i) => (i.href === '/admin' ? pathname === '/admin' : pathname === i.href || pathname.startsWith(`${i.href}/`)));
}

export const isNavReady = (href: string) => ADMIN_NAV.some((i) => i.href === href && i.ready);
```

```ts
// frontend-petshop/lib/adminDashboard.ts
// Dashboard helpers (test/adminDashboard.test.ts). Times are compared in UTC; "this month" starts at
// 00:00 on the 1st in Vietnam (UTC+7, no daylight saving), like the shop's own calendar.
const VN_OFFSET_MS = 7 * 3_600_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type Period = '30d' | 'month';

export function rangeFor(period: Period, now: Date): { from: string; to: string } {
  if (period === '30d') return { from: new Date(now.getTime() - 30 * DAY).toISOString(), to: now.toISOString() };
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const monthStart = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), 1) - VN_OFFSET_MS;
  return { from: new Date(monthStart).toISOString(), to: now.toISOString() };
}

// Bank-transfer orders whose stock hold ends soonest first; orders without a hold are skipped.
export function expiringOrders<T extends { expiresAt: string | null }>(orders: T[], limit = 5): T[] {
  return orders
    .filter((o): o is T & { expiresAt: string } => o.expiresAt !== null)
    .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt))
    .slice(0, limit);
}

export function timeLeft(expiresAt: string, now: Date): string {
  const ms = Date.parse(expiresAt) - now.getTime();
  if (ms <= 0) return 'đã quá hạn';
  return ms < HOUR ? `còn ${Math.ceil(ms / MINUTE)} phút` : `còn ${Math.floor(ms / HOUR)} giờ`;
}

export function timeAgo(createdAt: string, now: Date): string {
  const ms = now.getTime() - Date.parse(createdAt);
  if (ms < MINUTE) return 'vừa xong';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} phút trước`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} giờ trước`;
  return `${Math.floor(ms / DAY)} ngày trước`;
}
```

- [ ] **Step 3: Run** → PASS; `npm run typecheck`.

---

### Task 2: Admin shell

**Files:**
- Create: `frontend-petshop/components/admin/shell/AdminShell.tsx` (gate, grid, top bar, drawer)
- Create: `frontend-petshop/components/admin/shell/AdminNavList.tsx` (menu list used in sidebar and drawer)
- Modify: `frontend-petshop/app/admin/layout.tsx` (wrap children in `AdminShell`, keep `robots` metadata)
- Modify: `frontend-petshop/app/admin/login/page.tsx` (after login → `/admin`)

**Interfaces:**
- Consumes: `ADMIN_NAV`, `activeNavItem` (Task 1); `getToken`, `getRefreshToken`, `clearTokens`, `authFetch` (`lib/adminAuth.ts`).

- [ ] **Step 1: `AdminNavList.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { ADMIN_NAV, activeNavItem } from '../../../lib/adminNav';

// The admin menu (sidebar on desktop, drawer on phones). Pages not built yet are plain text marked
// "Sắp có" — never a link to a 404.
export function AdminNavList({ pathname }: { pathname: string }) {
  const current = activeNavItem(pathname);
  return (
    <ul className="flex flex-col gap-1">
      {ADMIN_NAV.map((item) => {
        const row = 'flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] px-3 text-sm';
        if (!item.ready) {
          return (
            <li key={item.href}>
              <span aria-disabled="true" className={`${row} text-white/40`}>
                <span aria-hidden="true">{item.icon}</span>{item.label}<span className="ml-auto text-xs">Sắp có</span>
              </span>
            </li>
          );
        }
        const active = current?.href === item.href;
        return (
          <li key={item.href}>
            <Link href={item.href} aria-current={active ? 'page' : undefined}
              className={`${row} ${active ? 'bg-white/10 font-bold text-white' : 'text-white/80 hover:bg-white/5 hover:text-white'}`}>
              <span aria-hidden="true">{item.icon}</span>{item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: `AdminShell.tsx`**

```tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { authFetch, clearTokens, getRefreshToken, getToken } from '../../../lib/adminAuth';
import { activeNavItem } from '../../../lib/adminNav';
import { AdminNavList } from './AdminNavList';

// Shared admin chrome (wireframe layout.js / wf.css .admin*): a dark 240px sidebar from 1024px, a ☰
// drawer below it, a sticky top bar with the page title, the signed-in email and "Đăng xuất". It is
// also the one auth gate: without a token every admin page goes to /admin/login, which itself is
// rendered bare. localStorage is read through useSyncExternalStore (no setState in an effect).
const noop = () => () => {};

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hasToken = useSyncExternalStore(noop, () => Boolean(getToken()), () => false);
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const [email, setEmail] = useState<string | null>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const isLogin = pathname === '/admin/login';

  useEffect(() => {
    if (isLogin || !hydrated) return;
    if (!hasToken) {
      router.replace('/admin/login');
      return;
    }
    let active = true;
    authFetch<{ email: string }>('/auth/me').then((res) => active && setEmail(res.data?.email ?? null));
    return () => {
      active = false;
    };
  }, [isLogin, hydrated, hasToken, router]);

  useEffect(() => {
    drawer.current?.close();
  }, [pathname]);

  if (isLogin) return <>{children}</>;

  async function logout() {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) await authFetch('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });
    } catch {
      // A network error must not keep the admin signed in on this device: the tokens go anyway.
    }
    clearTokens();
    router.replace('/admin/login');
  }

  const title = activeNavItem(pathname)?.label ?? 'Quản trị';
  const brand = (
    <div className="mb-4 flex items-center gap-2 px-3 text-white">
      <span aria-hidden="true" className="text-xl">🐾</span>
      <span className="leading-[1.3] font-extrabold">Quản trị<small className="block text-xs font-normal text-white/60">Siêu thị của chó mèo</small></span>
    </div>
  );

  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] bg-surface-alt lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh overflow-y-auto bg-ink px-3 py-4 lg:block">
        {brand}
        <nav aria-label="Quản trị"><AdminNavList pathname={pathname} /></nav>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-line bg-surface px-4">
          <button type="button" aria-label="Mở menu quản trị" onClick={() => drawer.current?.showModal()}
            className="grid size-11 shrink-0 place-items-center rounded-full text-xl hover:bg-mint lg:hidden">☰</button>
          <strong className="min-w-0 truncate text-ink">{title}</strong>
          <span className="ml-auto hidden max-w-[16rem] truncate text-sm text-muted sm:inline">{email ?? ''}</span>
          <button type="button" onClick={logout} className="min-h-11 shrink-0 rounded-full border border-line px-4 text-sm font-bold text-ink hover:bg-mint">Đăng xuất</button>
        </header>
        <main id="main" className="p-4 md:p-6">{hasToken ? children : null}</main>
      </div>
      <dialog ref={drawer} aria-label="Menu quản trị" onClick={(e) => { if (e.target === e.currentTarget) drawer.current?.close(); }}
        className="m-0 h-dvh max-h-none w-[min(85vw,280px)] max-w-none bg-ink p-0 backdrop:bg-ink/60 lg:hidden">
        <div className="flex h-full flex-col overflow-y-auto px-3 py-4">
          <div className="flex items-start justify-between">
            {brand}
            <button type="button" aria-label="Đóng menu" onClick={() => drawer.current?.close()} className="grid size-11 place-items-center rounded-full text-xl text-white">✕</button>
          </div>
          <nav aria-label="Quản trị"><AdminNavList pathname={pathname} /></nav>
        </div>
      </dialog>
    </div>
  );
}
```
Notes while implementing: the `catch {}` above has a comment explaining why the error is ignored (CLAUDE.md forbids *silent* empty catches; keep the comment). If the React-hooks lint flags `drawer.current?.close()` in an effect, it is not setState, so it should pass; if `hasToken` needs to react to login in another tab, that is out of scope (the gate re-reads on navigation).

- [ ] **Step 3: `app/admin/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminShell } from '../../components/admin/shell/AdminShell';

// robots.txt only stops crawling; a disallowed URL linked from elsewhere can still be indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
```
`app/admin/login/page.tsx`: `router.push('/admin/posts')` → `router.push('/admin')`.

- [ ] **Step 4: Verify** — `npm run lint && npm run typecheck && npm test`.

---

### Task 3: Dashboard `/admin`

**Files:**
- Create: `frontend-petshop/app/admin/page.tsx`
- Create: `frontend-petshop/components/admin/dashboard/Dashboard.tsx`
- Create: `frontend-petshop/components/admin/dashboard/StatCard.tsx`
- Modify: `frontend-petshop/lib/types.ts` (`AdminOrderSummary`, `QuoteRequestSummary`, `QuoteStats`)

**Interfaces:**
- Consumes: Task 1 helpers, `isNavReady`, `formatVnd` (`lib/storefront.ts`), `authFetch`, `BRAND_SLUG`.
- Types:
```ts
// GET /orders/admin/list rows, as far as the dashboard reads them.
export interface AdminOrderSummary { id: string; code: string; grandTotal: number; expiresAt: string | null }
// GET /quote-requests/admin/list rows (dashboard view).
export interface QuoteRequestSummary { id: string; customerName: string; phone: string; items: unknown[]; createdAt: string }
// GET /quote-requests/admin/stats — conversionRate is already a percentage.
export interface QuoteStats { totalRequests: number; closedCount: number; revenue: number; averageOrderValue: number; conversionRate: number }
```

- [ ] **Step 1: `StatCard.tsx`**

```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = { label: string; value: ReactNode; foot?: ReactNode; action?: { href: string; text: string } | null; state: 'loading' | 'error' | 'ready' };

// One dashboard number (wireframe .stat). Each card loads on its own, so one failing API shows an
// error in its card only.
export function StatCard({ label, value, foot, action, state }: Props) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4">
      <small className="text-muted">{label}</small>
      <div aria-busy={state === 'loading'} className="text-2xl leading-[1.3] font-extrabold text-ink tabular-nums">
        {state === 'loading' ? <span className="block h-8 w-16 animate-pulse rounded bg-surface-alt" /> : state === 'error' ? <span className="text-base text-pink-ink">Chưa tải được</span> : value}
      </div>
      {foot && state === 'ready' && <small className="text-muted">{foot}</small>}
      {action && <Link href={action.href} className="mt-1 inline-flex min-h-11 items-center self-start font-bold text-brand-ink">{action.text}</Link>}
    </div>
  );
}
```

- [ ] **Step 2: `Dashboard.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { expiringOrders, rangeFor, timeAgo, timeLeft, type Period } from '../../../lib/adminDashboard';
import { isNavReady } from '../../../lib/adminNav';
import { BRAND_SLUG } from '../../../lib/site';
import { formatVnd } from '../../../lib/storefront';
import type { AdminOrderSummary, PageMeta, QuoteRequestSummary, QuoteStats } from '../../../lib/types';
import { StatCard } from './StatCard';

type Loaded<T> = { state: 'loading' } | { state: 'error' } | { state: 'ready'; data: T };
const BRAND = { 'X-Brand-Slug': BRAND_SLUG };

async function load<T>(path: string, pick: (data: unknown, meta: PageMeta | null) => T): Promise<Loaded<T>> {
  try {
    const res = await authFetch<unknown>(path, { headers: BRAND });
    if (res.error) return { state: 'error' };
    return { state: 'ready', data: pick(res.data, (res.meta as PageMeta | null) ?? null) };
  } catch {
    return { state: 'error' }; // shown in the card; the other cards still load
  }
}

const card = 'rounded-card border border-line bg-surface p-4';
const row = 'flex items-center justify-between gap-3 border-t border-line py-3 first:border-t-0';

// /admin "Tổng quan" (wireframe admin-dashboard.html): four numbers and two to-do lists, the work the
// owner does from a phone every day. Each request is independent.
export function Dashboard() {
  const [period, setPeriod] = useState<Period>('30d');
  const [orders, setOrders] = useState<Loaded<{ total: number; rows: AdminOrderSummary[] }>>({ state: 'loading' });
  const [quotes, setQuotes] = useState<Loaded<{ total: number; rows: QuoteRequestSummary[] }>>({ state: 'loading' });
  const [contacts, setContacts] = useState<Loaded<number>>({ state: 'loading' });
  const [stats, setStats] = useState<Loaded<QuoteStats> & { period?: Period }>({ state: 'loading' });
  const [now] = useState(() => new Date());

  useEffect(() => {
    let active = true;
    const list = <T,>(data: unknown, meta: PageMeta | null) => ({ total: meta?.total ?? 0, rows: (data as T[]) ?? [] });
    load('/orders/admin/list?orderStatus=PENDING_PAYMENT&pageSize=50', list<AdminOrderSummary>).then((r) => active && setOrders(r));
    load('/quote-requests/admin/list?status=NEW', list<QuoteRequestSummary>).then((r) => active && setQuotes(r));
    load('/contact/admin/list?isRead=false', (_d, meta) => meta?.total ?? 0).then((r) => active && setContacts(r));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const { from, to } = rangeFor(period, new Date());
    load(`/quote-requests/admin/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, (d) => d as QuoteStats)
      .then((r) => active && setStats({ ...r, period }));
    return () => {
      active = false;
    };
  }, [period]);

  const statsState = stats.period === period ? stats.state : 'loading';
  const ordersReady = isNavReady('/admin/don-hang');
  const quotesReady = isNavReady('/admin/bao-gia');
  const contactsReady = isNavReady('/admin/lien-he');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl leading-[1.3] font-extrabold">Tổng quan</h1>
        <select aria-label="Khoảng thời gian" value={period} onChange={(e) => setPeriod(e.target.value as Period)}
          className="min-h-11 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base">
          <option value="30d">30 ngày qua</option>
          <option value="month">Tháng này</option>
        </select>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] gap-3">
        <StatCard label="Chờ xác nhận chuyển khoản" state={orders.state} value={orders.state === 'ready' ? orders.data.total : null}
          action={ordersReady ? { href: '/admin/don-hang', text: 'Xử lý ›' } : null} />
        <StatCard label="Yêu cầu tư vấn mới" state={quotes.state} value={quotes.state === 'ready' ? quotes.data.total : null}
          action={quotesReady ? { href: '/admin/bao-gia', text: 'Gọi lại ›' } : null} />
        <StatCard label="Doanh thu chốt qua tư vấn" state={statsState} value={stats.state === 'ready' ? formatVnd(stats.data.revenue) : null}
          foot={stats.state === 'ready' ? `Tỉ lệ chốt ${stats.data.conversionRate}%` : null} />
        <StatCard label="Tin nhắn chưa đọc" state={contacts.state} value={contacts.state === 'ready' ? contacts.data : null}
          action={contactsReady ? { href: '/admin/lien-he', text: 'Đọc ›' } : null} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="exp-title" className={card}>
          <h2 id="exp-title" className="mb-2 text-lg leading-[1.3] font-extrabold">Đơn chuyển khoản sắp hết hạn giữ hàng</h2>
          {orders.state === 'loading' && <div aria-busy="true" className="h-16 animate-pulse rounded bg-surface-alt" />}
          {orders.state === 'error' && <p className="text-pink-ink">Chưa tải được đơn hàng.</p>}
          {orders.state === 'ready' && (expiringOrders(orders.data.rows).length === 0 ? <p className="text-muted">Không có đơn chờ xác nhận.</p> : (
            <ul>{expiringOrders(orders.data.rows).map((o) => (
              <li key={o.id} className={row}>
                <div className="min-w-0"><b className="break-words text-ink">{o.code}</b><br /><small className="text-muted tabular-nums">{formatVnd(o.grandTotal)} · {o.expiresAt ? timeLeft(o.expiresAt, now) : ''}</small></div>
                {ordersReady && <a href={`/admin/don-hang?code=${encodeURIComponent(o.code)}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-brand-ink px-4 font-bold text-white">Xác nhận</a>}
              </li>
            ))}</ul>
          ))}
        </section>
        <section aria-labelledby="call-title" className={card}>
          <h2 id="call-title" className="mb-2 text-lg leading-[1.3] font-extrabold">Khách chờ gọi lại</h2>
          {quotes.state === 'loading' && <div aria-busy="true" className="h-16 animate-pulse rounded bg-surface-alt" />}
          {quotes.state === 'error' && <p className="text-pink-ink">Chưa tải được yêu cầu tư vấn.</p>}
          {quotes.state === 'ready' && (quotes.data.rows.length === 0 ? <p className="text-muted">Chưa có yêu cầu mới.</p> : (
            <ul>{quotes.data.rows.slice(0, 5).map((q) => (
              <li key={q.id} className={row}>
                <div className="min-w-0"><b className="break-words text-ink">{q.customerName}</b><br />
                  <small className="text-muted">{q.phone} · {q.items.length} sản phẩm · {timeAgo(q.createdAt, now)}</small></div>
                <a href={`tel:${q.phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full border-2 border-brand-ink px-4 font-bold text-brand-ink">☎ Gọi</a>
              </li>
            ))}</ul>
          ))}
        </section>
      </div>
    </div>
  );
}
```
Implementation notes: `authFetch`'s envelope type may not expose `meta` generically — check `ApiEnvelope<T, M>` in `lib/types.ts` and type the call as `authFetch<unknown>` then read `res.meta`; if `PageMeta` is not exported, import the type that `services/catalog.ts` uses. The `catch` has a comment (not silent). The orders "Xác nhận" link target (`/admin/don-hang?code=`) is only rendered once wave B sets `ready: true`; wave B decides the final URL and updates this line.

- [ ] **Step 3: Page**

```tsx
// frontend-petshop/app/admin/page.tsx
import type { Metadata } from 'next';
import { Dashboard } from '../../components/admin/dashboard/Dashboard';

export const metadata: Metadata = { title: 'Tổng quan' };

export default function AdminHomePage() {
  return <Dashboard />;
}
```

- [ ] **Step 4: Verify** — `npm run lint && npm run typecheck && npm test`; build; restart; CDP (scratchpad) with the test admin token:
  - `/admin` at 390 / 768 / 1280 / 195: 4 cards show numbers from the local DB (0 pending orders, 1 new quote, 1 unread message, revenue + rate); the call list shows "Khach Thu" with a `tel:` link; no horizontal scroll; every button / link ≥ 44px; period select switches the revenue card.
  - Sidebar from 1024px with the current item highlighted; "Sắp có" items are not links; below 1024 the ☰ drawer opens, Esc closes it, focus returns to ☰, navigating closes it.
  - Top bar shows the page title and the admin email; "Đăng xuất" lands on `/admin/login` and `localStorage` is empty; afterwards `/admin/danh-muc` redirects to `/admin/login`.
  - `/admin/login` has no shell; logging in lands on `/admin`.
  - `/admin/danh-muc`, `/admin/cau-hinh`, `/admin/posts`, `/admin/gallery` still work inside the shell.

---

### Task 4: Docs and commit

- [ ] PROGRESS entry (admin shell + dashboard, wave A of the admin rebuild).
- [ ] Full `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] Propose the commit, wait for "ok": `add admin shell and dashboard`.
