import Image from 'next/image';
import Link from 'next/link';
import type { CategoryCircle } from '../../lib/categoryCircles';
import { imageSrc } from '../../lib/storefront';
import { CategoryScroller } from './CategoryScroller';

// "Mua theo bé cưng": circles from /admin/cau-hinh (lib/categoryCircles.ts; the six wireframe
// circles until a list is saved), swipeable on phones. A circle without an image shows its first letter.
export function CategoryRow({ circles }: { circles: CategoryCircle[] }) {
  return (
    <section aria-labelledby="cat-title" className="mx-auto max-w-[1200px] px-4 md:px-6 py-6">
      <h2 id="cat-title" className="mb-5 text-center text-xl font-extrabold sm:text-2xl">🐾 Mua theo bé cưng 🐾</h2>
      <CategoryScroller>
        <ul className="flex w-max min-w-full snap-x snap-mandatory justify-center gap-4 pb-2 lg:gap-8">
          {circles.map((c) => {
            const src = imageSrc(c.image);
            return (
              <li key={`${c.href}-${c.label}`} className="w-26 shrink-0 snap-start lg:w-35">
                <Link href={c.href} className="group flex flex-col items-center gap-2 text-center">
                  <span aria-hidden="true" className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-full border-2 border-line bg-mint text-3xl font-extrabold text-brand-deep transition-colors group-hover:border-pink group-hover:bg-mint-card">
                    {src ? <Image src={src} alt="" fill sizes="140px" className="object-cover" /> : c.label.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-xs leading-[1.4] font-bold tracking-wide text-ink uppercase group-hover:text-pink-ink">{c.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CategoryScroller>
    </section>
  );
}
