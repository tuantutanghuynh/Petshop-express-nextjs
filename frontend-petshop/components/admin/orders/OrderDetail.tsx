'use client';

import { useEffect, useRef, useState } from 'react';
import { ADMIN_BRAND_HEADERS, actionRequest, holdUntilText, orderActions, orderBadge, paymentLabel, type OrderAction } from '../../../lib/adminOrders';
import { authFetch } from '../../../lib/adminAuth';
import { formatVnd } from '../../../lib/storefront';
import type { AdminOrder } from '../../../lib/types';
import { STATUS_TONE_CLASSES } from '../../orders/OrderStatusBadge';

// 409 codes meaning the order moved on meanwhile (another admin, or the expiry job).
const CHANGED_ELSEWHERE = new Set(['ORDER_STATE_CHANGED', 'INVALID_STATE_TRANSITION', 'ALREADY_PAID']);

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
    const res = await authFetch(path, { method: 'PATCH', headers: ADMIN_BRAND_HEADERS, ...(body && { body }) });
    setBusy(false);
    if (!res.error) return onDone(`Đã cập nhật đơn ${order.code}.`, true);
    if (CHANGED_ELSEWHERE.has(res.error.code)) return onDone(`Đơn ${order.code} vừa thay đổi — đã tải lại.`, true);
    setError(res.error.message || 'Không cập nhật được đơn.');
  }

  const b = orderBadge(order, now);
  const a = order.shippingAddress;
  return (
    <dialog ref={dialog} aria-labelledby="order-title"
      onClose={() => {
        onClose();
        // Back to the button that opened the order; if an action moved the order out of this tab, that
        // row is gone — fall back to the page title rather than losing focus to <body>.
        const back = opener.current instanceof HTMLElement && opener.current.isConnected ? opener.current : document.getElementById('orders-title');
        back?.focus();
      }}
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
