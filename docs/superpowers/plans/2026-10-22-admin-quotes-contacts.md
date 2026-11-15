# Admin Quotes + Contacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/bao-gia` (quote requests: stats, tabs, call / close with real amount / reopen / delete spam) and `/admin/lien-he` (contact messages: tabs, reply by email, call, mark read, delete).

**Architecture:** Pure helpers `lib/adminQuotes.ts` and `lib/adminContacts.ts` (URL state, allowed actions, amount parsing, mailto) carry the tests. Two client managers follow the orders page pattern: URL → `useSearchParams` → load in an effect keyed by the URL string, state only set in promise callbacks. Cards on every width (wireframe). No backend change.

**Tech Stack:** Next.js 16.3.4, React 19, Tailwind v4, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-22-admin-quotes-contacts-design.md`; wireframes `admin-quotes.html`, `admin-contacts.html`.
- Quote endpoints need `X-Brand-Slug` (use `ADMIN_BRAND_HEADERS` from `lib/adminOrders.ts`); contacts do not need it but sending it is harmless.
- Quote tabs `new|contacted|closed|all` (default `new`); contact tabs `unread|read|all` (default `unread`); 20 per page; defaults never written to the URL.
- Close amount: integer 0–2 000 000 000, dots / spaces allowed when typing.
- Customer text (note, message) rendered as plain text (`whitespace-pre-line break-words`), never HTML.
- Tap targets ≥ 44px; money `tabular-nums`; no horizontal scroll; dialogs bottom sheet on phones.
- No `any`, no `eslint-disable`, no setState synchronously in effects. Commit short, no attribution, user approves; never commit `docs/`, the PDF or the user's `.md` files.

---

### Task 1: Pure helpers

**Files:**
- Create: `frontend-petshop/lib/adminQuotes.ts`, `frontend-petshop/lib/adminContacts.ts`
- Modify: `frontend-petshop/lib/types.ts` (`AdminQuote`, `ContactMessage` if not already declared — check first), `frontend-petshop/lib/adminNav.ts` (Báo giá + Tin nhắn `ready: true`)
- Test: `frontend-petshop/test/adminQuotes.test.ts`, `frontend-petshop/test/adminContacts.test.ts`; adjust `test/adminNav.test.ts` (not-ready example → `/admin/san-pham`; Báo giá now ready — spec change)

**Interfaces:**
- `type QuoteTab = 'new' | 'contacted' | 'closed' | 'all'`; `QUOTE_TABS`; `type QuotesQuery = { tab: QuoteTab; page: number }`; `parseQuotesQuery(sp)`, `quotesHref(s)`, `quotesApiPath(s)`
- `type QuoteActionKind = 'contacted' | 'close' | 'delete' | 'reopen-new' | 'edit-amount' | 'reopen'`; `quoteActions(status): { kind; label; danger: boolean; ask: boolean }[]`
- `parseAmount(text): number | null`; `webTotal(items: { lineTotal: number }[]): number`
- `type ContactTab = 'unread' | 'read' | 'all'`; `CONTACT_TABS`; `parseContactsQuery`, `contactsHref`, `contactsApiPath`; `mailtoHref(email, subject): string`

- [ ] **Step 1: Failing tests**

```ts
// frontend-petshop/test/adminQuotes.test.ts
import { describe, expect, it } from 'vitest';
import { parseAmount, parseQuotesQuery, quoteActions, quotesApiPath, quotesHref, webTotal } from '../lib/adminQuotes';

// /admin/bao-gia (spec 2026-10-22): list state in the URL (default tab "Mới" left out), the moves
// each status offers, and the real closing amount the owner types.
describe('quotes URL state', () => {
  it('reads and writes tab + page with "new" as the default', () => {
    expect(parseQuotesQuery(new URLSearchParams(''))).toEqual({ tab: 'new', page: 1 });
    expect(parseQuotesQuery(new URLSearchParams('tab=closed&page=2'))).toEqual({ tab: 'closed', page: 2 });
    expect(parseQuotesQuery(new URLSearchParams('tab=x&page=0'))).toEqual({ tab: 'new', page: 1 });
    expect(quotesHref({ tab: 'new', page: 1 })).toBe('/admin/bao-gia');
    expect(quotesHref({ tab: 'all', page: 3 })).toBe('/admin/bao-gia?tab=all&page=3');
  });
  it('builds the API request', () => {
    expect(quotesApiPath({ tab: 'contacted', page: 2 })).toBe('/quote-requests/admin/list?page=2&pageSize=20&status=CONTACTED');
    expect(quotesApiPath({ tab: 'all', page: 1 })).toBe('/quote-requests/admin/list?page=1&pageSize=20');
  });
});

