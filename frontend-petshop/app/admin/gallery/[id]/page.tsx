import type { Metadata } from 'next';
import Link from 'next/link';
import { GalleryForm } from '../../../../components/admin/gallery/GalleryForm';

export const metadata: Metadata = { title: 'Sửa ảnh' };

type Props = { params: Promise<{ id: string }> };

export default async function AdminEditGalleryItemPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/admin/gallery" className="inline-flex min-h-11 items-center underline">Thư viện ảnh</Link> › <span>Sửa ảnh</span>
      </nav>
      <h1 className="text-2xl leading-[1.3] font-extrabold">Sửa ảnh</h1>
      <GalleryForm id={id} />
    </div>
  );
}
