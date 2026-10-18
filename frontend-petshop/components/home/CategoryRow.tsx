import type { Category } from '../../lib/types';
import { EmptyState } from '../ui/EmptyState';
import { SectionHeading } from '../ui/SectionHeading';

// "Mua theo bé cưng": the shop's own categories as circles, swipeable on phones.
// Not links yet — /danh-muc/[slug] does not exist, and a link that answers 404 is worse than none.
// Categories have no image column either, so each circle shows the name's first letter.
export function CategoryRow({ categories }: { categories: Category[] }) {
  return (
    <section aria-labelledby="cat-title" className="mx-auto max-w-[1200px] px-4 py-6">
      <SectionHeading id="cat-title" title="🐾 Mua theo bé cưng" />
      {categories.length === 0 ? (
        <EmptyState message="Danh mục sản phẩm đang được cập nhật." />
      ) : (
        <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 lg:justify-center lg:gap-10">
          {categories.map((c) => (
            <li key={c.id} className="flex w-26 shrink-0 snap-start flex-col items-center gap-2 text-center lg:w-35">
              <span aria-hidden="true" className="grid aspect-square w-full place-items-center rounded-full bg-mint text-3xl font-extrabold text-brand-deep">
                {c.name.charAt(0).toUpperCase()}
              </span>
              <span className="text-xs font-bold tracking-wide text-ink uppercase">{c.name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