describe('quoteActions', () => {
  const kinds = (s: string) => quoteActions(s).map((a) => a.kind);
  it('offers the next steps of each status', () => {
    expect(kinds('NEW')).toEqual(['contacted', 'close', 'delete']);
    expect(kinds('CONTACTED')).toEqual(['close', 'reopen-new']);
    expect(kinds('CLOSED')).toEqual(['edit-amount', 'reopen']);
  });
  it('asks before deleting or wiping a closed amount', () => {
    expect(quoteActions('NEW').find((a) => a.kind === 'delete')?.ask).toBe(true);
    expect(quoteActions('CLOSED').find((a) => a.kind === 'reopen')?.ask).toBe(true);
  });
});

describe('parseAmount / webTotal', () => {
  it('accepts whole VND amounts typed with dots or spaces', () => {
    expect(parseAmount('350.000')).toBe(350000);
    expect(parseAmount(' 1 250 000 ')).toBe(1250000);
    expect(parseAmount('0')).toBe(0);
  });
  it('refuses empty, negative, decimal or huge amounts', () => {
    for (const v of ['', 'abc', '-5', '12,5', '2000000001']) expect(parseAmount(v), v).toBeNull();
  });
  it('adds the web prices of the requested items', () => {
    expect(webTotal([{ lineTotal: 54000 }, { lineTotal: 215000 }])).toBe(269000);
  });
});
```

```ts
// frontend-petshop/test/adminContacts.test.ts
import { describe, expect, it } from 'vitest';
import { contactsApiPath, contactsHref, mailtoHref, parseContactsQuery } from '../lib/adminContacts';

// /admin/lien-he (spec 2026-10-22): unread first by default, and a reply link that opens the
// owner's mail app with the subject filled in.
describe('contacts URL state', () => {
  it('defaults to unread and maps tabs to isRead', () => {
    expect(parseContactsQuery(new URLSearchParams(''))).toEqual({ tab: 'unread', page: 1 });
    expect(contactsHref({ tab: 'unread', page: 1 })).toBe('/admin/lien-he');
    expect(contactsHref({ tab: 'read', page: 2 })).toBe('/admin/lien-he?tab=read&page=2');
    expect(contactsApiPath({ tab: 'unread', page: 1 })).toBe('/contact/admin/list?page=1&pageSize=20&isRead=false');
    expect(contactsApiPath({ tab: 'all', page: 1 })).toBe('/contact/admin/list?page=1&pageSize=20');
  });
});

