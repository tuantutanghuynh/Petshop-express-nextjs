import Link from 'next/link';
import type { Crumb } from '../../lib/seo/structuredData';

// Visible trail; the page emits the matching BreadcrumbList JSON-LD from the same crumbs.
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Đường dẫn" className="text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-x-1">
        {crumbs.map((c, i) => (
          <li key={`${c.name}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true">›</span>}
            {c.path ? (
              <Link href={c.path} className="inline-flex min-h-11 items-center hover:underline">{c.name}</Link>
            ) : (
              <span aria-current="page" className="font-bold text-ink">{c.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
