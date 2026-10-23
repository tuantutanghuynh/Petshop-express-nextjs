'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { rangeFor, type Period } from '../../../lib/adminDashboard';
import { ADMIN_BRAND_HEADERS } from '../../../lib/adminOrders';
import { QUOTE_TABS, QUOTES_PAGE_SIZE, parseQuotesQuery, quotesApiPath, quotesHref, webTotal, type QuoteAction, type QuoteTab } from '../../../lib/adminQuotes';
import { formatVnd } from '../../../lib/storefront';
import type { AdminQuote, PageMeta, QuoteStats } from '../../../lib/types';
import { Pagination } from '../../ui/Pagination';
import { AdminTabs } from '../AdminTabs';
import { StatCard } from '../dashboard/StatCard';
import { CloseQuoteDialog } from './CloseQuoteDialog';
import { QuoteCard } from './QuoteCard';

type Page = { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: AdminQuote[]; total: number };
type Loaded = { key: string; page: Page; newCount: number | null };
type Stats = { period: Period; state: 'error' } | { period: Period; state: 'ready'; data: QuoteStats };

const api = <T,>(path: string, init: RequestInit = {}) => authFetch<T>(path, { ...init, headers: ADMIN_BRAND_HEADERS });

async function loadList(key: string): Promise<Loaded> {
  const q = parseQuotesQuery(new URLSearchParams(key));
  const [list, count] = await Promise.all([api<AdminQuote[]>(quotesApiPath(q)), api<AdminQuote[]>('/quote-requests/admin/list?status=NEW&pageSize=1')]);
  const page: Page = list.error || !list.data ? { state: 'error' } : { state: 'ready', rows: list.data, total: (list.meta as PageMeta | null)?.total ?? list.data.length };
  return { key, page, newCount: count.error ? null : ((count.meta as PageMeta | null)?.total ?? null) };
}

