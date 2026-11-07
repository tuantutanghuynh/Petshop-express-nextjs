'use client';

import Link from 'next/link';
import { REASON_LABELS } from '../../../lib/adminStock';
import { ordersHref } from '../../../lib/adminOrders';
import type { StockMovement } from '../../../lib/types';

type Props = { rows: StockMovement[] | null; failed: boolean; hasMore: boolean; loadingMore: boolean; onMore: () => void; onRetry: () => void };

const when = (iso: string) => new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

// The variant's stock ledger, newest first (spec 2026-11-07 D2). Every line explains one change of
// the physical stock: who or which order made it, and the stock right after it.
export function StockHistory({ rows, failed, hasMore, loadingMore, onMore, onRetry }: Props) {
  if (failed) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card bg-pink-bg px-3 py-2 text-sm text-pink-ink">
        Chưa tải được lịch sử kho.
        <button type="button" onClick={onRetry} className="min-h-11 rounded-full border border-pink-ink px-4 font-bold">Thử lại</button>
      </div>
    );
  }
  if (rows === null) return <div aria-busy="true" aria-label="Đang tải lịch sử kho" className="h-24 animate-pulse rounded-card bg-surface-alt" />;
  if (rows.length === 0) return <p className="text-sm text-muted">Chưa có thay đổi nào.</p>;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((m) => (
          <li key={m.id} className="flex flex-col gap-0.5 py-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <b className="min-w-0 text-ink">{REASON_LABELS[m.reason] ?? m.reason}</b>
              <span className="shrink-0 tabular-nums">
                <b className={m.delta > 0 ? 'text-brand-ink' : m.delta < 0 ? 'text-pink-ink' : 'text-muted'}>{m.delta > 0 ? `+${m.delta}` : m.delta}</b>
                <span className="text-muted"> → {m.quantityAfter}</span>
              </span>
            </div>
            <p className="text-muted">
              {when(m.createdAt)}
              {m.user && <> · {m.user.fullName || m.user.email}</>}
              {m.order && <> · <Link href={ordersHref({ ma: m.order.code })} className="font-bold text-brand-ink underline">Đơn {m.order.code}</Link></>}
            </p>
            {m.note && <p className="break-words text-ink">“{m.note}”</p>}
          </li>
        ))}
      </ul>
      {hasMore && (
        <button type="button" disabled={loadingMore} onClick={onMore} className="min-h-11 self-start rounded-full border border-line px-4 text-sm font-bold text-ink disabled:opacity-60">
          {loadingMore ? 'Đang tải…' : 'Xem thêm'}
        </button>
      )}
    </div>
  );
}
