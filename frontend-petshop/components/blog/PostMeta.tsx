import { formatDate, readingMinutes } from '../../lib/blog';
import type { BlogPost } from '../../lib/types';

// "12/10/2026 · 5 phút đọc" (publish date, falling back to creation for older posts).
// onMint: text-muted is only 4.49:1 on the mint background; the palette's teal-deep is 4.96:1.
export function PostMeta({ post, withAuthor = false, onMint = false }: { post: BlogPost; withAuthor?: boolean; onMint?: boolean }) {
  const date = post.publishedAt ?? post.createdAt;
  return (
    <small className={`text-xs ${onMint ? 'text-brand-deep' : 'text-muted'}`}>
      <time dateTime={date}>{formatDate(date)}</time>
      {withAuthor && post.author?.fullName && ` · ${post.author.fullName}`} · {readingMinutes(post.content)} phút đọc
    </small>
  );
}
