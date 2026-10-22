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
