import Image from 'next/image';
import { formatDate } from '../../lib/blog';
import { imageSrc } from '../../lib/storefront';
import type { PublicReview } from '../../lib/types';
import { Stars } from './Stars';

// One approved review: stars, the short author name with "Đã mua hàng" (only buyers can review),
// date, text as written (plain text, line breaks kept), photos, and the shop's reply.
export function ReviewItem({ review }: { review: PublicReview }) {
  const photos = review.images.map((url) => imageSrc(url)).filter((u): u is string => u !== null);
  return (
    <li className="flex flex-col gap-2 border-b border-line py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Stars value={review.rating} className="text-sm" />
        <b className="text-ink">{review.authorName}</b>
        <span className="rounded-full bg-mint px-2 py-0.5 text-xs font-bold text-brand-deep">Đã mua hàng</span>
        <time dateTime={review.createdAt} className="text-xs text-muted">{formatDate(review.createdAt)}</time>
      </div>
      <p className="text-base leading-[1.6] break-words whitespace-pre-line text-ink">{review.content}</p>
      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Ảnh khách gửi">
          {photos.map((src, i) => (
            <li key={src}>
              <a href={src} target="_blank" rel="noopener noreferrer" className="relative block size-20 overflow-hidden rounded-[var(--radius-sm)] bg-surface-alt">
                <Image src={src} alt={`Ảnh ${i + 1} của ${review.authorName}`} fill sizes="80px" className="object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {review.adminReply && (
        <div className="rounded-card bg-surface-alt px-3 py-2 text-sm">
          <b className="text-brand-deep">Phản hồi của shop</b>
          <p className="mt-1 break-words whitespace-pre-line text-ink">{review.adminReply}</p>
        </div>
      )}
    </li>
  );
}
