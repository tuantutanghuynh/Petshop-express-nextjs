# Admin Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/don-hang` — filter, search, page through orders, open one in a drawer and confirm payment / ship / complete / cancel it; backend gains `?q=` search.

**Architecture:** Backend: one validator + an `OR` filter in `adminList`. Frontend: pure `lib/adminOrders.ts` (URL state, labels, allowed actions, request shapes) carries the logic and tests; a client `OrdersManager` reads the URL, loads the page, and renders filters, list and an `OrderDetail` dialog. Existing customer helpers (`orderStatusLabel`, `OrderStatusBadge`) and wave-A `timeLeft` are reused.

**Tech Stack:** Express 5 + Prisma 7.9.1 (JSON path filter), express-validator, Vitest/supertest/testcontainers; Next.js 16.3.4 (`useSearchParams` inside `<Suspense>`), React 19, Tailwind v4.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-21-admin-orders-design.md`; wireframe `design/wireframes/admin-orders.html`.
- `q`: one string, trimmed 2–50 chars, else 422. Matches code (insensitive) OR phone digits (only when ≥ 3 digits) OR account fullName / email (insensitive). `escapeLike` on LIKE terms.
- Existing endpoints for actions: `PATCH /orders/admin/:id/confirm-payment`, `/cancel`, `/status {status}`; every admin call sends `X-Brand-Slug: BRAND_SLUG`.
- URL: `?tab=all|pending|confirmed|processing|completed|cancelled&q=&page=&ma=`; defaults omitted. 20 orders per page.
- Phone < 768px: cards; ≥ 768px: table. Detail in `<dialog>` (bottom sheet / right drawer from lg). Tap targets ≥ 44px; money `tabular-nums`; no horizontal scroll.
- 409 from an action → "Đơn vừa thay đổi — đã tải lại" + reload.
- No `any`, no `eslint-disable`, no setState synchronously in effects. Commits short, no attribution, user approves; never commit `docs/`, the PDF or the user's `.md` files.

---

### Task 1: Backend — `q` search on the admin order list

**Files:**
- Modify: `backend/routes/order.route.ts` (validator on `/admin/list`)
- Modify: `backend/controllers/order.controller.ts` (`adminList`)
- Test: `backend/test/orders.admin.validation.test.ts` (DB-free), `backend/test/db/order.search.test.ts`

- [ ] **Step 1: Failing DB-free test**

```ts
// backend/test/orders.admin.validation.test.ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app';
import { bearer, tokenFor } from './helpers';

