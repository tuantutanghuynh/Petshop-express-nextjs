import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductGallery } from '../../../components/product/ProductGallery';
import { ProductGrid } from '../../../components/product/ProductGrid';
import { SpecTable } from '../../../components/product/SpecTable';
import { VariantPicker } from '../../../components/product/VariantPicker';
import { JsonLd } from '../../../components/seo/JsonLd';
import { Breadcrumb } from '../../../components/ui/Breadcrumb';
import { excerptFromContent, renderMarkdown } from '../../../lib/markdown';
import { breadcrumbJsonLd, categoryPath, productJsonLd, productPath, type Crumb } from '../../../lib/seo/structuredData';
import { SITE_NAME, siteUrl } from '../../../lib/site';
import { imageSrc } from '../../../lib/storefront';
import { getCategoryProducts, getShopProduct } from '../../../services/catalog';
import { getShopInfo } from '../../../services/content';

// Product detail. Search intent: transactional.
type Props = { params: Promise<{ slug: string }> };

const RELATED_COUNT = 4;

// No product is rendered at build time; each one is rendered on its first visit and then cached
// (ISR, refreshed with the 5-minute data cache). Without this export the route would be fully
// dynamic: a backend call per view, and metadata that may stream into <body> instead of <head>.
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getShopProduct(slug);
  if (!product) return { title: 'Không tìm thấy sản phẩm', robots: { index: false } };

  // Product has no metaTitle / metaDescription columns yet (needs a migration), so the name and
  // the start of the description are used. A description must always be present: returning
  // undefined would drop the tag rather than inherit the site default.
  const description = product.description
    ? excerptFromContent(product.description, 155)
    : `${product.name} tại ${SITE_NAME}.`;
  const path = productPath(product.slug);
  const image = imageSrc(product.images[0]?.url);
  return {
    title: product.name,
    description,
    alternates: { canonical: path },
    openGraph: { title: product.name, description, url: path, ...(image && { images: [{ url: image }] }) },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getShopProduct(slug);
  if (!product) notFound();

  const [shop, related] = await Promise.all([
    getShopInfo(),
    getCategoryProducts(product.category.slug, 1)
      .then((r) => r.products.filter((p) => p.id !== product.id).slice(0, RELATED_COUNT))
      .catch((err: unknown) => {
        // Optional block: the product itself still renders if this list fails.
        console.error('product page: could not load related products', err);
        return [];
      }),
  ]);

  const base = siteUrl();
  const crumbs: Crumb[] = [
    { name: 'Trang chủ', path: '/' },
    { name: product.category.name, path: categoryPath(product.category.slug) },
    { name: product.name },
  ];

  return (
    <main id="main" className="mx-auto max-w-[1200px] px-4 pb-8 max-md:pb-24 md:px-6">
      <JsonLd data={productJsonLd(base, product)} />
      <JsonLd data={breadcrumbJsonLd(base, crumbs)} />
      <Breadcrumb crumbs={crumbs} />

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
        <ProductGallery images={product.images} name={product.name} />
        <div className="flex min-w-0 flex-col gap-4">
          <h1 className="text-[clamp(1.5rem,1.2rem+1.2vw,2.1rem)] font-extrabold">{product.name}</h1>
          {product.brand && <p className="text-sm text-muted">Thương hiệu: <span className="font-bold text-ink">{product.brand}</span></p>}
          {product.variants.length > 0 ? (
            <VariantPicker variants={product.variants} phone={shop.phone} product={{ name: product.name, slug: product.slug }} />
          ) : (
            <p className="text-sm text-muted">Sản phẩm đang cập nhật giá.</p>
          )}
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {product.description && (
          <section aria-labelledby="desc-title">
            <h2 id="desc-title" className="mb-3 text-lg font-extrabold">Mô tả sản phẩm</h2>
            {/* Sanitised by DOMPurify in renderMarkdown. */}
            <div
              className="max-w-prose [&_a]:text-brand-ink [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(product.description) }}
            />
          </section>
        )}
        <SpecTable attributes={product.category.attributes ?? []} values={product.attributes} />
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="mt-12">
          <h2 id="related-title" className="mb-4 text-xl font-extrabold">Cùng danh mục {product.category.name}</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </main>
  );
}
