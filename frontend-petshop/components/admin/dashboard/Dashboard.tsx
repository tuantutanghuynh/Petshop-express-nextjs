'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { expiringOrders, rangeFor, timeAgo, timeLeft, type Period } from '../../../lib/adminDashboard';
import { isNavReady } from '../../../lib/adminNav';
import { ordersHref } from '../../../lib/adminOrders';
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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,150px),1fr))] lg:grid-cols-4 gap-3">
        <StatCard label="Chờ xác nhận chuyển khoản" state={orders.state} value={orders.state === 'ready' ? orders.data.total : null}
          action={ordersReady ? { href: ordersHref({ tab: 'pending' }), text: 'Xử lý ›' } : null} />
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
                {ordersReady && <a href={ordersHref({ tab: 'pending', ma: o.code })} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-brand-ink px-4 font-bold text-white">Xác nhận</a>}
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
