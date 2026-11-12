'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useId, useState } from 'react';
import { REPLY_MAX, REVIEW_STATUS_LABELS, validateReply } from '../../../lib/adminReviews';
import { formatDate } from '../../../lib/blog';
import { productPath } from '../../../lib/seo/structuredData';
import { imageSrc } from '../../../lib/storefront';
import type { AdminReview } from '../../../lib/types';
import { Stars } from '../../reviews/Stars';

type Props = {
  review: AdminReview;
  busy: boolean;
  onMove: (r: AdminReview, action: 'approve' | 'hide') => void;
  onReply: (r: AdminReview, text: string) => Promise<string | null>;
};

const STATUS_STYLE = { PENDING: 'bg-yellow-hero/40 text-ink', APPROVED: 'bg-mint text-brand-ink', HIDDEN: 'bg-pink-bg text-pink-ink' } as const;
const ACTION = 'inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold disabled:opacity-60';

// One review to moderate: what the customer wrote and sent, who and which product, Duyệt / Ẩn, and
// the public reply. The email is for the admin only (never shown on the storefront).
export function ReviewModerationCard({ review, busy, onMove, onReply }: Props) {
  const uid = useId();
  const [reply, setReply] = useState(review.adminReply ?? '');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const photos = review.images.map((u) => imageSrc(u)).filter((u): u is string => u !== null);

  async function saveReply() {
    const invalid = validateReply(reply);
    if (invalid) return setReplyError(invalid);
    setSaving(true);
    setReplyError(await onReply(review, reply));
    setSaving(false);
  }

  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Stars value={review.rating} className="text-sm" />
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[review.status]}`}>{REVIEW_STATUS_LABELS[review.status]}</span>
        <span className="text-muted">{formatDate(review.createdAt)}{review.updatedAt !== review.createdAt && ' · đã sửa'}</span>
      </div>
      <p className="text-sm text-muted">
        <Link href={productPath(review.product.slug)} target="_blank" className="font-bold text-brand-ink underline">{review.product.name} ↗</Link>
        {' · '}{review.user.fullName?.trim() || 'Chưa có tên'} <span className="break-all">({review.user.email})</span>
      </p>
      <p className="text-base leading-[1.6] break-words whitespace-pre-line text-ink">{review.content}</p>
      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {photos.map((src, i) => (
            <li key={src}>
              <a href={src} target="_blank" rel="noopener noreferrer" className="relative block size-24 overflow-hidden rounded-[var(--radius-sm)] bg-surface-alt">
                <Image src={src} alt={`Ảnh ${i + 1} khách gửi`} fill sizes="96px" className="object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {review.status !== 'APPROVED' && (
          <button type="button" disabled={busy} onClick={() => onMove(review, 'approve')} className={`${ACTION} bg-brand-ink text-white`}>Duyệt</button>
        )}
        {review.status !== 'HIDDEN' && (
          <button type="button" disabled={busy} onClick={() => onMove(review, 'hide')} className={`${ACTION} border border-pink-ink text-pink-ink`}>Ẩn</button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-reply`} className="text-sm font-bold text-ink">Phản hồi công khai của shop</label>
        <textarea id={`${uid}-reply`} rows={2} value={reply} maxLength={REPLY_MAX} onChange={(e) => { setReply(e.target.value); setReplyError(null); }}
          placeholder="Cảm ơn bạn đã tin tưởng shop…" aria-invalid={replyError ? true : undefined} aria-describedby={replyError ? `${uid}-reply-error` : undefined}
          className={`w-full rounded-[var(--radius-sm)] border bg-surface p-2 text-base text-ink ${replyError ? 'border-pink-ink' : 'border-line'}`} />
        {replyError && <p id={`${uid}-reply-error`} className="text-sm text-pink-ink">{replyError}</p>}
        <button type="button" disabled={saving || reply === (review.adminReply ?? '')} onClick={() => void saveReply()}
          className={`${ACTION} self-start border border-brand-ink text-brand-ink`}>{saving ? 'Đang lưu…' : reply.trim() ? 'Lưu phản hồi' : 'Xoá phản hồi'}</button>
      </div>
    </article>
  );
}
