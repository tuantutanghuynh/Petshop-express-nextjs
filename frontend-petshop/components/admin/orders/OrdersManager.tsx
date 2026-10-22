'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ADMIN_BRAND_HEADERS, ORDERS_PAGE_SIZE, ordersApiPath, ordersHref, parseOrdersQuery, type OrdersQuery } from '../../../lib/adminOrders';
import { authFetch } from '../../../lib/adminAuth';
import type { AdminOrder, PageMeta } from '../../../lib/types';
import { Pagination } from '../../ui/Pagination';
import { OrderDetail } from './OrderDetail';
import { OrdersFilters } from './OrdersFilters';
import { OrdersList } from './OrdersList';

type Page = { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: AdminOrder[]; total: number };
type Loaded = { key: string; page: Page; pending: number | null };

async function fetchPage(s: OrdersQuery): Promise<Page> {
  const res = await authFetch<AdminOrder[]>(ordersApiPath(s), { headers: ADMIN_BRAND_HEADERS });
  if (res.error || !res.data) return { state: 'error' };
  return { state: 'ready', rows: res.data, total: (res.meta as PageMeta | null)?.total ?? res.data.length };
}

async function fetchPendingCount(): Promise<number | null> {
  const res = await authFetch<AdminOrder[]>('/orders/admin/list?orderStatus=PENDING_PAYMENT&pageSize=1', { headers: ADMIN_BRAND_HEADERS });
  return res.error ? null : ((res.meta as PageMeta | null)?.total ?? null);
}

// The list for a URL without ?ma= (tab, search, page). Opening or closing an order does not change
// this key, so the list stays mounted — and keeps the focused row button — while the drawer comes
// and goes.
async function loadList(listKey: string): Promise<Loaded> {
  const [page, pending] = await Promise.all([fetchPage(parseOrdersQuery(new URLSearchParams(listKey))), fetchPendingCount()]);
  return { key: listKey, page, pending };
}

// An order named by ?ma= that is not on the current page, looked up by its code.
async function fetchByCode(code: string): Promise<AdminOrder | null> {
  const found = await fetchPage({ tab: 'all', q: code, page: 1, ma: null });
  return found.state === 'ready' ? (found.rows.find((o) => o.code === code) ?? null) : null;
}

const listKeyOf = (q: OrdersQuery) => new URLSearchParams(ordersHref({ ...q, ma: null }).split('?')[1] ?? '').toString();

// /admin/don-hang (wireframe admin-orders.html). The URL is the state (tab, search, page, open
// order). State is only set from promise callbacks and tagged with what it was loaded for, so a
// stale answer is never shown.
export function OrdersManager() {
  const router = useRouter();
  const query = parseOrdersQuery(new URLSearchParams(useSearchParams().toString()));
  const listKey = listKeyOf(query);
  const [list, setList] = useState<Loaded | null>(null);
  const [lookedUp, setLookedUp] = useState<{ code: string; order: AdminOrder | null } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let active = true;
    loadList(listKey).then((next) => active && setList(next));
    return () => {
      active = false;
    };
  }, [listKey]);

  const current = list && list.key === listKey ? list : null;
  const page: Page = current?.page ?? { state: 'loading' };
  const onPage = query.ma && page.state === 'ready' ? (page.rows.find((o) => o.code === query.ma) ?? null) : null;
  const needLookup = Boolean(query.ma) && page.state === 'ready' && !onPage;

  useEffect(() => {
    if (!needLookup || !query.ma) return;
    let active = true;
    const code = query.ma;
    fetchByCode(code).then((order) => active && setLookedUp({ code, order }));
    return () => {
      active = false;
    };
  }, [needLookup, query.ma]);

  const opened = onPage ?? (query.ma && lookedUp?.code === query.ma ? lookedUp.order : null);

  const go = useCallback(
    (patch: Partial<OrdersQuery>, mode: 'push' | 'replace' = 'push') => {
      const href = ordersHref({ ...parseOrdersQuery(new URLSearchParams(window.location.search)), ...patch });
      if (mode === 'push') router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [router],
  );

  const onFilter = useCallback((patch: Partial<OrdersQuery>, mode: 'push' | 'replace') => go({ ...patch, page: 1, ma: null }, mode), [go]);

  async function afterAction(text: string) {
    setNotice({ ok: true, text });
    setNow(new Date());
    const [next, order] = await Promise.all([loadList(listKey), query.ma ? fetchByCode(query.ma) : Promise.resolve(null)]);
    setList(next);
    if (query.ma) setLookedUp({ code: query.ma, order });
  }

  const total = page.state === 'ready' ? page.total : 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 id="orders-title" tabIndex={-1} className="text-2xl leading-[1.3] font-extrabold focus:outline-none">Đơn hàng</h1>
      <OrdersFilters query={query} pendingCount={current?.pending ?? null} onChange={onFilter} />
      {notice && (
        <p role="status" className={notice.ok ? 'text-sm font-bold text-brand-ink' : 'rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink'}>{notice.text}</p>
      )}
      {page.state === 'loading' && <div aria-busy="true" aria-label="Đang tải đơn hàng" className="h-48 animate-pulse rounded-card bg-surface" />}
      {page.state === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink">
          Chưa tải được đơn hàng.
          <button type="button" onClick={() => loadList(listKey).then(setList)} className="min-h-11 rounded-full border border-pink-ink px-4 font-bold">Thử lại</button>
        </div>
      )}
      {page.state === 'ready' &&
        (page.rows.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-4 text-muted">
            {query.q ? `Không tìm thấy đơn khớp «${query.q}».` : 'Chưa có đơn nào.'}
          </p>
        ) : (
          <OrdersList rows={page.rows} now={now} onOpen={(o) => go({ ma: o.code })} />
        ))}
      <Pagination page={query.page} totalPages={Math.ceil(total / ORDERS_PAGE_SIZE)} hrefFor={(p) => ordersHref({ ...query, page: p, ma: null })} />
      {opened && (
        // Keyed by order only: after an action the same drawer shows the new status (and keeps the
        // button that opened it, to return focus there) instead of being mounted again.
        <OrderDetail key={opened.id} order={opened} now={now} onClose={() => go({ ma: null }, 'replace')} onDone={(text) => void afterAction(text)} />
      )}
    </div>
  );
}
