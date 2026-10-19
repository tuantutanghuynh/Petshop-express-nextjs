import Image from 'next/image';
import Link from 'next/link';
import { categoryPath } from '../../lib/seo/structuredData';
import { imageSrc } from '../../lib/storefront';
import type { Category } from '../../lib/types';
import { EmptyState } from '../ui/EmptyState';
import { CategoryScroller } from './CategoryScroller';

// "Mua theo bé cưng": the shop's own categories as circles, swipeable on phones.
// Circle images come from /admin/cau-hinh (homepage_category_images); a category without one shows
// its first letter.
export function CategoryRow({ categories, images = {} }: { categories: Category[]; images?: Record<string, string> }) {
  return (
    <section aria-labelledby="cat-title" className="mx-auto max-w-[1200px] px-4 md:px-6 py-6">
      <h2 id="cat-title" className="mb-5 text-center text-xl font-extrabold sm:text-2xl">🐾 Mua theo bé cưng 🐾</h2>
      {categories.length === 0 ? (
        <EmptyState message="Danh mục sản phẩm đang được cập nhật." />
      ) : (
        <CategoryScroller>
        <ul className="flex w-max min-w-full snap-x snap-mandatory justify-center gap-4 pb-2 lg:gap-8">
          {categories.map((c) => {
            const src = imageSrc(images[c.slug]);
            return (
            <li key={c.id} className="w-26 shrink-0 snap-start lg:w-35">
              <Link href={categoryPath(c.slug)} className="group flex flex-col items-center gap-2 text-center">
                <span aria-hidden="true" className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-full border-2 border-line bg-mint text-3xl font-extrabold text-brand-deep transition-colors group-hover:border-pink group-hover:bg-mint-card">
                  {src ? (
                    <Image src={src} alt="" fill sizes="140px" className="object-cover" />
                  ) : (
                    c.name.charAt(0).toUpperCase()
                  )}
                </span>
                <span className="text-xs font-bold tracking-wide text-ink uppercase group-hover:text-pink-ink">{c.name}</span>
              </Link>
            </li>
            );
          })}
        </ul>
        </CategoryScroller>
      )}
    </section>
  );
}
