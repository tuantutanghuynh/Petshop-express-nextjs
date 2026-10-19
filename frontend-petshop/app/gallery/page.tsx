import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GalleryGrid, type GalleryPhoto } from '../../components/gallery/GalleryGrid';
import { JsonLd } from '../../components/seo/JsonLd';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import { EmptyState } from '../../components/ui/EmptyState';
import { pageCount, parsePageParam } from '../../lib/pagination';
import { breadcrumbJsonLd, type Crumb } from '../../lib/seo/structuredData';
import { SITE_NAME, siteUrl } from '../../lib/site';
import { imageSrc } from '../../lib/storefront';
import { GALLERY_PAGE_SIZE, getGalleryPage } from '../../services/content';

// Cached for 5 minutes and refreshed at once when the admin adds a photo ("gallery" tag).
type Props = { searchParams: Promise<{ page?: string | string[] }> };

const TITLE = 'Thư viện ảnh các bé';
const DESCRIPTION = `Những khoảnh khắc đáng yêu của khách hàng và các bé ở ${SITE_NAME}.`;
const pageHref = (page: number) => (page > 1 ? `/gallery?page=${page}` : '/gallery');

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = parsePageParam((await searchParams).page);
  if (page === null) return { title: 'Không tìm thấy', robots: { index: false } };
  return {
    title: page > 1 ? `Thư viện ảnh – Trang ${page}` : 'Thư viện ảnh',
    description: DESCRIPTION,
    alternates: { canonical: pageHref(page) },
    ...(page > 1 && { robots: { index: false, follow: true } }),
  };
}

export default async function GalleryPage({ searchParams }: Props) {
  const page = parsePageParam((await searchParams).page);
  if (page === null) notFound();
  const { items, total } = await getGalleryPage(page);
  const totalPages = pageCount(total, GALLERY_PAGE_SIZE);
  if (total > 0 && page > totalPages) notFound();

  const photos: GalleryPhoto[] = items.flatMap((item) => {
    const src = imageSrc(item.imageUrl);
    return src ? [{ id: item.id, src, alt: item.altText, title: item.title }] : [];
  });
  const crumbs: Crumb[] = [{ name: 'Trang chủ', path: '/' }, { name: 'Thư viện ảnh' }];
  const nav = 'inline-flex min-h-11 items-center rounded-full border border-brand-ink px-5 font-bold text-brand-ink hover:bg-mint';

  return (
    <div className="flex flex-col gap-6">
      <JsonLd data={breadcrumbJsonLd(siteUrl(), crumbs)} />
      <div>
        <Breadcrumb crumbs={crumbs} />
        <h1 className="text-[clamp(1.5rem,1.1rem+1.6vw,2.1rem)] font-extrabold">{TITLE}</h1>
        <p className="mt-2 max-w-prose">{DESCRIPTION}</p>
      </div>
      {photos.length === 0 ? (
        <EmptyState message="Thư viện ảnh đang được cập nhật." />
      ) : (
        <section aria-labelledby="photos-title">
          <h2 id="photos-title" className="sr-only">Ảnh</h2>
          <GalleryGrid photos={photos} />
        </section>
      )}
      {/* Real ?page=N links (crawlable), as in the wireframe's "Xem thêm ảnh". */}
      {(page > 1 || page < totalPages) && (
        <nav aria-label="Phân trang ảnh" className="flex justify-center gap-3">
          {page > 1 && <Link href={pageHref(page - 1)} rel="prev" className={nav}>‹ Ảnh trước</Link>}
          {page < totalPages && <Link href={pageHref(page + 1)} rel="next" className={nav}>Xem thêm ảnh ›</Link>}
        </nav>
      )}
    </div>
  );
}
