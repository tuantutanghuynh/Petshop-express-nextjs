import Image from 'next/image';
import Link from 'next/link';
import { POST_STATE_LABELS, postState } from '../../../lib/adminPosts';
import { formatDate } from '../../../lib/blog';
import { imageSrc } from '../../../lib/storefront';
import type { BlogPost } from '../../../lib/types';

const STATE_STYLE = { draft: 'bg-line text-ink', published: 'bg-mint text-brand-ink', scheduled: 'bg-yellow-hero/40 text-ink' } as const;

// One post in the admin list: cover, title, state, date, edit / view / delete. "Xem" only for a post
// that is live (a draft or a scheduled post would answer 404 on the public page).
export function PostCard({ post, busy, onDelete }: { post: BlogPost; busy: boolean; onDelete: (post: BlogPost) => void }) {
  const state = postState(post);
  const cover = imageSrc(post.coverImageUrl);
  const when = post.publishedAt ? formatDate(post.publishedAt) : `Tạo ${formatDate(post.createdAt)}`;
  const action = 'inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold';
  return (
    <article className="flex gap-3 rounded-card border border-line bg-surface p-3">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface-alt md:size-24">
        {cover && <Image src={cover} alt="" fill sizes="96px" className="object-cover" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h2 className="text-base leading-[1.4] font-extrabold break-words">{post.title}</h2>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATE_STYLE[state]}`}>{POST_STATE_LABELS[state]}</span>
          <span>{when}</span>
          {post.category && <span>· {post.category.name}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/posts/${post.id}`} className={`${action} border border-brand-ink text-brand-ink hover:bg-mint`}>Sửa</Link>
          {state === 'published' && (
            <Link href={`/blog/${post.slug}`} target="_blank" className={`${action} border border-line text-ink hover:bg-mint`}>Xem ↗</Link>
          )}
          <button type="button" disabled={busy} onClick={() => onDelete(post)} className={`${action} border border-pink-ink text-pink-ink disabled:opacity-60`}>Xoá</button>
        </div>
      </div>
    </article>
  );
}
