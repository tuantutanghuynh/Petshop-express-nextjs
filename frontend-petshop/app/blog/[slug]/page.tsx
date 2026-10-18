import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '../../../components/seo/JsonLd';
import { Breadcrumb } from '../../../components/ui/Breadcrumb';
import { excerptFromContent, renderMarkdown } from '../../../lib/markdown';
import { blogPath, blogPostingJsonLd, breadcrumbJsonLd, type Crumb } from '../../../lib/seo/structuredData';
import { siteUrl } from '../../../lib/site';
import { imageSrc } from '../../../lib/storefront';
import { getPost } from '../../../services/content';

type Props = { params: Promise<{ slug: string }> };

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

export default async function BlogDetailPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound(); // only a real 404 from the API; other errors are thrown (no soft 404)

  const base = siteUrl();
  const crumbs: Crumb[] = [{ name: 'Trang chủ', path: '/' }, { name: 'Kiến thức', path: '/blog' }, { name: post.title }];

  return (
    <article className="prose max-w-none">
      <JsonLd data={blogPostingJsonLd(base, post)} />
      <JsonLd data={breadcrumbJsonLd(base, crumbs)} />
      <Breadcrumb crumbs={crumbs} />
      <h1 className="mb-4 text-3xl font-bold">{post.title}</h1>
      {/* Sanitised by DOMPurify in renderMarkdown. */}
      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }} />
    </article>
  );
}
