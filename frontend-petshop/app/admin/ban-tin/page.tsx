import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CampaignsManager } from '../../../components/admin/newsletter/CampaignsManager';

export const metadata: Metadata = { title: 'Bản tin' };

// useSearchParams (tab, page) needs a Suspense boundary for the static shell (Next 16).
export default function AdminCampaignsPage() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Đang tải bản tin" className="h-60 animate-pulse rounded-card bg-line" />}>
      <CampaignsManager />
    </Suspense>
  );
}
