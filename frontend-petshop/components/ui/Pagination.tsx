import Link from 'next/link';

type Props = { basePath: string; page: number; totalPages: number };

// Real ?page=N links (crawlable, shareable) — never infinite scroll on public pages. Page 1 is the
// bare path, so it has exactly one URL.
const hrefFor = (basePath: string, page: number) => (page === 1 ? basePath : `${basePath}?page=${page}`);

export function Pagination({ basePath, page, totalPages }: Props) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );
  const item = 'grid min-h-11 min-w-11 place-items-center rounded-full px-3 text-sm font-bold';
  return (
    <nav aria-label="Phân trang" className="mt-8">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        {page > 1 && (
          <li><Link className={`${item} border border-line`} href={hrefFor(basePath, page - 1)} rel="prev">‹ Trước</Link></li>
        )}
        {pages.map((p, i) => (
          <li key={p} className="flex items-center gap-2">
            {i > 0 && p - pages[i - 1] > 1 && <span aria-hidden="true">…</span>}
            {p === page ? (
              <span aria-current="page" className={`${item} bg-brand-ink text-white`}>{p}</span>
            ) : (
              <Link className={`${item} border border-line`} href={hrefFor(basePath, p)} aria-label={`Trang ${p}`}>{p}</Link>
            )}
          </li>
        ))}
        {page < totalPages && (
          <li><Link className={`${item} border border-line`} href={hrefFor(basePath, page + 1)} rel="next">Sau ›</Link></li>
        )}
      </ul>
    </nav>
  );
}
