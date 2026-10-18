import Image from 'next/image';
import type { Metadata } from 'next';
import { EmptyState } from '../../components/ui/EmptyState';
import { imageSrc } from '../../lib/storefront';
import { getGallery } from '../../services/content';

// Cached for 5 minutes and refreshed at once when the admin adds or removes a photo
// (POST /api/revalidate with the "gallery" tag).
export const metadata: Metadata = {
  title: 'Thư viện ảnh',
  description: 'Ảnh các bé chó mèo và sản phẩm tại Siêu thị của chó mèo.',
  alternates: { canonical: '/gallery' },
};

export default async function GalleryPage() {
  const items = (await getGallery()).flatMap((item) => {
    const src = imageSrc(item.imageUrl);
    return src ? [{ ...item, src }] : [];
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Thư viện ảnh</h1>
      {items.length === 0 ? (
        <EmptyState message="Thư viện ảnh đang được cập nhật." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item, index) => (
            // Square box reserved before the photo loads, so nothing below it moves (no layout shift).
            <div key={item.id} className="relative aspect-square overflow-hidden rounded-lg bg-mint">
              <Image src={item.src} alt={item.altText} fill sizes="(min-width: 1024px) 190px, (min-width: 640px) 33vw, 50vw" className="object-cover" {...(index === 0 ? { fetchPriority: 'high' as const } : {})} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
