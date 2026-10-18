import Image from 'next/image';
import Link from 'next/link';
import { imageSrc } from '../../lib/storefront';
import type { BlogPost } from '../../lib/types';
import { EmptyState } from '../ui/EmptyState';
import { SectionHeading } from '../ui/SectionHeading';

const DATE = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });

// Not in the mock-up: links the homepage to the care articles (topical authority, seo.md).
export function LatestPosts({ posts }: { posts: BlogPost[] | null }) {
  return (
    <section aria-labelledby="posts-title" className="mx-auto max-w-[1200px] px-4 py-6">
      <SectionHeading id="posts-title" title="📖 Kiến thức chăm sóc" moreHref="/blog" />
      {posts === null ? (
        <EmptyState tone="error" message="Chưa tải được bài viết. Vui lòng thử lại sau ít phút." />
      ) : posts.length === 0 ? (
        <EmptyState message="Bài viết đầu tiên sắp ra mắt." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-3">
          {posts.map((post) => {
            const src = imageSrc(post.coverImageUrl);
            const date = post.publishedAt ?? post.updatedAt;
            return (
              <li key={post.id}>
                <Link href={`/blog/${encodeURIComponent(post.slug)}`} className="group flex h-full flex-col gap-2">
                  <div className="relative aspect-video overflow-hidden rounded-card bg-mint">
                    {src && <Image src={src} alt="" fill sizes="(min-width: 768px) 380px, 100vw" className="object-cover" />}
                  </div>
                  <h3 className="text-base font-bold group-hover:underline">{post.title}</h3>
                  <time dateTime={date} className="text-xs text-muted">{DATE.format(new Date(date))}</time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
