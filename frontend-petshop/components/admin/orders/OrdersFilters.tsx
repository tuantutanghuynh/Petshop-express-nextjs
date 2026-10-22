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
