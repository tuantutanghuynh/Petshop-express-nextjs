'use client';

import Link from 'next/link';
import type { BankInfo } from '../../lib/orders';
import type { Order } from '../../lib/types';
import { EmptyState } from '../ui/EmptyState';
import { BankTransferBox } from './BankTransferBox';
import { OrderItems } from './OrderItems';
import { OrderStatusBadge } from './OrderStatusBadge';
import { SignInPrompt } from './SignInPrompt';
import { useBffResource } from './useBff';

const DATE = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

type Props = { code: string; bank: BankInfo | null; isNew: boolean };

export function OrderDetailView({ code, bank, isNew }: Props) {
  const order = useBffResource<Order>(`/api/orders/${encodeURIComponent(code)}`);

  if (order.state === 'loading') return <div key="loading" aria-busy="true" aria-label="Đang tải đơn hàng" className="h-60 animate-pulse rounded-card bg-surface-alt" />;
  if (order.state === 'signedOut') return <SignInPrompt next={`/tai-khoan/don-hang/${code}`} text="Đăng nhập để xem đơn hàng." />;
  if (order.state === 'error') {
    return (
      <div className="flex flex-col items-start gap-3">
        <EmptyState tone="error" message={order.error.code === 'ORDER_NOT_FOUND' ? 'Không tìm thấy đơn hàng này.' : 'Chưa tải được đơn hàng.'} />
        <Link href="/tai-khoan" className="inline-flex min-h-11 items-center font-bold text-brand-ink underline">Về đơn hàng của tôi</Link>
      </div>
    );
  }

  const o = order.data;
  const awaitingTransfer = o.paymentMethod === 'BANK_TRANSFER' && o.orderStatus === 'PENDING_PAYMENT';
  // key: the skeleton and the order are different elements, so the order is "new content"
  // rather than the skeleton node resized (which Lighthouse counted as a layout shift).
  return (
    <div key="order" className="flex flex-col gap-6">
      {isNew && (
        <p role="status" className="rounded-panel bg-mint p-4 font-bold text-brand-deep">
          🎉 Đặt hàng thành công! {o.paymentMethod === 'COD' ? 'Cửa hàng sẽ liên hệ xác nhận và giao hàng sớm.' : 'Vui lòng chuyển khoản theo thông tin bên dưới.'}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold">Đơn <span className="whitespace-nowrap">{o.code}</span></h1>
        <OrderStatusBadge order={o} />
      </div>
      <p className="text-sm text-muted">Đặt lúc {DATE.format(new Date(o.createdAt))} · {o.paymentMethod === 'COD' ? 'Thanh toán khi nhận hàng' : 'Chuyển khoản'}</p>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <OrderItems order={o} />
        <div className="flex flex-col gap-6">
          {awaitingTransfer && <BankTransferBox bank={bank} amount={o.grandTotal} code={o.code} expiresAt={o.expiresAt} />}
          <section aria-labelledby="ship-title" className="flex flex-col gap-1 text-sm">
            <h2 id="ship-title" className="mb-1 text-lg font-extrabold">Giao tới</h2>
            <p className="font-bold text-ink">{o.shippingAddress.fullName} · {o.shippingAddress.phone}</p>
            <p>{o.shippingAddress.addressLine}, {o.shippingAddress.city}</p>
            {o.note && <p className="text-muted">Ghi chú: {o.note}</p>}
          </section>
        </div>
      </div>
      <Link href="/tai-khoan" className="inline-flex min-h-11 items-center font-bold text-brand-ink underline">← Đơn hàng của tôi</Link>
    </div>
  );
}
