'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatVnd } from '../../lib/storefront';
import type { Customer, Order } from '../../lib/types';
import { useCart } from '../cart/CartProvider';
import { OrderStatusBadge } from '../orders/OrderStatusBadge';
import { SignInPrompt } from '../orders/SignInPrompt';
import { useBffResource } from '../orders/useBff';
import { EmptyState } from '../ui/EmptyState';

const DATE = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

function OrderList() {
  const [page, setPage] = useState(1);
  const orders = useBffResource<Order[]>(`/api/orders?page=${page}`);

  if (orders.state === 'loading') return <div key="loading" aria-busy="true" aria-label="Đang tải đơn hàng" className="h-32 animate-pulse rounded-card bg-surface-alt" />;
  if (orders.state === 'signedOut') return null;
  if (orders.state === 'error') return <EmptyState tone="error" message="Chưa tải được đơn hàng." />;
  if (orders.data.length === 0 && page === 1) {
    return (
      <div className="flex flex-col items-start gap-3">
        <EmptyState message="Bạn chưa có đơn hàng nào." />
        <Link href="/" className="inline-flex min-h-11 items-center font-bold text-brand-ink underline">Bắt đầu mua sắm</Link>
      </div>
    );
  }
  return (
    <div key="orders" className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3 tabular-nums">
        {orders.data.map((o) => (
          <li key={o.id}>
            <Link href={`/tai-khoan/don-hang/${encodeURIComponent(o.code)}`} className="flex flex-col gap-1 rounded-card border border-line p-4 hover:bg-surface-alt">
              <span className="flex flex-wrap items-center justify-between gap-2"><b className="text-ink">{o.code}</b><OrderStatusBadge order={o} /></span>
              <span className="flex justify-between text-sm"><span>{DATE.format(new Date(o.createdAt))} · {o.items.length} sản phẩm</span><b className="text-ink">{formatVnd(o.grandTotal)}</b></span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex gap-3">
        {page > 1 && <button type="button" onClick={() => setPage(page - 1)} className="min-h-11 rounded-full border border-line px-5 font-bold">‹ Mới hơn</button>}
        {orders.data.length === 10 && <button type="button" onClick={() => setPage(page + 1)} className="min-h-11 rounded-full border border-line px-5 font-bold">Cũ hơn ›</button>}
      </div>
    </div>
  );
}

export function AccountView() {
  const me = useBffResource<Customer>('/api/auth/me');
  const { logout } = useCart();
  const router = useRouter();

  if (me.state === 'loading') return <div key="loading" aria-busy="true" aria-label="Đang tải" className="h-24 animate-pulse rounded-card bg-surface-alt" />;
  if (me.state === 'signedOut') return <SignInPrompt next="/tai-khoan" text="Đăng nhập để xem tài khoản và đơn hàng." />;
  if (me.state === 'error') return <EmptyState tone="error" message="Chưa tải được tài khoản." />;

  // key: see OrderDetailView — mount the account as new content instead of reusing the skeleton node.
  return (
    <div key="account" className="flex flex-col gap-8">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-panel bg-surface-alt p-5">
        <div>
          <p className="font-bold text-ink">{me.data.fullName || me.data.email}</p>
          <p className="text-sm text-muted">{me.data.email}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await logout();
            router.replace('/');
          }}
          className="min-h-11 rounded-full border border-line bg-surface px-5 font-bold text-ink"
        >
          Đăng xuất
        </button>
      </section>
      <section aria-labelledby="orders-title">
        <h2 id="orders-title" className="mb-4 text-lg font-extrabold">Đơn hàng của tôi</h2>
        <OrderList />
      </section>
    </div>
  );
}
