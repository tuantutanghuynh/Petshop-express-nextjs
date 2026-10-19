import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PostCard } from '../../../components/blog/PostCard';
import { RelatedProducts } from '../../../components/blog/RelatedProducts';
import { TableOfContents } from '../../../components/blog/TableOfContents';
import { TopicBadge } from '../../../components/blog/TopicBadge';
import { JsonLd } from '../../../components/seo/JsonLd';
import { Breadcrumb } from '../../../components/ui/Breadcrumb';
import { blogListHref, formatDate, readingMinutes, renderArticle } from '../../../lib/blog';
import { excerptFromContent } from '../../../lib/markdown';
import { blogPath, blogPostingJsonLd, breadcrumbJsonLd, type Crumb } from '../../../lib/seo/structuredData';
import { SITE_NAME, siteUrl } from '../../../lib/site';
import { imageSrc } from '../../../lib/storefront';
import type { Product } from '../../../lib/types';
import { getCategoryProducts, getShopCategory } from '../../../services/catalog';
import { getPost, getPostList } from '../../../services/content';

type Props = { params: Promise<{ slug: string }> };

const RELATED_POSTS = 3;
const RELATED_PRODUCTS = 3;

// Rendered on first visit and cached (ISR); the "blog" tag refreshes it when the admin saves.
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: 'Không tìm thấy bài viết', robots: { index: false } };

  // A description must always be present: returning null would drop the tag, not inherit the default.
  const description = post.seoDescription || post.excerpt || excerptFromContent(post.content);
  const image = imageSrc(post.coverImageUrl);
  const path = blogPath(post.slug);
  return {
    title: post.seoTitle || post.title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: post.seoTitle || post.title,
      description,
      url: path,
      type: 'article',
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
      ...(image && { images: [{ url: image }] }),
    },
  };
}

// Same-topic products, only when the post's topic is one of this shop's categories.
async function relatedProducts(topicSlug: string | undefined): Promise<Product[]> {
  if (!topicSlug || !(await getShopCategory(topicSlug))) return [];
  return (await getCategoryProducts(topicSlug, 1)).products.slice(0, RELATED_PRODUCTS);
}

export default async function BlogDetailPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound(); // only a real 404 from the API; other errors are thrown (no soft 404)

  const [recent, products] = await Promise.all([
    getPostList(),
    relatedProducts(post.category?.slug).catch((err: unknown) => {
      console.error('blog post: could not load related products', err); // optional block
      return [] as Product[];
    }),
  ]);
  const others = recent.filter((p) => p.id !== post.id);
  const sameTopic = others.filter((p) => post.category && p.category?.slug === post.category.slug);
  const related = [...sameTopic, ...others.filter((p) => !sameTopic.includes(p))].slice(0, RELATED_POSTS);

  const { html, toc } = renderArticle(post.content);
  // The side column (table of contents, related products) only exists when it has something in it;
  // otherwise the article keeps the full width instead of sitting next to an empty column.
  const hasAside = toc.length >= 2 || (Boolean(post.category) && products.length > 0);
  const base = siteUrl();
  const cover = imageSrc(post.coverImageUrl);
  const published = post.publishedAt ?? post.createdAt;
  const crumbs: Crumb[] = [
    { name: 'Trang chủ', path: '/' },
    { name: 'Kiến thức', path: '/blog' },
    ...(post.category ? [{ name: post.category.name, path: blogListHref({ topic: post.category.slug }) }] : []),
    { name: post.title },
  ];

  return (
    <div className="flex flex-col gap-10">
      <JsonLd data={blogPostingJsonLd(base, post)} />
      <JsonLd data={breadcrumbJsonLd(base, crumbs)} />
      <div>
        <Breadcrumb crumbs={crumbs} />
        <div className={`grid gap-8 lg:items-start ${hasAside ? 'lg:grid-cols-[minmax(0,1fr)_300px]' : ''}`}>
          <article className="flex min-w-0 flex-col gap-4">
            {post.category && <TopicBadge name={post.category.name} slug={post.category.slug} />}
            <h1 className="text-[clamp(1.6rem,1.2rem+1.8vw,2.4rem)] font-extrabold">{post.title}</h1>
            <p className="text-sm text-muted">
              <b className="text-ink">{post.author?.fullName || SITE_NAME}</b>
              <br />
              Đăng <time dateTime={published}>{formatDate(published)}</time>
              {post.updatedAt.slice(0, 10) !== published.slice(0, 10) && (
                <> · Cập nhật <time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time></>
              )}
              {' '}· {readingMinutes(post.content)} phút đọc
            </p>
            {cover && (
              <div className="relative aspect-video overflow-hidden rounded-panel bg-mint">
                <Image src={cover} alt="" fill fetchPriority="high" sizes="(min-width: 1024px) 820px, 100vw" className="object-cover" />
              </div>
            )}
            <TableOfContents items={toc} variant="inline" />
            {/* Sanitised by DOMPurify in renderArticle. */}
            <div className="article-prose" dangerouslySetInnerHTML={{ __html: html }} />
            {/* Pet health content is YMYL (seo.md): every article carries this line. */}
            <p className="max-w-[68ch] rounded-card bg-yellow-bg px-4 py-3 text-sm text-yellow-ink">
              ⚕ Thông tin tham khảo, không thay thế chẩn đoán của bác sĩ thú y.
            </p>
          </article>
          {hasAside && (
            <aside className="flex flex-col gap-4 lg:sticky lg:top-36">
              <TableOfContents items={toc} variant="side" />
              {post.category && <RelatedProducts products={products} category={post.category} />}
            </aside>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-title">
          <h2 id="related-title" className="mb-4 text-xl font-extrabold">Bài viết liên quan</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => <li key={p.id}><PostCard post={p} /></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