describe('mailtoHref', () => {
  it('replies with "Re:" and encodes everything', () => {
    expect(mailtoHref('ha@example.com', 'Hỏi về pate')).toBe('mailto:ha@example.com?subject=Re%3A%20H%E1%BB%8Fi%20v%E1%BB%81%20pate');
    expect(mailtoHref('ha@example.com', null)).toBe('mailto:ha@example.com?subject=Re%3A%20Li%C3%AAn%20h%E1%BB%87%20t%E1%BB%AB%20website');
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement**

```ts
// frontend-petshop/lib/adminQuotes.ts
// Rules of /admin/bao-gia (spec 2026-10-22, test/adminQuotes.test.ts). Statuses come from
// backend QUOTE_STATUS; the backend accepts any status change, so the screen offers only the ones
// that make sense for the owner's workflow (call → close with the real amount, or clean up spam).
export const QUOTE_TABS = [
  { key: 'new', label: 'Mới', status: 'NEW' },
  { key: 'contacted', label: 'Đã liên hệ', status: 'CONTACTED' },
  { key: 'closed', label: 'Đã chốt', status: 'CLOSED' },
  { key: 'all', label: 'Tất cả', status: null },
] as const;
export type QuoteTab = (typeof QUOTE_TABS)[number]['key'];
export type QuotesQuery = { tab: QuoteTab; page: number };
export const QUOTES_PAGE_SIZE = 20;
const BASE = '/admin/bao-gia';
export const MAX_CLOSE_AMOUNT = 2_000_000_000;

const pageOf = (raw: string | null) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 1 ? n : 1;
};

export function parseQuotesQuery(sp: URLSearchParams): QuotesQuery {
  return { tab: QUOTE_TABS.find((t) => t.key === sp.get('tab'))?.key ?? 'new', page: pageOf(sp.get('page')) };
}

export function quotesHref(s: Partial<QuotesQuery>): string {
  const p = new URLSearchParams();
  if (s.tab && s.tab !== 'new') p.set('tab', s.tab);
  if (s.page && s.page > 1) p.set('page', String(s.page));
  const qs = p.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

export function quotesApiPath(s: QuotesQuery): string {
  const p = new URLSearchParams({ page: String(s.page), pageSize: String(QUOTES_PAGE_SIZE) });
  const status = QUOTE_TABS.find((t) => t.key === s.tab)?.status;
  if (status) p.set('status', status);
  return `/quote-requests/admin/list?${p}`;
}

export type QuoteActionKind = 'contacted' | 'close' | 'delete' | 'reopen-new' | 'edit-amount' | 'reopen';
export type QuoteAction = { kind: QuoteActionKind; label: string; danger: boolean; ask: boolean };

export function quoteActions(status: string): QuoteAction[] {
  if (status === 'NEW') return [
    { kind: 'contacted', label: 'Đã gọi', danger: false, ask: false },
    { kind: 'close', label: 'Chốt đơn…', danger: false, ask: false },
    { kind: 'delete', label: 'Xoá (spam)', danger: true, ask: true },
  ];
  if (status === 'CONTACTED') return [
    { kind: 'close', label: 'Chốt đơn…', danger: false, ask: false },
    { kind: 'reopen-new', label: 'Đưa về Mới', danger: false, ask: false },
  ];
  if (status === 'CLOSED') return [
    { kind: 'edit-amount', label: 'Sửa số tiền chốt', danger: false, ask: false },
    { kind: 'reopen', label: 'Mở lại', danger: true, ask: true },
  ];
  return [];
}

// "350.000" / "1 250 000" → whole VND; null for anything that is not a whole amount in range.
export function parseAmount(text: string): number | null {
  const cleaned = text.trim().replace(/[.\s]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) && n <= MAX_CLOSE_AMOUNT ? n : null;
}

export const webTotal = (items: { lineTotal: number }[]) => items.reduce((sum, i) => sum + i.lineTotal, 0);
```

```ts
// frontend-petshop/lib/adminContacts.ts
// Rules of /admin/lien-he (spec 2026-10-22, test/adminContacts.test.ts).
export const CONTACT_TABS = [
  { key: 'unread', label: 'Chưa đọc', isRead: 'false' },
  { key: 'read', label: 'Đã đọc', isRead: 'true' },
  { key: 'all', label: 'Tất cả', isRead: null },
] as const;
export type ContactTab = (typeof CONTACT_TABS)[number]['key'];
export type ContactsQuery = { tab: ContactTab; page: number };
export const CONTACTS_PAGE_SIZE = 20;
const BASE = '/admin/lien-he';

export function parseContactsQuery(sp: URLSearchParams): ContactsQuery {
  const page = Number(sp.get('page'));
  return { tab: CONTACT_TABS.find((t) => t.key === sp.get('tab'))?.key ?? 'unread', page: Number.isInteger(page) && page > 1 ? page : 1 };
}

export function contactsHref(s: Partial<ContactsQuery>): string {
  const p = new URLSearchParams();
  if (s.tab && s.tab !== 'unread') p.set('tab', s.tab);
  if (s.page && s.page > 1) p.set('page', String(s.page));
  const qs = p.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

export function contactsApiPath(s: ContactsQuery): string {
  const p = new URLSearchParams({ page: String(s.page), pageSize: String(CONTACTS_PAGE_SIZE) });
  const isRead = CONTACT_TABS.find((t) => t.key === s.tab)?.isRead;
  if (isRead) p.set('isRead', isRead);
  return `/contact/admin/list?${p}`;
}

// The owner replies from their own mail app (the site sends no email).
export function mailtoHref(email: string, subject: string | null): string {
  return `mailto:${email}?subject=${encodeURIComponent(`Re: ${subject?.trim() || 'Liên hệ từ website'}`)}`;
}
```
Types (add to `lib/types.ts` if missing):
```ts
// GET /quote-requests/admin/list rows (admin quotes page).
export interface AdminQuote {
  id: string; customerName: string; phone: string; email: string | null; address: string | null; note: string | null;
  items: { productName: string; variantLabel: string | null; sku: string; quantity: number; unitPrice: number; lineTotal: number }[];
  status: string; finalAmount: number | null; closedAt: string | null; createdAt: string;
}
// GET /contact/admin/list rows.
export interface AdminContactMessage { id: string; name: string; email: string | null; phone: string | null; subject: string | null; message: string; isRead: boolean; createdAt: string }
```
(Format each interface multi-line like the rest of the file.) `adminNav.ts`: Báo giá, Tin nhắn `ready: true`.

- [ ] **Step 3: Run** → PASS; typecheck.

---

### Task 2: `/admin/bao-gia`

**Files:**
- Create: `frontend-petshop/app/admin/bao-gia/page.tsx` (Suspense wrapper like orders)
- Create: `frontend-petshop/components/admin/quotes/QuotesManager.tsx` (URL, list, stats, actions)
- Create: `frontend-petshop/components/admin/quotes/QuoteCard.tsx`
- Create: `frontend-petshop/components/admin/quotes/CloseQuoteDialog.tsx`
- Create: `frontend-petshop/components/admin/AdminTabs.tsx` (shared tab bar: `{ tabs: { key, label }[]; current; onSelect }` — reuse in orders? no, keep orders as is; use in quotes + contacts)

Behaviour (write the components to this; follow `components/admin/orders/*` for structure and class names):
- Manager: `key = useSearchParams().toString()`; effect loads `quotesApiPath(parse(key))` + NEW count (`?status=NEW&pageSize=1` → `meta.total`) → state `{ key, page, newCount }`; stale key renders as loading. Stats: separate effect on `period` (`rangeFor`) → `/quote-requests/admin/stats?from=&to=` → 4 `StatCard`s (`Tổng yêu cầu` = totalRequests, `Đã chốt` = closedCount, `Doanh thu chốt` = formatVnd(revenue), `Giá trị TB` = formatVnd(averageOrderValue) with foot `Tỉ lệ chốt N%`).
- Tabs: `AdminTabs` with "Mới (N)"; `router.push(quotesHref({ tab, page: 1 }))`.
- Card (`QuoteCard`): header name + status badge (`NEW` → tone wait "Mới", `CONTACTED` → ok "Đã liên hệ", `CLOSED` → done "Đã chốt") + `timeAgo`; `☎ <a href="tel:…">` (≥ 44px), email, address; items list "productName · variantLabel × quantity — formatVnd(lineTotal)"; "Giá web: formatVnd(webTotal)"; note `<p className="whitespace-pre-line break-words">“…”</p>`; closed line "Đã chốt: formatVnd(finalAmount) · dd/MM"; action buttons from `quoteActions`.
- Actions: `contacted` → PATCH `{status:'CONTACTED'}`; `reopen-new` → `{status:'NEW'}`; `reopen` (ask) → `{status:'CONTACTED'}`; `delete` (ask) → DELETE; `close` / `edit-amount` → open `CloseQuoteDialog` with initial = finalAmount ?? webTotal; submit → `{status:'CLOSED', finalAmount}`. All via `authFetch` with `ADMIN_BRAND_HEADERS`; errors → notice (409 `QUOTE_NOT_DELETABLE` message shown as is); success → notice + reload list, count and stats.
- `CloseQuoteDialog`: `<dialog>` like OrderDetail (bottom sheet; centered from md: `md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-md md:rounded-[var(--radius-lg)]`); `TextField name="finalAmount" inputMode="numeric"` value formatted with `toLocaleString('vi-VN')`; hint text; `parseAmount` → error under field "Nhập số tiền nguyên từ 0 đến 2.000.000.000 ₫"; server error message under the field; Esc / ✕ / backdrop close; focus returns to opener.

---

### Task 3: `/admin/lien-he`

**Files:**
- Create: `frontend-petshop/app/admin/lien-he/page.tsx` (Suspense)
- Create: `frontend-petshop/components/admin/contacts/ContactsManager.tsx`
- Create: `frontend-petshop/components/admin/contacts/ContactCard.tsx`

Behaviour:
- Manager like quotes (no stats): list + unread count (`?isRead=false&pageSize=1`); tabs "Chưa đọc (N)" · "Đã đọc" · "Tất cả".
- Card: name (bold) · email · `timeAgo`; phone; subject (bold) if any; message `whitespace-pre-line break-words`; unread → `border-2 border-brand-ink`, read → `border border-line`.
- Buttons: "Trả lời qua email" `<a href={mailtoHref(email, subject)}>` when email; "☎ Gọi" `tel:` when phone; "Đánh dấu đã đọc" (PATCH `/contact/admin/:id/read`) when unread; "Xoá" (ask → DELETE). Success → notice + reload.

---

### Task 4: Wire-up, verification, commit

- [ ] `Dashboard.tsx`: "Gọi lại ›" → `/admin/bao-gia`, "Đọc ›" → `/admin/lien-he` (they already appear once `ready`; check hrefs).
- [ ] `npm run lint && npm run typecheck && npm test && npm run build`; restart.
- [ ] Local data: submit 2 quote requests through the public API (`POST /quote-requests` with `X-Brand-Slug`, body per the route's validators — read `routes/quoteRequest.route.ts` / controller `submit` first) and 1 contact message (`POST /contact`).
- [ ] CDP (scratchpad): quotes — "Đã gọi" → Đã liên hệ; "Chốt đơn…" → type "350.000" → Đã chốt 350.000 ₫; "Sửa số tiền chốt" → 400.000; "Mở lại" → Đã liên hệ without amount; delete the other NEW one; invalid amount "12,5" shows the field error; stats update. Contacts — mark read moves it to "Đã đọc"; delete; mailto link correct. 390 / 768 / 1280 / 195: no horizontal scroll, targets ≥ 44px, dialog Esc + focus.
- [ ] PROGRESS entry; list the local test rows.
- [ ] Propose commit `add admin quote requests and contact messages pages`, wait for "ok".
