import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductGrid } from '../../../components/product/ProductGrid';
import { SortLinks } from '../../../components/product/SortLinks';
import { JsonLd } from '../../../components/seo/JsonLd';
import { Breadcrumb } from '../../../components/ui/Breadcrumb';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Pagination } from '../../../components/ui/Pagination';
import { DEFAULT_SORT, SORT_LABELS, listHref, parseBrandParam, parseSortParam } from '../../../lib/catalogParams';
import { pageCount, parsePageParam } from '../../../lib/pagination';
import { categoryCrumbs } from '../../../lib/seo/categoryCrumbs';
import { breadcrumbJsonLd, categoryPath } from '../../../lib/seo/structuredData';
import { SITE_NAME, siteUrl } from '../../../lib/site';
import { CATEGORY_PAGE_SIZE, getCategoryProducts, getCategoryTrail, getShopCategory } from '../../../services/catalog';

// Category listing. Search intent: commercial.
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[]; sort?: string | string[]; 'thuong-hieu'?: string | string[] }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, { page: rawPage, sort: rawSort, 'thuong-hieu': rawBrand }] = await Promise.all([params, searchParams]);
  const category = await getShopCategory(slug);
  const page = parsePageParam(rawPage);
  const sort = parseSortParam(rawSort);
  const brand = parseBrandParam(rawBrand);
  if (!category || page === null || sort === null || brand === null) return { title: 'Không tìm thấy', robots: { index: false } };

  const path = categoryPath(category.slug);
  const description = category.description || `${category.name} cho chó mèo tại ${SITE_NAME}.`;
  const sorted = sort !== DEFAULT_SORT;
  const titleParts = [category.name, brand && `Thương hiệu ${brand}`, sorted && SORT_LABELS[sort], page > 1 && `Trang ${page}`].filter(Boolean);
  return {
    title: titleParts.join(' – '),
    description,
    // A re-sorted or brand-filtered list shows products the category page already lists: its
    // canonical is the category itself. Page 2+ of the default order is self-canonical. None of
    // them is indexed, but their links are followed, so every product is still reached.
    alternates: { canonical: sorted || brand ? path : listHref(path, { page }) },
    ...((page > 1 || sorted || brand) && { robots: { index: false, follow: true } }),
    openGraph: { title: category.name, description, url: path },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, { page: rawPage, sort: rawSort, 'thuong-hieu': rawBrand }] = await Promise.all([params, searchParams]);
  const page = parsePageParam(rawPage);
  const sort = parseSortParam(rawSort);
  const brand = parseBrandParam(rawBrand);
  const category = await getShopCategory(slug);
  if (!category || page === null || sort === null || brand === null) notFound();

  const [{ products, total }, trail] = await Promise.all([getCategoryProducts(category.slug, page, sort, brand), getCategoryTrail(category.slug)]);
  const totalPages = pageCount(total, CATEGORY_PAGE_SIZE);
  // A page past the end is not a real page (404), but page 1 of an empty category is — it shows
  // the empty state.
  if (page > totalPages) notFound();

  const path = categoryPath(category.slug);
  const crumbs = categoryCrumbs(trail.length > 0 ? trail : [category]);

  return (
    <main id="main" className="mx-auto max-w-[1200px] px-4 md:px-6 pb-8">
      <JsonLd data={breadcrumbJsonLd(siteUrl(), crumbs)} />
      <Breadcrumb crumbs={crumbs} />
      <header className="mb-6 flex flex-col gap-2">
        <h1 className="text-[clamp(1.6rem,1.3rem+1.4vw,2.25rem)] font-extrabold">{category.name}</h1>
        {category.description && <p className="max-w-prose">{category.description}</p>}
        {category.children.length > 0 && (
          <nav aria-label="Danh mục con">
            <ul className="flex flex-wrap gap-2">
              {category.children.map((c) => (
                <li key={c.id}>
                  <Link href={categoryPath(c.slug)} className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-bold text-ink hover:border-brand-ink">{c.name}</Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {brand && (
          <Link href={listHref(path, { sort })} className="inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-mint px-4 text-sm font-bold text-brand-deep">
            Thương hiệu: {brand} <span aria-hidden="true">✕</span><span className="sr-only">(bỏ lọc thương hiệu)</span>
          </Link>
        )}
        <p className="text-sm text-muted">
          {total} sản phẩm{totalPages > 1 && ` · Trang ${page}/${totalPages}`}
        </p>
      </header>
      {total > 1 && <div className="mb-4"><SortLinks current={sort} hrefFor={(s) => listHref(path, { brand, sort: s })} /></div>}
      <section aria-labelledby="list-title">
        {/* Keeps the outline h1 → h2 → h3 (product names) for screen readers. */}
        <h2 id="list-title" className="sr-only">Sản phẩm trong danh mục {category.name}</h2>
        {products.length === 0 ? (
          <EmptyState message={brand ? `Chưa có sản phẩm ${brand} trong danh mục này.` : 'Danh mục này chưa có sản phẩm — quay lại sớm nhé!'} />
        ) : (
          <ProductGrid products={products} />
        )}
        <Pagination hrefFor={(p) => listHref(path, { brand, sort, page: p })} page={page} totalPages={totalPages} />
      </section>
    </main>
  );
}
