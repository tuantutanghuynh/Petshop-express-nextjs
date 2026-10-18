import Link from 'next/link';
import type { Crumb } from '../../lib/seo/structuredData';

// Visible trail; the page emits the matching BreadcrumbList JSON-LD from the same crumbs.
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Đường dẫn" className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-x-1">
        {crumbs.map((c, i) => (
          <li key={`${c.name}-${i}`} className="flex min-w-0 items-center gap-1">
            {i > 0 && <span aria-hidden="true">›</span>}
            {c.path ? (
              <Link href={c.path} className="inline-flex min-h-11 min-w-11 items-center justify-center hover:underline">{c.name}</Link>
            ) : (
              // A product name may hold one very long word (SKU, URL): let it break instead of widening the page.
              <span aria-current="page" className="min-w-0 font-bold [overflow-wrap:anywhere] text-ink">{c.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
