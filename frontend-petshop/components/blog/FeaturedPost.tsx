import Image from 'next/image';
import Link from 'next/link';
import { blogPath } from '../../lib/seo/structuredData';
import { imageSrc } from '../../lib/storefront';
import type { BlogPost } from '../../lib/types';
import { PostMeta } from './PostMeta';
import { TopicBadge } from './TopicBadge';

// The newest post as a large mint block (wireframe). Its cover is the page's LCP element.
export function FeaturedPost({ post }: { post: BlogPost }) {
  const src = imageSrc(post.coverImageUrl);
  return (
    <article className="relative grid gap-4 rounded-panel bg-mint p-4 md:grid-cols-[1.2fr_1fr] md:items-center md:p-6">
      <div className="relative aspect-video overflow-hidden rounded-card bg-surface/50">
        {src && <Image src={src} alt="" fill fetchPriority="high" sizes="(min-width: 768px) 55vw, 100vw" className="object-cover" />}
      </div>
      <div className="flex flex-col gap-2">
        {post.category && <TopicBadge name={post.category.name} slug={post.category.slug} />}
        <h2 className="text-[clamp(1.25rem,1rem+1vw,1.75rem)] font-extrabold">
          <Link href={blogPath(post.slug)} className="after:absolute after:inset-0 after:rounded-panel hover:underline">{post.title}</Link>
        </h2>
        {post.excerpt && <p className="line-clamp-3">{post.excerpt}</p>}
        <PostMeta post={post} withAuthor onMint />
      </div>
    </article>
  );
}
