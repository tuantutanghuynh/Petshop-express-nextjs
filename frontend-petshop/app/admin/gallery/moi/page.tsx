import type { Metadata } from 'next';
import Link from 'next/link';
import { GalleryForm } from '../../../../components/admin/gallery/GalleryForm';

export const metadata: Metadata = { title: 'Thêm ảnh' };

export default function AdminNewGalleryItemPage() {
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/admin/gallery" className="inline-flex min-h-11 items-center underline">Thư viện ảnh</Link> › <span>Thêm ảnh</span>
      </nav>
      <h1 className="text-2xl leading-[1.3] font-extrabold">Thêm ảnh</h1>
      <GalleryForm />
    </div>
  );
}
