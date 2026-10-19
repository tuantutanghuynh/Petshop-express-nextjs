import Image from 'next/image';
import Link from 'next/link';
import { categoryPath } from '../../lib/seo/structuredData';
import { imageSrc } from '../../lib/storefront';
import type { Category } from '../../lib/types';
import { EmptyState } from '../ui/EmptyState';
import { SectionHeading } from '../ui/SectionHeading';

// "Mua theo bé cưng": the shop's own categories as circles, swipeable on phones.
// Circle images come from /admin/cau-hinh (homepage_category_images); a category without one shows
// its first letter.
export function CategoryRow({ categories, images = {} }: { categories: Category[]; images?: Record<string, string> }) {
  return (
    <section aria-labelledby="cat-title" className="mx-auto max-w-[1200px] px-4 md:px-6 py-6">
      <SectionHeading id="cat-title" title="🐾 Mua theo bé cưng" />
      {categories.length === 0 ? (
        <EmptyState message="Danh mục sản phẩm đang được cập nhật." />
      ) : (
        <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:justify-center lg:gap-10">
          {categories.map((c) => {
            const src = imageSrc(images[c.slug]);
            return (
            <li key={c.id} className="w-26 shrink-0 snap-start lg:w-35">
              <Link href={categoryPath(c.slug)} className="group flex flex-col items-center gap-2 text-center">
                <span aria-hidden="true" className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-full bg-mint text-3xl font-extrabold text-brand-deep transition-colors group-hover:bg-mint-card">
                  {src ? (
                    <Image src={src} alt="" fill sizes="140px" className="object-cover" />
                  ) : (
                    c.name.charAt(0).toUpperCase()
                  )}
                </span>
                <span className="text-xs font-bold tracking-wide text-ink uppercase group-hover:underline">{c.name}</span>
              </Link>
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
