import type { TocItem } from '../../lib/blog';

// Table of contents from the article's H2s. Desktop: sticky card in the side column. Phone: a
// collapsed <details> at the top — the links are in the HTML either way (nothing hidden behind JS).
function Links({ items }: { items: TocItem[] }) {
  return (
    <ol className="mt-2 list-decimal pl-5 text-sm">
      {items.map((item) => (
        <li key={item.id}><a href={`#${item.id}`} className="inline-flex min-h-11 items-center text-brand-ink hover:underline">{item.text}</a></li>
      ))}
    </ol>
  );
}

export function TableOfContents({ items, variant }: { items: TocItem[]; variant: 'side' | 'inline' }) {
  if (items.length < 2) return null;
  if (variant === 'inline') {
    return (
      <details className="rounded-card border border-line p-4 lg:hidden">
        <summary className="min-h-11 cursor-pointer content-center font-bold text-ink">Mục lục</summary>
        <Links items={items} />
      </details>
    );
  }
  return (
    <nav aria-label="Mục lục" className="hidden rounded-card bg-surface p-5 shadow-card lg:block">
      <b className="text-ink">Mục lục</b>
      <Links items={items} />
    </nav>
  );
}
