import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrdersManager } from '../../../components/admin/orders/OrdersManager';

export const metadata: Metadata = { title: 'Đơn hàng' };

// useSearchParams needs a Suspense boundary for the static shell (Next 16).
export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Đang tải đơn hàng" className="h-60 animate-pulse rounded-card bg-surface" />}>
      <OrdersManager />
    </Suspense>
  );
}
