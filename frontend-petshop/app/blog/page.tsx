import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { EmptyState } from '../../components/ui/EmptyState';
import { blogPath } from '../../lib/seo/structuredData';
import { SITE_NAME } from '../../lib/site';
import { imageSrc } from '../../lib/storefront';
import { getPostList } from '../../services/content';

// Search intent: informational. Cached for 5 minutes and refreshed at once when the admin publishes
// (POST /api/revalidate with the "blog" tag).
export const metadata: Metadata = {
  title: 'Kiến thức chăm sóc chó mèo',
  description: `Bài viết về dinh dưỡng, sức khoẻ, tẩy giun, ve rận và chăm sóc chó mèo từ ${SITE_NAME}.`,
  alternates: { canonical: '/blog' },
};

export default async function BlogListPage() {
  const posts = await getPostList();

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Kiến thức chăm sóc chó mèo</h1>
      {posts.length === 0 ? (
        <EmptyState message="Bài viết đầu tiên sắp ra mắt." />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, index) => {
            // Uploads are full Cloudinary URLs; the old code prefixed the backend origin and broke them.
            const src = imageSrc(post.coverImageUrl);
            return (
              <article key={post.id} className="overflow-hidden rounded-lg border border-gray-200">
                {/* Fixed 8:5 box: with width/height + h-auto the box took the photo's own ratio once it
                    loaded and pushed the text down (CLS 0.18 on /blog). */}
                {src && (
                  <div className="relative aspect-[8/5] bg-mint">
                    {/* The first cover is the page's LCP element: fetch it first instead of lazily. */}
                    <Image src={src} alt="" fill sizes="(min-width: 1024px) 250px, (min-width: 640px) 50vw, 100vw" className="object-cover" {...(index === 0 ? { fetchPriority: 'high' as const } : {})} />
                  </div>
                )}
                <div className="p-4">
                  <h2 className="text-lg font-semibold">
                    <Link href={blogPath(post.slug)} className="hover:underline">{post.title}</Link>
                  </h2>
                  {post.excerpt && <p className="mt-1 text-gray-600">{post.excerpt}</p>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
