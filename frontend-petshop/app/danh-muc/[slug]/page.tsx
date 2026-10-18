import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductGrid } from '../../../components/product/ProductGrid';
import { JsonLd } from '../../../components/seo/JsonLd';
import { Breadcrumb } from '../../../components/ui/Breadcrumb';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Pagination } from '../../../components/ui/Pagination';
import { pageCount, parsePageParam } from '../../../lib/pagination';
import { breadcrumbJsonLd, categoryPath, type Crumb } from '../../../lib/seo/structuredData';
import { SITE_NAME, siteUrl } from '../../../lib/site';
import { CATEGORY_PAGE_SIZE, getCategoryProducts, getShopCategory } from '../../../services/catalog';

// Category listing. Search intent: commercial.
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, { page: rawPage }] = await Promise.all([params, searchParams]);
  const category = await getShopCategory(slug);
  const page = parsePageParam(rawPage);
  if (!category || page === null) return { title: 'Không tìm thấy', robots: { index: false } };

  const path = categoryPath(category.slug);
  const description = category.description || `${category.name} cho chó mèo tại ${SITE_NAME}.`;
  return {
    title: page > 1 ? `${category.name} – Trang ${page}` : category.name,
    description,
    alternates: { canonical: page > 1 ? `${path}?page=${page}` : path },
    // Page 2+ stays out of the index but its links are still followed, so every product is reached.
    ...(page > 1 && { robots: { index: false, follow: true } }),
    openGraph: { title: category.name, description, url: path },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, { page: rawPage }] = await Promise.all([params, searchParams]);
  const page = parsePageParam(rawPage);
  const category = await getShopCategory(slug);
  if (!category || page === null) notFound();

  const { products, total } = await getCategoryProducts(category.slug, page);
  const totalPages = pageCount(total, CATEGORY_PAGE_SIZE);
  // A page past the end is not a real page (404), but page 1 of an empty category is — it shows
  // the empty state.
  if (page > totalPages) notFound();

  const path = categoryPath(category.slug);
  const crumbs: Crumb[] = [{ name: 'Trang chủ', path: '/' }, { name: category.name }];

  return (
    <main id="main" className="mx-auto max-w-[1200px] px-4 pb-8">
      <JsonLd data={breadcrumbJsonLd(siteUrl(), crumbs)} />
      <Breadcrumb crumbs={crumbs} />
      <header className="mb-6 flex flex-col gap-2">
        <h1 className="text-[clamp(1.6rem,1.3rem+1.4vw,2.25rem)] font-extrabold">{category.name}</h1>
        {category.description && <p className="max-w-prose">{category.description}</p>}
        <p className="text-sm text-muted">
          {total} sản phẩm{totalPages > 1 && ` · Trang ${page}/${totalPages}`} · Mới nhất trước
        </p>
      </header>
      <section aria-labelledby="list-title">
        {/* Keeps the outline h1 → h2 → h3 (product names) for screen readers. */}
        <h2 id="list-title" className="sr-only">Sản phẩm trong danh mục {category.name}</h2>
        {products.length === 0 ? (
          <EmptyState message="Danh mục này chưa có sản phẩm — quay lại sớm nhé!" />
        ) : (
          <ProductGrid products={products} />
        )}
        <Pagination basePath={path} page={page} totalPages={totalPages} />
      </section>
    </main>
  );
}
