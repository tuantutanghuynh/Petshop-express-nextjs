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