async function loadStats(period: Period): Promise<Stats> {
  const { from, to } = rangeFor(period, new Date());
  const res = await api<QuoteStats>(`/quote-requests/admin/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  return res.error || !res.data ? { period, state: 'error' } : { period, state: 'ready', data: res.data };
}

// /admin/bao-gia (wireframe admin-quotes.html): numbers for the period, then the requests of the tab
// in the URL as cards with call / close / reopen / delete. Every change reloads list, counts, stats.
export function QuotesManager() {
  const router = useRouter();
  const key = useSearchParams().toString();
  const query = parseQuotesQuery(new URLSearchParams(key));
  const [list, setList] = useState<Loaded | null>(null);
  const [period, setPeriod] = useState<Period>('30d');
  const [stats, setStats] = useState<Stats | null>(null);
  const [closing, setClosing] = useState<AdminQuote | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let active = true;
    loadList(key).then((next) => active && setList(next));
    return () => {
      active = false;
    };
  }, [key]);

  useEffect(() => {
    let active = true;
    loadStats(period).then((next) => active && setStats(next));
    return () => {
      active = false;
    };
  }, [period]);

  async function refresh(text: string) {
    setNotice({ ok: true, text });
    setNow(new Date());
    const [next, s] = await Promise.all([loadList(key), loadStats(period)]);
    setList(next);
    setStats(s);
  }

  async function setStatus(q: AdminQuote, status: string, finalAmount?: number): Promise<string | null> {
    const res = await api(`/quote-requests/admin/${q.id}/status`, { method: 'PATCH', body: JSON.stringify({ status, ...(finalAmount !== undefined && { finalAmount }) }) });
    return res.error ? res.error.message || 'Không cập nhật được yêu cầu.' : null;
  }

  async function onAction(q: AdminQuote, a: QuoteAction) {
    if (a.kind === 'close' || a.kind === 'edit-amount') return setClosing(q);
    if (a.ask && !window.confirm(a.kind === 'delete' ? `Xoá yêu cầu của ${q.customerName}? Chỉ dùng cho tin rác.` : `Mở lại yêu cầu của ${q.customerName}? Số tiền đã chốt sẽ bị xoá.`)) return;
    setBusy(true);
    const problem = a.kind === 'delete'
      ? await api(`/quote-requests/admin/${q.id}`, { method: 'DELETE' }).then((r) => (r.error ? r.error.message || 'Không xoá được.' : null))
      : await setStatus(q, a.kind === 'contacted' || a.kind === 'reopen' ? 'CONTACTED' : 'NEW');
    setBusy(false);
    if (problem) setNotice({ ok: false, text: problem });
    else await refresh(a.kind === 'delete' ? `Đã xoá yêu cầu của ${q.customerName}.` : `Đã cập nhật yêu cầu của ${q.customerName}.`);
  }

  const current = list && list.key === key ? list : null;
  const page: Page = current?.page ?? { state: 'loading' };
  const s = stats && stats.period === period ? stats : null;
  const statState = s ? s.state : 'loading';
  const tabs = QUOTE_TABS.map((t) => ({ key: t.key, label: t.key === 'new' && current?.newCount != null ? `${t.label} (${current.newCount})` : t.label }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl leading-[1.3] font-extrabold">Yêu cầu tư vấn báo giá</h1>
        <select aria-label="Khoảng thời gian" value={period} onChange={(e) => setPeriod(e.target.value as Period)}
          className="min-h-11 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base">
          <option value="30d">30 ngày qua</option>
          <option value="month">Tháng này</option>
        </select>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,150px),1fr))] gap-3 lg:grid-cols-4">
        <StatCard label="Tổng yêu cầu" state={statState} value={s?.state === 'ready' ? s.data.totalRequests : null} />
        <StatCard label="Đã chốt" state={statState} value={s?.state === 'ready' ? s.data.closedCount : null} />
        <StatCard label="Doanh thu chốt" state={statState} value={s?.state === 'ready' ? formatVnd(s.data.revenue) : null} />
        <StatCard label="Giá trị TB" state={statState} value={s?.state === 'ready' ? formatVnd(s.data.averageOrderValue) : null}
          foot={s?.state === 'ready' ? `Tỉ lệ chốt ${s.data.conversionRate}%` : null} />
      </div>
      <AdminTabs label="Lọc theo trạng thái" tabs={tabs} current={query.tab} onSelect={(tab) => router.push(quotesHref({ tab: tab as QuoteTab, page: 1 }), { scroll: false })} />
      {notice && <p role="status" className={notice.ok ? 'text-sm font-bold text-brand-ink' : 'rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink'}>{notice.text}</p>}
      {page.state === 'loading' && <div aria-busy="true" aria-label="Đang tải yêu cầu" className="h-48 animate-pulse rounded-card bg-surface" />}
      {page.state === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink">
          Chưa tải được yêu cầu báo giá.
          <button type="button" onClick={() => loadList(key).then(setList)} className="min-h-11 rounded-full border border-pink-ink px-4 font-bold">Thử lại</button>
        </div>
      )}
      {page.state === 'ready' &&
        (page.rows.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-4 text-muted">{query.tab === 'new' ? 'Chưa có yêu cầu mới.' : 'Không có yêu cầu nào.'}</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {page.rows.map((q) => <QuoteCard key={q.id} quote={q} now={now} busy={busy} onAction={onAction} />)}
          </div>
        ))}
      <Pagination page={query.page} totalPages={Math.ceil((page.state === 'ready' ? page.total : 0) / QUOTES_PAGE_SIZE)} hrefFor={(p) => quotesHref({ ...query, page: p })} />
      {closing && (
        <CloseQuoteDialog customerName={closing.customerName} initial={closing.finalAmount ?? webTotal(closing.items)} onClose={() => setClosing(null)}
          onSubmit={async (amount) => {
            const problem = await setStatus(closing, 'CLOSED', amount);
            if (!problem) void refresh(`Đã chốt ${formatVnd(amount)} với ${closing.customerName}.`);
            return problem;
          }} />
      )}
    </div>
  );
}
