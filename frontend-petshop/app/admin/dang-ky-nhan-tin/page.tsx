import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SubscribersManager } from '../../../components/admin/newsletter/SubscribersManager';

export const metadata: Metadata = { title: 'Đăng ký nhận tin' };

// useSearchParams needs a Suspense boundary for the static shell (Next 16).
export default function AdminNewsletterPage() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Đang tải danh sách" className="h-60 animate-pulse rounded-card bg-surface" />}>
      <SubscribersManager />
    </Suspense>
  );
}
