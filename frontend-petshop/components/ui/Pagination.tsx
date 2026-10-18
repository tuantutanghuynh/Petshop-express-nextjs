import Link from 'next/link';

// hrefFor builds each page's URL and keeps the rest of the list state (sort, q) — lib/catalogParams.ts
// listHref leaves page 1 out, so the first page has exactly one address.
type Props = { hrefFor: (page: number) => string; page: number; totalPages: number };

// Real ?page=N links (crawlable, shareable) — never infinite scroll on public pages.
export function Pagination({ hrefFor, page, totalPages }: Props) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );
  const item = 'grid min-h-11 min-w-11 place-items-center rounded-full px-3 text-sm font-bold';
  return (
    <nav aria-label="Phân trang" className="mt-8">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        {page > 1 && (
          <li><Link className={`${item} border border-line`} href={hrefFor(page - 1)} rel="prev">‹ Trước</Link></li>
        )}
        {pages.map((p, i) => (
          <li key={p} className="flex items-center gap-2">
            {i > 0 && p - pages[i - 1] > 1 && <span aria-hidden="true">…</span>}
            {p === page ? (
              <span aria-current="page" className={`${item} bg-brand-ink text-white`}>{p}</span>
            ) : (
              <Link className={`${item} border border-line`} href={hrefFor(p)} aria-label={`Trang ${p}`}>{p}</Link>
            )}
          </li>
        ))}
        {page < totalPages && (
          <li><Link className={`${item} border border-line`} href={hrefFor(page + 1)} rel="next">Sau ›</Link></li>
        )}
      </ul>
    </nav>
  );
}
