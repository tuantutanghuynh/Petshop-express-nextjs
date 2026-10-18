import Link from 'next/link';
import { PRODUCT_SORTS, SORT_LABELS, type ProductSort } from '../../lib/catalogParams';

// Sort choices as plain links: they work without JavaScript, can be shared, and a changed sort
// always starts again at page 1.
export function SortLinks({ current, hrefFor }: { current: ProductSort; hrefFor: (sort: ProductSort) => string }) {
  return (
    <nav aria-label="Sắp xếp" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Sắp xếp:</span>
      {PRODUCT_SORTS.map((sort) =>
        sort === current ? (
          <span key={sort} aria-current="true" className="inline-flex min-h-11 items-center rounded-full bg-brand-ink px-4 font-bold text-white">
            {SORT_LABELS[sort]}
          </span>
        ) : (
          <Link key={sort} href={hrefFor(sort)} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 font-bold text-ink hover:bg-mint">
            {SORT_LABELS[sort]}
          </Link>
        ),
      )}
    </nav>
  );
}