// ?q= on the admin order list reaches a database filter, so it is checked first: one string of
// 2–50 characters. The validator runs before resolveBrand's query, so no database is needed.
describe('GET /orders/admin/list search validation', () => {
  it.each([
    ['too short', 'q=a'],
    ['blank', 'q=%20%20%20'],
    ['too long', `q=${'a'.repeat(51)}`],
    ['repeated', 'q=ab&q=cd'],
  ])('refuses a %s term with 422', async (_label, query) => {
    const res = await request(app).get(`/api/v1/orders/admin/list?${query}`).set('X-Brand-Slug', 'petshop').set(bearer(tokenFor('admin')));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```
Note: `router.use(authenticate, resolveBrand)` runs for every order route, and `resolveBrand` queries the database — so this test needs the validator to run **before** `resolveBrand`. If `resolveBrand` hits the DB first, move this case into the DB suite instead (same assertions in `order.search.test.ts`) and keep the file out. Check by running it.

- [ ] **Step 2: Failing DB test**

```ts
// backend/test/db/order.search.test.ts
import { describe, expect, it } from 'vitest';
import prisma from '../../services/prisma';
import { call } from './helpers/http';
import { createAdmin, createBrand, createProduct, createUser, fillCart, orderBody } from './helpers/factories';

// Admin order search (spec 2026-10-21 admin orders): a customer calls about an order and the shop
// finds it by code (any case), by phone (spaces allowed) or by the account's name / email.
async function placeOrder(fullName: string) {
  const { child } = await createBrand();
  const product = await createProduct(child.id, { variants: [{ stock: 10, price: 50_000 }] });
  const user = await createUser({ fullName });
  await fillCart(user.id, [{ variantId: product.variants[0].id, quantity: 1 }]);
  const res = await call('post', '/api/v1/orders', { token: user.token }).send(orderBody('COD'));
  expect(res.status).toBe(201);
  return res.body.data as { id: string; code: string };
}

describe('admin order search', () => {
  it('finds an order by code, phone or account name, and nothing else', async () => {
    const order = await placeOrder('Trần Thị Mai');
    const admin = await createAdmin();
    const search = (q: string, extra = '') => call('get', `/api/v1/orders/admin/list?q=${encodeURIComponent(q)}${extra}`, { token: admin.token });

    expect((await search(order.code.toLowerCase().slice(-6))).body.data.map((o: { id: string }) => o.id)).toEqual([order.id]);
    expect((await search('0901 234')).body.meta.total).toBe(1); // validShipping phone 0901234567
    expect((await search('thị mai')).body.meta.total).toBe(1);
    expect((await search('khong-co-don-nay')).body.meta.total).toBe(0);
    expect((await search('0901 234', '&orderStatus=CANCELLED')).body.meta.total).toBe(0); // combines with the tab
  });

  it('treats % and _ literally', async () => {
    await placeOrder('Bình thường');
    const admin = await createAdmin();
    const res = await call('get', '/api/v1/orders/admin/list?q=%25%25', { token: admin.token });
    expect(res.body.meta.total).toBe(0);
    expect(await prisma.order.count()).toBe(1);
  });
});
```
Check `createUser` accepts `fullName` (it does: `overrides.fullName`). Run: `cd backend && npm run test:db -- test/db/order.search.test.ts` → FAIL (q ignored → totals wrong).

- [ ] **Step 3: Implement**

Route (`order.route.ts`):
```ts
// Admin list: optional ?q= (code, phone, account name / email) — one string of 2–50 characters.
router.get(
  '/admin/list',
  requireRole('admin'),
  [
    query('q').optional().custom((v) => typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 50)
      .withMessage('Từ khoá tìm đơn phải có từ 2 đến 50 ký tự'),
    validate,
  ],
  ctrl.adminList,
);
```
(import `query` from express-validator next to `body`.)

Controller (`adminList`), after the status filters:
```ts
  // ?q= finds the order a customer calls about: by code (any case), by the phone typed with or
  // without spaces (only with ≥ 3 digits, or "1" would match every order), or by the account's
  // name / email. Validated by the route; escapeLike because Prisma does not escape % and _.
  if (typeof q === 'string') {
    const term = escapeLike(q.trim());
    const digits = q.replace(/\D/g, '');
    where.OR = [
      { code: { contains: term, mode: 'insensitive' } },
      ...(digits.length >= 3 ? [{ shippingAddress: { path: ['phone'], string_contains: digits } }] : []),
      { user: { fullName: { contains: term, mode: 'insensitive' } } },
      { user: { email: { contains: term, mode: 'insensitive' } } },
    ];
  }
```
and destructure `q` from `req.query`. Update the function's comment ("filterable by order and payment status, searchable by …").

- [ ] **Step 4: Run** — both tests PASS; `npm run typecheck && npm test && npm run test:db`.

---

### Task 2: `lib/adminOrders.ts`

**Files:**
- Create: `frontend-petshop/lib/adminOrders.ts`
- Modify: `frontend-petshop/lib/types.ts` (`AdminOrder`)
- Modify: `frontend-petshop/lib/adminNav.ts` (Đơn hàng `ready: true`)
- Test: `frontend-petshop/test/adminOrders.test.ts`; adjust `test/adminNav.test.ts` (`isNavReady('/admin/don-hang')` is now true — use `/admin/bao-gia` as the not-ready example)

**Interfaces:**
- Produces:
  - `type AdminOrder = Order & { user: { id: string; email: string; fullName: string | null } | null }` (types.ts)
  - `ORDER_TABS: readonly { key: OrderTab; label: string; status: string | null }[]`, `type OrderTab`
  - `type OrdersQuery = { tab: OrderTab; q: string; page: number; ma: string | null }`
  - `parseOrdersQuery(sp: URLSearchParams): OrdersQuery`; `ordersHref(s: Partial<OrdersQuery>): string`; `ordersApiPath(s: OrdersQuery): string` (20 per page)
  - `orderBadge(o, now): { label: string; tone: StatusTone }`
  - `type OrderActionKind = 'confirm-payment' | 'processing' | 'completed' | 'cancel'`; `type OrderAction = { kind; label; danger: boolean; ask: boolean; note?: string }`; `orderActions(o): OrderAction[]`
  - `actionRequest(kind, id): { path: string; body?: string }` (always PATCH)
  - `holdUntilText(expiresAt: string): string`; `paymentLabel(method: string, status: string): string`

- [ ] **Step 1: Failing tests**

```ts
// frontend-petshop/test/adminOrders.test.ts
import { describe, expect, it } from 'vitest';
import { actionRequest, holdUntilText, orderActions, orderBadge, ordersApiPath, ordersHref, parseOrdersQuery, paymentLabel } from '../lib/adminOrders';

// /admin/don-hang rules (spec 2026-10-21 admin orders): list state lives in the URL with one
// address per state, labels match the customer pages, and each status offers only the moves the
// backend's state machine accepts.
const now = new Date('2026-10-21T05:00:00.000Z');

describe('URL state', () => {
  it('reads tab, search, page and the open order, falling back to defaults', () => {
    expect(parseOrdersQuery(new URLSearchParams('tab=pending&q=%20NP-26%20&page=3&ma=NP-261016-K3F9A2'))).toEqual({ tab: 'pending', q: 'NP-26', page: 3, ma: 'NP-261016-K3F9A2' });
    expect(parseOrdersQuery(new URLSearchParams('tab=weird&q=a&page=-2&ma=<x>'))).toEqual({ tab: 'all', q: '', page: 1, ma: null });
  });

  it('writes only what differs from the defaults', () => {
    expect(ordersHref({})).toBe('/admin/don-hang');
    expect(ordersHref({ tab: 'pending', q: 'mai', page: 2, ma: 'NP-1' })).toBe('/admin/don-hang?tab=pending&q=mai&page=2&ma=NP-1');
    expect(ordersHref({ tab: 'all', page: 1 })).toBe('/admin/don-hang');
  });

  it('builds the API request for a list state', () => {
    expect(ordersApiPath({ tab: 'processing', q: '0901', page: 2, ma: null })).toBe('/orders/admin/list?page=2&pageSize=20&orderStatus=PROCESSING&q=0901');
    expect(ordersApiPath({ tab: 'all', q: '', page: 1, ma: null })).toBe('/orders/admin/list?page=1&pageSize=20');
  });
});

describe('labels', () => {
  it('adds the remaining hold to a pending transfer', () => {
    expect(orderBadge({ orderStatus: 'PENDING_PAYMENT', paymentStatus: 'PENDING', expiresAt: '2026-10-21T07:30:00.000Z' }, now)).toEqual({ label: 'Chờ chuyển khoản · còn 2 giờ', tone: 'wait' });
    expect(orderBadge({ orderStatus: 'PENDING_PAYMENT', paymentStatus: 'PENDING', expiresAt: '2026-10-21T04:00:00.000Z' }, now).label).toBe('Chờ chuyển khoản · quá hạn');
    expect(orderBadge({ orderStatus: 'CONFIRMED', paymentStatus: 'UNPAID', expiresAt: null }, now)).toEqual({ label: 'Đã xác nhận', tone: 'ok' });
  });

  it('describes how the order is paid', () => {
    expect(paymentLabel('COD', 'UNPAID')).toBe('COD · Thu khi giao');
    expect(paymentLabel('BANK_TRANSFER', 'PAID')).toBe('Chuyển khoản · Đã thanh toán');
    expect(paymentLabel('BANK_TRANSFER', 'EXPIRED')).toBe('Chuyển khoản · Quá hạn');
  });

  it('shows the hold deadline in Vietnam time', () => {
    expect(holdUntilText('2026-10-21T07:30:00.000Z')).toBe('14:30 21/10');
  });
});

describe('orderActions', () => {
  const kinds = (o: { orderStatus: string; paymentMethod: string; paymentStatus: string }) => orderActions(o).map((a) => a.kind);

  it('follows the order state machine', () => {
    expect(kinds({ orderStatus: 'PENDING_PAYMENT', paymentMethod: 'BANK_TRANSFER', paymentStatus: 'PENDING' })).toEqual(['confirm-payment', 'cancel']);
    expect(kinds({ orderStatus: 'CONFIRMED', paymentMethod: 'COD', paymentStatus: 'UNPAID' })).toEqual(['processing', 'cancel']);
    expect(kinds({ orderStatus: 'PROCESSING', paymentMethod: 'COD', paymentStatus: 'UNPAID' })).toEqual(['completed']);
    expect(kinds({ orderStatus: 'COMPLETED', paymentMethod: 'COD', paymentStatus: 'PAID' })).toEqual([]);
    expect(kinds({ orderStatus: 'CANCELLED', paymentMethod: 'BANK_TRANSFER', paymentStatus: 'EXPIRED' })).toEqual([]);
  });

  it('asks before money or stock moves, and notes COD cash on completion', () => {
    const pending = orderActions({ orderStatus: 'PENDING_PAYMENT', paymentMethod: 'BANK_TRANSFER', paymentStatus: 'PENDING' });
    expect(pending.map((a) => a.ask)).toEqual([true, true]);
    expect(pending[1].danger).toBe(true);
    expect(orderActions({ orderStatus: 'PROCESSING', paymentMethod: 'COD', paymentStatus: 'UNPAID' })[0].note).toMatch(/tiền mặt/);
  });

  it('maps each action to its endpoint', () => {
    expect(actionRequest('confirm-payment', 'o1')).toEqual({ path: '/orders/admin/o1/confirm-payment' });
    expect(actionRequest('cancel', 'o1')).toEqual({ path: '/orders/admin/o1/cancel' });
    expect(actionRequest('processing', 'o1')).toEqual({ path: '/orders/admin/o1/status', body: '{"status":"PROCESSING"}' });
    expect(actionRequest('completed', 'o1')).toEqual({ path: '/orders/admin/o1/status', body: '{"status":"COMPLETED"}' });
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement**

```ts
// frontend-petshop/lib/adminOrders.ts
import { timeLeft } from './adminDashboard';
import { orderStatusLabel, type StatusTone } from './orders';

// Rules of /admin/don-hang (spec 2026-10-21 admin orders, test/adminOrders.test.ts): the list state
// lives in the URL (shareable, Back works, one address per state), labels match the customer pages,
// and each status offers only the moves the backend's ORDER_TRANSITIONS accept.
export const ORDER_TABS = [
  { key: 'all', label: 'Tất cả', status: null },
  { key: 'pending', label: 'Chờ thanh toán', status: 'PENDING_PAYMENT' },
  { key: 'confirmed', label: 'Đã xác nhận', status: 'CONFIRMED' },
  { key: 'processing', label: 'Đang xử lý', status: 'PROCESSING' },
  { key: 'completed', label: 'Hoàn tất', status: 'COMPLETED' },
  { key: 'cancelled', label: 'Đã huỷ', status: 'CANCELLED' },
] as const;

export type OrderTab = (typeof ORDER_TABS)[number]['key'];
export type OrdersQuery = { tab: OrderTab; q: string; page: number; ma: string | null };

export const ORDERS_PAGE_SIZE = 20;
const BASE = '/admin/don-hang';
const CODE = /^[A-Za-z0-9-]{3,40}$/;

export function parseOrdersQuery(sp: URLSearchParams): OrdersQuery {
  const tab = ORDER_TABS.find((t) => t.key === sp.get('tab'))?.key ?? 'all';
  const q = (sp.get('q') ?? '').trim();
  const page = Number(sp.get('page'));
  const ma = sp.get('ma');
  return {
    tab,
    q: q.length >= 2 && q.length <= 50 ? q : '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
    ma: ma && CODE.test(ma) ? ma : null,
  };
}

export function ordersHref(s: Partial<OrdersQuery>): string {
  const p = new URLSearchParams();
  if (s.tab && s.tab !== 'all') p.set('tab', s.tab);
  if (s.q) p.set('q', s.q);
  if (s.page && s.page > 1) p.set('page', String(s.page));
  if (s.ma) p.set('ma', s.ma);
  const qs = p.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

export function ordersApiPath(s: OrdersQuery): string {
  const p = new URLSearchParams({ page: String(s.page), pageSize: String(ORDERS_PAGE_SIZE) });
  const status = ORDER_TABS.find((t) => t.key === s.tab)?.status;
  if (status) p.set('orderStatus', status);
  if (s.q) p.set('q', s.q);
  return `/orders/admin/list?${p}`;
}

type StatusFields = { orderStatus: string; paymentStatus: string; expiresAt: string | null };

// The customer-page label, plus how long a pending transfer still holds its stock.
export function orderBadge(o: StatusFields, now: Date): { label: string; tone: StatusTone } {
  const base = orderStatusLabel(o);
  if (o.orderStatus !== 'PENDING_PAYMENT' || !o.expiresAt) return base;
  const left = timeLeft(o.expiresAt, now);
  return { ...base, label: `${base.label} · ${left === 'đã quá hạn' ? 'quá hạn' : left}` };
}

const METHOD: Record<string, string> = { COD: 'COD', BANK_TRANSFER: 'Chuyển khoản', VNPAY: 'VNPay' };
const PAYMENT: Record<string, string> = { PAID: 'Đã thanh toán', PENDING: 'Chờ thanh toán', UNPAID: 'Thu khi giao', EXPIRED: 'Quá hạn', FAILED: 'Thất bại' };

export function paymentLabel(method: string, status: string): string {
  return `${METHOD[method] ?? method} · ${PAYMENT[status] ?? status}`;
}

// "HH:mm dd/MM" in Vietnam time (UTC+7, no daylight saving).
export function holdUntilText(expiresAt: string): string {
  const d = new Date(Date.parse(expiresAt) + 7 * 3_600_000);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())} ${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}`;
}

export type OrderActionKind = 'confirm-payment' | 'processing' | 'completed' | 'cancel';
export type OrderAction = { kind: OrderActionKind; label: string; danger: boolean; ask: boolean; note?: string };

const CANCEL: OrderAction = { kind: 'cancel', label: 'Huỷ đơn & hoàn kho', danger: true, ask: true };

// Mirrors backend ORDER_TRANSITIONS; money and stock moves ask for confirmation first.
export function orderActions(o: { orderStatus: string; paymentMethod: string; paymentStatus: string }): OrderAction[] {
  switch (o.orderStatus) {
    case 'PENDING_PAYMENT':
      return o.paymentMethod === 'BANK_TRANSFER' ? [{ kind: 'confirm-payment', label: '✓ Xác nhận đã nhận tiền', danger: false, ask: true }, CANCEL] : [CANCEL];
    case 'CONFIRMED':
      return [{ kind: 'processing', label: 'Đang giao', danger: false, ask: false }, CANCEL];
    case 'PROCESSING':
      return [{ kind: 'completed', label: 'Hoàn tất', danger: false, ask: false, ...(o.paymentStatus === 'UNPAID' && { note: 'Đơn COD: hoàn tất nghĩa là đã thu tiền mặt.' }) }];
    default:
      return [];
  }
}

export function actionRequest(kind: OrderActionKind, id: string): { path: string; body?: string } {
  const base = `/orders/admin/${encodeURIComponent(id)}`;
  if (kind === 'confirm-payment') return { path: `${base}/confirm-payment` };
  if (kind === 'cancel') return { path: `${base}/cancel` };
  return { path: `${base}/status`, body: JSON.stringify({ status: kind === 'processing' ? 'PROCESSING' : 'COMPLETED' }) };
}
```
`types.ts`: `export interface AdminOrder extends Order { user: { id: string; email: string; fullName: string | null } | null }`. `adminNav.ts`: Đơn hàng `ready: true`; in `test/adminNav.test.ts` change the not-ready example to `/admin/bao-gia` and add `expect(isNavReady('/admin/don-hang')).toBe(true)` (the page now exists — spec change). Check `orderStatusLabel` for PENDING_PAYMENT returns `{ label: 'Chờ chuyển khoản', tone: 'wait' }` (it does) and `PaymentStatus` labels against the backend constants.

- [ ] **Step 3: Run** → PASS; typecheck.

---

### Task 3: `/admin/don-hang` screen

**Files:**
- Create: `frontend-petshop/app/admin/don-hang/page.tsx`
- Create: `frontend-petshop/components/admin/orders/OrdersManager.tsx` (URL state, loading, layout)
- Create: `frontend-petshop/components/admin/orders/OrdersFilters.tsx` (tabs + search)
- Create: `frontend-petshop/components/admin/orders/OrdersList.tsx` (cards + table)
- Create: `frontend-petshop/components/admin/orders/OrderDetail.tsx` (dialog + actions)
- Modify: `frontend-petshop/components/admin/dashboard/Dashboard.tsx` (links)

**Interfaces:**
- Consumes: Task 2; `authFetch`, `BRAND_SLUG`, `formatVnd`, `OrderStatusBadge`-style tones (reuse the `TONES` map by exporting it from `components/orders/OrderStatusBadge.tsx` as `STATUS_TONE_CLASSES`), `Pagination`, `FormAlert`.

- [ ] **Step 1: Page**

```tsx
// frontend-petshop/app/admin/don-hang/page.tsx
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrdersManager } from '../../../components/admin/orders/OrdersManager';

export const metadata: Metadata = { title: 'Đơn hàng' };

// useSearchParams needs a Suspense boundary for the static shell (Next 16).
export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Đang tải đơn hàng" className="h-60 animate-pulse rounded-card bg-surface" />}>
      <OrdersManager />
    </Suspense>
  );
}
```

- [ ] **Step 2: `OrdersManager.tsx`**

```tsx
'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ORDERS_PAGE_SIZE, ordersApiPath, ordersHref, parseOrdersQuery, type OrdersQuery } from '../../../lib/adminOrders';
import { authFetch } from '../../../lib/adminAuth';
import { BRAND_SLUG } from '../../../lib/site';
import type { AdminOrder, PageMeta } from '../../../lib/types';
import { Pagination } from '../../ui/Pagination';
import { OrderDetail } from './OrderDetail';
import { OrdersFilters } from './OrdersFilters';
import { OrdersList } from './OrdersList';

export const BRAND_HEADERS = { 'X-Brand-Slug': BRAND_SLUG };
type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: AdminOrder[]; total: number };

async function fetchPage(s: OrdersQuery): Promise<Load> {
  const res = await authFetch<AdminOrder[]>(ordersApiPath(s), { headers: BRAND_HEADERS });
  if (res.error || !res.data) return { state: 'error' };
  return { state: 'ready', rows: res.data, total: (res.meta as PageMeta | null)?.total ?? res.data.length };
}

async function fetchPendingCount(): Promise<number | null> {
  const res = await authFetch<AdminOrder[]>('/orders/admin/list?orderStatus=PENDING_PAYMENT&pageSize=1', { headers: BRAND_HEADERS });
  return res.error ? null : ((res.meta as PageMeta | null)?.total ?? null);
}

// /admin/don-hang (wireframe admin-orders.html). The URL is the list state; this component loads the
// matching page, the "Chờ thanh toán (N)" count, and the order named by ?ma= for the drawer.
export function OrdersManager() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = parseOrdersQuery(new URLSearchParams(sp.toString()));
  const key = ordersApiPath(query);
  const [load, setLoad] = useState<Load & { key?: string }>({ state: 'loading' });
  const [pending, setPending] = useState<number | null>(null);
  const [opened, setOpened] = useState<AdminOrder | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = useCallback(async () => {
    const [page, count] = await Promise.all([fetchPage(query), fetchPendingCount()]);
    setLoad({ ...page, key });
    setPending(count);
    // eslint-safe: query/key are derived from the URL each render
  }, [key]); // eslint-disable is NOT allowed — derive inside instead (see note)

  useEffect(() => {
    let active = true;
    Promise.all([fetchPage(parseOrdersQuery(new URLSearchParams(key.split('?')[1] ?? ''))), fetchPendingCount()]).then(([page, count]) => {
      if (!active) return;
      setLoad({ ...page, key });
      setPending(count);
    });
    return () => {
      active = false;
    };
  }, [key]);
  …
}
```
**Note for the implementer (replace the sketch above with a clean version):** keep `fetchPage`/`fetchPendingCount` outside the component; derive `query` from `useSearchParams()` each render; the effect depends on a stable string (`sp.toString()`), calls `fetchPage(parseOrdersQuery(new URLSearchParams(that string)))`, and sets state only in `.then` with an `active` flag; `reload` (used after actions) does the same through `useCallback([spString])`. `state === 'ready' && load.key !== key` renders as loading (stale page). The opened order: `query.ma` → find in `rows`; if absent, fetch `ordersApiPath({ tab: 'all', q: ma, page: 1, ma: null })` and take the row whose `code === ma`. Navigation: `router.push(ordersHref({...query, ...patch}))` for tab / page / opening (Back closes the drawer); `router.replace` for search typing; closing the drawer → `ordersHref({ ...query, ma: null })` with `replace`. No eslint-disable anywhere.

Render:
```tsx
  <div className="flex flex-col gap-4">
    <h1 className="text-2xl leading-[1.3] font-extrabold">Đơn hàng</h1>
    <OrdersFilters query={query} pendingCount={pending} onChange={(patch, mode) => go({ ...patch, page: 1 }, mode)} />
    {notice && <p role="status" className={notice.ok ? 'text-sm text-brand-ink' : 'rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink'}>{notice.text}</p>}
    {/* loading skeleton / error with "Thử lại" (reload) / empty text per spec / OrdersList */}
    <Pagination page={query.page} totalPages={Math.ceil(total / ORDERS_PAGE_SIZE)} hrefFor={(p) => ordersHref({ ...query, page: p, ma: null })} />
    {openedOrder && <OrderDetail order={openedOrder} onClose={closeDetail} onDone={afterAction} />}
  </div>
```
Empty text: `query.q ? \`Không tìm thấy đơn khớp «${query.q}».\` : 'Chưa có đơn nào.'`.

- [ ] **Step 3: `OrdersFilters.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { ORDER_TABS, type OrdersQuery } from '../../../lib/adminOrders';

type Props = { query: OrdersQuery; pendingCount: number | null; onChange: (patch: Partial<OrdersQuery>, mode: 'push' | 'replace') => void };

const SEARCH_DEBOUNCE_MS = 300;

// Status tabs (scroll sideways on phones, each ≥ 44px) and the search box, which updates the URL
// 300 ms after typing stops — fewer requests, and Back is not filled with one entry per keystroke.
export function OrdersFilters({ query, pendingCount, onChange }: Props) {
  const [text, setText] = useState(query.q);

  useEffect(() => {
    const t = text.trim();
    if (t === query.q || (t.length > 0 && t.length < 2)) return;
    const timer = setTimeout(() => onChange({ q: t }, 'replace'), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, query.q, onChange]);

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Lọc theo trạng thái" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {ORDER_TABS.map((t) => {
          const on = t.key === query.tab;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => onChange({ tab: t.key }, 'push')}
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold whitespace-nowrap ${on ? 'bg-brand-ink text-white' : 'border border-line bg-surface text-ink'}`}>
              {t.label}{t.key === 'pending' && pendingCount !== null ? ` (${pendingCount})` : ''}
            </button>
          );
        })}
      </div>
      <label className="flex flex-col gap-1">
        <span className="sr-only">Tìm đơn</span>
        <input type="search" inputMode="search" enterKeyHint="search" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Tìm mã đơn, SĐT hoặc tên khách" maxLength={50}
          className="min-h-12 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base md:max-w-sm" />
      </label>
    </div>
  );
}
```
`onChange` passed from the manager must be stable (`useCallback` on the search-param string) or the debounce effect re-fires; clearing the box (`t === ''`) also triggers (`q: ''`).

- [ ] **Step 4: `OrdersList.tsx`**

```tsx
'use client';

