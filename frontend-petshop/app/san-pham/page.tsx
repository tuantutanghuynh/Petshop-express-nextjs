import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductGrid } from '../../components/product/ProductGrid';
import { SortLinks } from '../../components/product/SortLinks';
import { JsonLd } from '../../components/seo/JsonLd';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pagination } from '../../components/ui/Pagination';
import { DEFAULT_SORT, SORT_LABELS, listHref, parseSortParam } from '../../lib/catalogParams';
import { pageCount, parsePageParam } from '../../lib/pagination';
import { breadcrumbJsonLd, type Crumb } from '../../lib/seo/structuredData';
import { SITE_NAME, siteUrl } from '../../lib/site';
import { CATEGORY_PAGE_SIZE, getAllShopProducts } from '../../services/catalog';

// Every product of the shop. Search intent: commercial. Same URL rules as a category page.
type Props = { searchParams: Promise<{ page?: string | string[]; sort?: string | string[] }> };

const PATH = '/san-pham';
const TITLE = 'Tất cả sản phẩm';
const DESCRIPTION = `Thức ăn, pate, phụ kiện và đồ chăm sóc cho chó mèo tại ${SITE_NAME}.`;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const page = parsePageParam(sp.page);
  const sort = parseSortParam(sp.sort);
  if (page === null || sort === null) return { title: 'Không tìm thấy', robots: { index: false } };
  const sorted = sort !== DEFAULT_SORT;
  return {
    title: [TITLE, sorted && SORT_LABELS[sort], page > 1 && `Trang ${page}`].filter(Boolean).join(' – '),
    description: DESCRIPTION,
    alternates: { canonical: sorted ? PATH : listHref(PATH, { page }) },
    ...((page > 1 || sorted) && { robots: { index: false, follow: true } }),
    openGraph: { title: TITLE, description: DESCRIPTION, url: PATH },
  };
}

export default async function ProductsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = parsePageParam(sp.page);
  const sort = parseSortParam(sp.sort);
  if (page === null || sort === null) notFound();

  const { products, total } = await getAllShopProducts(page, sort);
  const totalPages = pageCount(total, CATEGORY_PAGE_SIZE);
  if (total > 0 && page > totalPages) notFound();
  const crumbs: Crumb[] = [{ name: 'Trang chủ', path: '/' }, { name: 'Sản phẩm' }];

  return (
    <main id="main" className="mx-auto max-w-[1200px] px-4 pb-8 md:px-6">
      <JsonLd data={breadcrumbJsonLd(siteUrl(), crumbs)} />
      <Breadcrumb crumbs={crumbs} />
      <header className="mb-6 flex flex-col gap-2">
        <h1 className="text-[clamp(1.6rem,1.3rem+1.4vw,2.25rem)] font-extrabold">{TITLE}</h1>
        <p className="text-sm text-muted">{total} sản phẩm{totalPages > 1 && ` · Trang ${page}/${totalPages}`}</p>
      </header>
      {total > 1 && <div className="mb-4"><SortLinks current={sort} hrefFor={(s) => listHref(PATH, { sort: s })} /></div>}
      <section aria-labelledby="list-title">
        <h2 id="list-title" className="sr-only">Danh sách sản phẩm</h2>
        {products.length === 0 ? <EmptyState message="Sản phẩm đang được cập nhật — quay lại sớm nhé!" /> : <ProductGrid products={products} />}
        <Pagination hrefFor={(p) => listHref(PATH, { sort, page: p })} page={page} totalPages={totalPages} />
      </section>
    </main>
  );
}
