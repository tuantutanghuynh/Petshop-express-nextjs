import Image from 'next/image';
import { imageSrc } from '../../lib/storefront';
import type { ProductImage } from '../../lib/types';

// Swipeable on phones with CSS scroll-snap only (no carousel library). The first image is the
// page's LCP element, so it alone is fetched with high priority.
export function ProductGallery({ images, name }: { images: ProductImage[]; name: string }) {
  const usable = images.flatMap((img) => {
    const src = imageSrc(img.url);
    return src ? [{ ...img, src }] : [];
  });
  if (usable.length === 0) {
    return (
      <div aria-hidden="true" className="grid aspect-square place-items-center rounded-panel bg-mint text-7xl">🐾</div>
    );
  }
  return (
    <ul aria-label="Ảnh sản phẩm" className="flex snap-x snap-mandatory gap-3 overflow-x-auto">
      {usable.map((img, i) => (
        <li key={img.id} className="relative aspect-square w-full shrink-0 snap-start overflow-hidden rounded-panel bg-surface-alt">
          <Image
            src={img.src}
            alt={img.altText || `${name} — ảnh ${i + 1}`}
            fill
            sizes="(min-width: 1024px) 560px, 100vw"
            className="object-contain"
            {...(i === 0 ? { fetchPriority: 'high' as const } : {})}
          />
        </li>
      ))}
    </ul>
  );
}
