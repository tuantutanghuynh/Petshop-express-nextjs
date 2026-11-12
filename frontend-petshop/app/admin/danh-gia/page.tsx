import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReviewsManager } from '../../../components/admin/reviews/ReviewsManager';

export const metadata: Metadata = { title: 'Đánh giá sản phẩm' };

// useSearchParams (tab, stars, page) needs a Suspense boundary for the static shell (Next 16).
export default function AdminReviewsPage() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Đang tải đánh giá" className="h-60 animate-pulse rounded-card bg-line" />}>
      <ReviewsManager />
    </Suspense>
  );
}
