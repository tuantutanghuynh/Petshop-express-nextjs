'use client';

import { timeAgo } from '../../../lib/adminDashboard';
import { quoteActions, webTotal, type QuoteAction } from '../../../lib/adminQuotes';
import type { StatusTone } from '../../../lib/orders';
import { formatVnd } from '../../../lib/storefront';
import type { AdminQuote } from '../../../lib/types';
import { STATUS_TONE_CLASSES } from '../../orders/OrderStatusBadge';

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  NEW: { label: 'Mới', tone: 'wait' },
  CONTACTED: { label: 'Đã liên hệ', tone: 'ok' },
  CLOSED: { label: 'Đã chốt', tone: 'done' },
};

const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit' });

type Props = { quote: AdminQuote; now: Date; busy: boolean; onAction: (quote: AdminQuote, action: QuoteAction) => void };

// One quote request (wireframe admin-quotes.html): who to call, what they asked about at web prices,
// their note (plain text — never HTML), and the next steps of its status.
export function QuoteCard({ quote: q, now, busy, onAction }: Props) {
  const s = STATUS[q.status] ?? { label: q.status, tone: 'off' as const };
  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 text-base leading-[1.4] font-extrabold break-words">{q.customerName}</h2>
        <span className="flex items-center gap-2 text-sm text-muted">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE_CLASSES[s.tone]}`}>{s.label}</span>
          {timeAgo(q.createdAt, now)}
        </span>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <a href={`tel:${q.phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-11 items-center font-bold text-brand-ink underline">☎ {q.phone}</a>
        {q.email && <span className="break-all text-muted">{q.email}</span>}
        {q.address && <span className="break-words text-muted">· {q.address}</span>}
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {q.items.map((i) => (
          <li key={`${i.sku}-${i.quantity}`} className="flex justify-between gap-3">
            <span className="min-w-0 break-words">{i.productName}{i.variantLabel ? ` · ${i.variantLabel}` : ''} × {i.quantity}</span>
            <span className="shrink-0 tabular-nums">{formatVnd(i.lineTotal)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-3 border-t border-line pt-1 font-bold">
          <span>Giá web</span><span className="tabular-nums">{formatVnd(webTotal(q.items))}</span>
        </li>
      </ul>
      {q.note && <p className="rounded-card bg-surface-alt p-3 text-sm whitespace-pre-line break-words">“{q.note}”</p>}
      {q.status === 'CLOSED' && q.finalAmount !== null && (
        <p className="text-sm font-bold text-brand-deep">Đã chốt: <span className="tabular-nums">{formatVnd(q.finalAmount)}</span>{q.closedAt ? ` · ${dayMonth(q.closedAt)}` : ''}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {quoteActions(q.status).map((a) => (
          <button key={a.kind} type="button" disabled={busy} onClick={() => onAction(q, a)}
            className={`min-h-11 rounded-full px-4 text-sm font-bold disabled:opacity-60 ${a.danger ? 'border border-pink-ink text-pink-ink' : a.kind === 'close' ? 'bg-brand-ink text-white' : 'border border-line text-ink'}`}>
            {a.label}
          </button>
        ))}
      </div>
    </article>
  );
}