import { orderBadge } from '../../../lib/adminOrders';
import { formatVnd } from '../../../lib/storefront';
import type { AdminOrder } from '../../../lib/types';
import { STATUS_TONE_CLASSES } from '../../orders/OrderStatusBadge';

type Props = { rows: AdminOrder[]; now: Date; onOpen: (o: AdminOrder) => void };

const day = (iso: string) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const method = (o: AdminOrder) => (o.paymentMethod === 'BANK_TRANSFER' ? 'Chuyển khoản' : o.paymentMethod);

// Cards on phones, a table from 768px (wireframe). The row button for a pending transfer says what
// the owner came to do ("Đã nhận tiền"); it opens the order so the money is confirmed after a look.
export function OrdersList({ rows, now, onOpen }: Props) {
  const badge = (o: AdminOrder) => {
    const b = orderBadge(o, now);
    return <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE_CLASSES[b.tone]}`}>{b.label}</span>;
  };
  const cta = (o: AdminOrder) => (o.orderStatus === 'PENDING_PAYMENT' && o.paymentMethod === 'BANK_TRANSFER' ? 'Đã nhận tiền' : 'Xem');
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((o) => (
          <li key={o.id}>
            <button type="button" onClick={() => onOpen(o)} className="flex w-full flex-col gap-2 rounded-card border border-line bg-surface p-4 text-left active:bg-surface-alt">
              <span className="flex w-full flex-wrap items-center justify-between gap-2"><b className="break-all text-ink">{o.code}</b>{badge(o)}</span>
              <small className="text-muted">{o.shippingAddress.fullName} · {o.shippingAddress.phone} · {method(o)}</small>
              <span className="flex w-full justify-between text-sm"><b className="tabular-nums text-ink">{formatVnd(o.grandTotal)}</b><span className="text-muted">{day(o.createdAt)}</span></span>
            </button>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-left text-muted">
            <tr><th className="p-3">Mã đơn</th><th className="p-3">Khách</th><th className="p-3">Thanh toán</th><th className="p-3">Trạng thái</th><th className="p-3 text-right">Tổng</th><th className="p-3">Ngày</th><th className="p-3"><span className="sr-only">Thao tác</span></th></tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-t border-line">
                <td className="p-3 font-bold text-ink">{o.code}</td>
                <td className="p-3">{o.shippingAddress.fullName}<br /><small className="text-muted">{o.shippingAddress.phone}</small></td>
                <td className="p-3">{method(o)}</td>
                <td className="p-3">{badge(o)}</td>
                <td className="p-3 text-right font-bold tabular-nums">{formatVnd(o.grandTotal)}</td>
                <td className="p-3 whitespace-nowrap">{day(o.createdAt)}</td>
                <td className="p-3 text-right">
                  <button type="button" onClick={() => onOpen(o)} aria-label={`${cta(o)} — đơn ${o.code}`}
                    className={`min-h-11 rounded-full px-4 font-bold whitespace-nowrap ${cta(o) === 'Xem' ? 'border border-line text-ink' : 'bg-brand-ink text-white'}`}>{cta(o)}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```
In `components/orders/OrderStatusBadge.tsx` rename `TONES` to exported `STATUS_TONE_CLASSES` (the badge keeps using it).

- [ ] **Step 5: `OrderDetail.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { actionRequest, holdUntilText, orderActions, orderBadge, paymentLabel, type OrderAction } from '../../../lib/adminOrders';
import { authFetch } from '../../../lib/adminAuth';
import { formatVnd } from '../../../lib/storefront';
import type { AdminOrder } from '../../../lib/types';
import { STATUS_TONE_CLASSES } from '../../orders/OrderStatusBadge';
import { BRAND_HEADERS } from './OrdersManager';

type Props = { order: AdminOrder; now: Date; onClose: () => void; onDone: (text: string, changed: boolean) => void };

// One order in a <dialog> (bottom sheet on phones, right drawer from lg): items, totals, delivery,
// payment, and the moves its status allows. Money and stock moves ask first; a 409 means someone
// (or the expiry job) changed the order meanwhile — the list reloads and says so.
export function OrderDetail({ order, now, onClose, onDone }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    dialog.current?.showModal();
  }, []);

  async function run(a: OrderAction) {
    if (a.ask && !window.confirm(`${a.label} — đơn ${order.code} (${formatVnd(order.grandTotal)})?`)) return;
    setBusy(true);
    setError(null);
    const { path, body } = actionRequest(a.kind, order.id);
    const res = await authFetch(path, { method: 'PATCH', headers: BRAND_HEADERS, ...(body && { body }) });
    setBusy(false);
    if (!res.error) return onDone(`Đã cập nhật đơn ${order.code}.`, true);
    if (res.error.code && /STATE|ALREADY_PAID|TRANSITION|EXPIRED/.test(res.error.code)) return onDone(`Đơn ${order.code} vừa thay đổi — đã tải lại.`, true);
    setError(res.error.message || 'Không cập nhật được đơn.');
  }

  const b = orderBadge(order, now);
  const a = order.shippingAddress;
  return (
    <dialog ref={dialog} aria-labelledby="order-title"
      onClose={() => { onClose(); if (opener.current instanceof HTMLElement) opener.current.focus(); }}
      onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-[var(--radius-lg)] bg-surface p-0 backdrop:bg-ink/60 lg:inset-y-0 lg:top-0 lg:right-0 lg:left-auto lg:h-dvh lg:max-h-none lg:w-[32rem] lg:rounded-none">
      <div className="flex flex-col gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="order-title" className="text-lg leading-[1.4] font-extrabold break-all">{order.code}</h2>
            <span className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE_CLASSES[b.tone]}`}>{b.label}</span>
            {order.orderStatus === 'PENDING_PAYMENT' && order.expiresAt && <p className="mt-1 text-sm text-muted">Giữ hàng tới {holdUntilText(order.expiresAt)}</p>}
          </div>
          <button type="button" aria-label="Đóng" onClick={() => dialog.current?.close()} className="grid size-11 shrink-0 place-items-center rounded-full border border-line text-xl">✕</button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-muted"><tr><th className="py-1">Sản phẩm</th><th className="py-1 text-right">SL</th><th className="py-1 text-right">Thành tiền</th></tr></thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id} className="border-t border-line align-top">
                <td className="py-2">{i.productName}<br /><small className="text-muted">{i.sku}</small></td>
                <td className="py-2 text-right tabular-nums">{i.quantity}</td>
                <td className="py-2 text-right tabular-nums">{formatVnd(i.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="tabular-nums">
            <tr className="border-t border-line"><td colSpan={2} className="py-1">Tạm tính</td><td className="py-1 text-right">{formatVnd(order.subtotal)}</td></tr>
            <tr><td colSpan={2} className="py-1">Phí ship</td><td className="py-1 text-right">{formatVnd(order.shippingFee)}</td></tr>
            <tr className="font-extrabold"><td colSpan={2} className="py-1">Tổng</td><td className="py-1 text-right">{formatVnd(order.grandTotal)}</td></tr>
          </tfoot>
        </table>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">Giao tới</dt><dd className="break-words">{a.fullName} · <a href={`tel:${a.phone.replace(/[^\d+]/g, '')}`} className="font-bold text-brand-ink underline">{a.phone}</a><br />{a.addressLine}, {a.city}</dd>
          {order.note && (<><dt className="text-muted">Ghi chú</dt><dd className="break-words">{order.note}</dd></>)}
          <dt className="text-muted">Tài khoản</dt><dd className="break-all">{order.user?.email ?? '—'}</dd>
          <dt className="text-muted">Thanh toán</dt><dd>{paymentLabel(order.paymentMethod, order.paymentStatus)}</dd>
          <dt className="text-muted">Đặt lúc</dt><dd>{new Date(order.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</dd>
          {order.paidAt && (<><dt className="text-muted">Thanh toán lúc</dt><dd>{new Date(order.paidAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</dd></>)}
        </dl>
        {error && <p role="alert" className="rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink">{error}</p>}
        {orderActions(order).length > 0 && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            {orderActions(order).map((x) => (
              <div key={x.kind} className="flex flex-col gap-1">
                <button type="button" disabled={busy} onClick={() => run(x)}
                  className={`min-h-12 rounded-full px-5 font-bold disabled:opacity-60 ${x.danger ? 'border-2 border-pink-ink text-pink-ink' : 'bg-brand-ink text-white'}`}>{busy ? 'Đang cập nhật…' : x.label}</button>
                {x.note && <small className="text-muted">{x.note}</small>}
              </div>
            ))}
          </div>
        )}
      </div>
    </dialog>
  );
}
```
Before writing, check the real 409 codes in `backend/controllers/order.controller.ts` (`orderChangedConcurrently`, `assertTransition`, confirmPayment's "already paid") and match them exactly instead of the regex if they are few: e.g. `new Set(['ORDER_STATE_CHANGED', 'INVALID_STATE_TRANSITION', 'ALREADY_PAID'])`. Move `BRAND_HEADERS` into `lib/adminOrders.ts` or a small shared module if importing from `OrdersManager` creates a cycle.

- [ ] **Step 6: Dashboard links** — in `Dashboard.tsx` the "Xử lý ›" action → `/admin/don-hang?tab=pending`; the "Xác nhận" link → `ordersHref({ tab: 'pending', ma: o.code })` (import from `lib/adminOrders`).

- [ ] **Step 7: Verify** — `npm run lint && npm run typecheck && npm test`; build; restart; browser (scratchpad CDP + admin token) on the local DB:
  - Create one BANK_TRANSFER order through the customer API (scratchpad script: register / log in a test customer via BFF or backend, add a demo variant to the cart, `POST /orders`), so a pending transfer exists.
  - `/admin/don-hang`: tabs filter; "Chờ thanh toán (1)"; search by the code in lowercase and by "0901 234"; empty search text message; `?ma=` opens the drawer; row "Đã nhận tiền" → confirm → order moves to "Đã xác nhận" and the count drops; a COD order → "Đang giao" → "Hoàn tất" (payment becomes "Đã thanh toán"); cancel one order (confirm dialog) → "Đã huỷ".
  - Dashboard "Xác nhận" link opens that order.
  - 390 / 768 / 1280 / 195: no horizontal scroll, tabs scroll sideways, tap targets ≥ 44px, Esc closes the drawer and focus returns.
  - Leave the local DB as found except the test orders created here (they are local demo data; list them in the report).

---

### Task 4: Docs and commits

- [ ] PROGRESS entry.
- [ ] Backend `npm run typecheck && npm test && npm run test:db`; frontend `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] Propose commits, wait for "ok": `add order search to the admin order list` (backend), `add admin orders page` (frontend).
