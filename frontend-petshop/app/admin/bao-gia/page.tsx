import type { Metadata } from 'next';
import { Suspense } from 'react';
import { QuotesManager } from '../../../components/admin/quotes/QuotesManager';

export const metadata: Metadata = { title: 'Yêu cầu báo giá' };

// useSearchParams needs a Suspense boundary for the static shell (Next 16).
export default function AdminQuotesPage() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Đang tải yêu cầu báo giá" className="h-60 animate-pulse rounded-card bg-surface" />}>
      <QuotesManager />
    </Suspense>
  );
}
