import { apiFetch } from '../../../lib/apiClient';
import { renderMarkdown, excerptFromContent } from '../../../lib/markdown';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { BlogPost } from '../../../lib/types';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params; // Next.js 16: params là Promise, bắt buộc phải await

  try {
    const { data: post } = await apiFetch<BlogPost>(`/blog/${slug}`, { cache: 'no-store' });
    // Luôn phải có description — nếu cả seoDescription lẫn excerpt đều trống, description
    // trả về null sẽ XOÁ hẳn thẻ <meta name="description">, không phải kế thừa từ layout.
    const description = post.seoDescription || post.excerpt || excerptFromContent(post.content);
    return {
      title: post.seoTitle || post.title,
      description,
      openGraph: {
        title: post.seoTitle || post.title,
        description,
        images: post.coverImageUrl ? [`${process.env.NEXT_PUBLIC_BACKEND_ORIGIN}${post.coverImageUrl}`] : [],
        type: 'article',
      },
    };
  } catch {
    return {
      title: 'Không tìm thấy bài viết',
    };
  }
}

export default async function BlogDetailPage({ params }: Props) {
  const { slug } = await params; // Next.js 16: params là Promise, bắt buộc phải await

  let post: BlogPost;
  try {
    const { data } = await apiFetch<BlogPost>(`/blog/${slug}`, { cache: 'no-store' });
    post = data;
  } catch {
    notFound();
  }

  const html = renderMarkdown(post.content);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { '@type': 'Person', name: post.author?.fullName || 'Miniecom' },
  };

  return (
    <article className="prose max-w-none">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="text-3xl font-bold mb-4">{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
