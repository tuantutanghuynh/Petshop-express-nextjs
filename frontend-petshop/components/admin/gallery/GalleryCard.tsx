import Image from 'next/image';
import Link from 'next/link';
import { imageSrc } from '../../../lib/storefront';
import type { GalleryItem } from '../../../lib/types';

// One photo: the image, its title and alt text (what screen readers and image search read), edit
// and delete. Alt text is admin-typed: shown as text and allowed to break anywhere.
export function GalleryCard({ item, busy, onDelete }: { item: GalleryItem; busy: boolean; onDelete: (item: GalleryItem) => void }) {
  const src = imageSrc(item.imageUrl);
  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
      <div className="relative aspect-square bg-surface-alt">
        {src ? (
          <Image src={src} alt={item.altText} fill sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw" className="object-cover" />
        ) : (
          <p className="grid h-full place-items-center p-2 text-center text-xs text-muted">Ảnh không hiển thị được</p>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h2 className="text-sm leading-[1.4] font-extrabold break-words">{item.title || 'Chưa có tiêu đề'}</h2>
        <p className="line-clamp-2 text-xs text-muted break-words">{item.altText}</p>
        <div className="mt-auto flex flex-wrap gap-2">
          <Link href={`/admin/gallery/${item.id}`} className="inline-flex min-h-11 items-center rounded-full border border-brand-ink px-4 text-sm font-bold text-brand-ink hover:bg-mint">Sửa</Link>
          <button type="button" disabled={busy} onClick={() => onDelete(item)} className="inline-flex min-h-11 items-center rounded-full border border-pink-ink px-4 text-sm font-bold text-pink-ink disabled:opacity-60">Xoá</button>
        </div>
      </div>
    </article>
  );
}
