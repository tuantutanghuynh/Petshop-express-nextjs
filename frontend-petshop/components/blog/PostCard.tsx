import Image from 'next/image';
import Link from 'next/link';
import { blogPath } from '../../lib/seo/structuredData';
import { imageSrc } from '../../lib/storefront';
import type { BlogPost } from '../../lib/types';
import { PostMeta } from './PostMeta';
import { TopicBadge } from './TopicBadge';

// Post tile: 16:9 cover, topic, title (the link — stretched over the whole card), excerpt, date.
export function PostCard({ post }: { post: BlogPost }) {
  const src = imageSrc(post.coverImageUrl);
  return (
    <article className="relative flex h-full flex-col gap-2 rounded-card bg-surface p-3 shadow-card">
      <div className="relative aspect-video overflow-hidden rounded-card bg-mint">
        {src && <Image src={src} alt="" fill sizes="(min-width: 1024px) 380px, (min-width: 768px) 45vw, 100vw" className="object-cover" />}
      </div>
      {post.category && <TopicBadge name={post.category.name} slug={post.category.slug} />}
      <h3 className="text-base font-bold">
        <Link href={blogPath(post.slug)} className="after:absolute after:inset-0 after:rounded-card hover:underline">{post.title}</Link>
      </h3>
      {post.excerpt && <p className="line-clamp-3 text-sm text-muted">{post.excerpt}</p>}
      <div className="mt-auto"><PostMeta post={post} /></div>
    </article>
  );
}
