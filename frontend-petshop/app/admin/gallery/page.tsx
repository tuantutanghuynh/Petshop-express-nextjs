import type { Metadata } from 'next';
import { Suspense } from 'react';
import { GalleryManager } from '../../../components/admin/gallery/GalleryManager';

export const metadata: Metadata = { title: 'Thư viện ảnh' };

// useSearchParams (the page number) needs a Suspense boundary for the static shell (Next 16).
export default function AdminGalleryPage() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Đang tải ảnh" className="h-60 animate-pulse rounded-card bg-line" />}>
      <GalleryManager />
    </Suspense>
  );
}
