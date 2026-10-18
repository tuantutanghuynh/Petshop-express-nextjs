import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductGrid } from '../../components/product/ProductGrid';
import { SortLinks } from '../../components/product/SortLinks';
import { SearchForm } from '../../components/search/SearchForm';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pagination } from '../../components/ui/Pagination';
import { listHref, parseSearchQuery, parseSortParam } from '../../lib/catalogParams';
import { pageCount, parsePageParam } from '../../lib/pagination';
import { CATEGORY_PAGE_SIZE, searchProducts } from '../../services/catalog';

// Internal search results: endless thin pages, so never indexed (seo.md) and disallowed in robots.txt.
export const metadata: Metadata = { title: 'Tìm kiếm', robots: { index: false, follow: true } };

type Props = { searchParams: Promise<{ q?: string | string[]; page?: string | string[]; sort?: string | string[] }> };

export default async function SearchPage({ searchParams }: Props) {
  const { q: rawQ, page: rawPage, sort: rawSort } = await searchParams;
  const q = parseSearchQuery(rawQ);
  const page = parsePageParam(rawPage);
  const sort = parseSortParam(rawSort);
  if (page === null || sort === null) notFound();

  const typed = typeof rawQ === 'string' ? rawQ.trim() : '';
  const result = q ? await searchProducts(q, page, sort) : null;
  const totalPages = result ? pageCount(result.total, CATEGORY_PAGE_SIZE) : 1;
  if (result && result.total > 0 && page > totalPages) notFound();

  return (
    <main id="main" className="mx-auto min-h-dvh max-w-[1200px] px-4 md:px-6 py-6">
      <h1 className="mb-4 text-2xl font-extrabold">{q ? `Kết quả cho “${q}”` : 'Tìm kiếm'}</h1>
      <div className="mb-6 max-w-xl"><SearchForm defaultValue={typed} /></div>

      {!q && typed && <p role="status" className="text-sm text-pink-ink">Nhập ít nhất 2 ký tự để tìm.</p>}
      {result && (
        <section aria-labelledby="results-title">
          <h2 id="results-title" className="sr-only">Sản phẩm tìm thấy</h2>
          {result.total === 0 ? (
            <EmptyState message="Không tìm thấy sản phẩm phù hợp. Thử từ khoá ngắn hơn, ví dụ “pate” hoặc “hạt mèo”." />
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">{result.total} sản phẩm</p>
              {result.total > 1 && <div className="mb-4"><SortLinks current={sort} hrefFor={(s) => listHref('/tim-kiem', { q: q ?? undefined, sort: s })} /></div>}
              <ProductGrid products={result.products} />
              <Pagination hrefFor={(p) => listHref('/tim-kiem', { q: q ?? undefined, sort, page: p })} page={page} totalPages={totalPages} />
            </>
          )}
        </section>
      )}
    </main>
  );
}
