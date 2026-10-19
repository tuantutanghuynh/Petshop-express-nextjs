import Link from 'next/link';
import { blogListHref, type PostCategory } from '../../lib/blog';

// Topic filter as links (shareable, no JavaScript needed); swipeable on phones.
export function TopicChips({ topics, current }: { topics: PostCategory[]; current?: string }) {
  if (topics.length < 2) return null; // a single topic is not a choice
  const chip = 'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-bold';
  const items = [{ name: 'Tất cả', slug: undefined as string | undefined }, ...topics];
  return (
    <nav aria-label="Chủ đề" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex gap-2 pb-1">
        {items.map((t) => {
          const active = t.slug === current;
          return (
            <li key={t.slug ?? 'all'}>
              <Link
                href={blogListHref({ topic: t.slug })}
                aria-current={active ? 'page' : undefined}
                className={`${chip} ${active ? 'border-brand-ink bg-brand-ink text-white' : 'border-line bg-surface text-ink hover:bg-mint'}`}
              >
                {t.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
