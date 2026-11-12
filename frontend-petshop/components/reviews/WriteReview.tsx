'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { bffFetch } from '../../lib/bffClient';
import type { OwnReview } from '../../lib/types';
import { ReviewForm } from './ReviewForm';

type Eligibility = { canReview: boolean; review: OwnReview | null };
type State = { state: 'loading' } | { state: 'signedOut' } | { state: 'error' } | { state: 'ready'; data: Eligibility };

const STATUS_NOTE: Record<OwnReview['status'], string> = {
  PENDING: 'Đánh giá của bạn đang chờ shop duyệt.',
  APPROVED: 'Đánh giá của bạn đang hiển thị.',
  HIDDEN: 'Đánh giá của bạn đang bị ẩn vì nội dung chưa phù hợp. Bạn có thể sửa và gửi lại.',
};

// The "write / edit a review" area of the product page. Asked in the browser (it depends on who is
// signed in), so the cached product page stays the same for everyone.
export function WriteReview({ productId }: { productId: string }) {
  const pathname = usePathname();
  const [state, setState] = useState<State>({ state: 'loading' });
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    bffFetch<Eligibility | null>(`/api/reviews/eligibility?productId=${productId}`).then((res) => {
      if (!active) return;
      if (!res.ok) return setState(res.status === 401 ? { state: 'signedOut' } : { state: 'error' });
      setState(res.data ? { state: 'ready', data: res.data } : { state: 'signedOut' });
    });
    return () => {
      active = false;
    };
  }, [productId]);

  if (state.state === 'loading') return <div aria-busy="true" aria-label="Đang kiểm tra" className="h-11 w-48 animate-pulse rounded-full bg-line" />;
  if (state.state === 'error') return null;
  if (state.state === 'signedOut') {
    return (
      <p className="text-sm text-muted">
        <Link href={`/dang-nhap?next=${encodeURIComponent(`${pathname}#danh-gia`)}`} className="inline-flex min-h-11 items-center font-bold text-brand-ink underline">Đăng nhập</Link> để đánh giá sản phẩm bạn đã mua.
      </p>
    );
  }
  const { canReview, review } = state.data;
  if (saved) return <p role="status" className="rounded-card bg-mint px-4 py-3 text-sm font-bold text-brand-deep">Cảm ơn bạn! Đánh giá sẽ hiện sau khi shop duyệt.</p>;
  if (!canReview && !review) return <p className="text-sm text-muted">Chỉ khách đã mua và nhận hàng mới đánh giá được sản phẩm này.</p>;

  return (
    <div className="flex flex-col gap-3">
      {review && <p className="text-sm text-ink">{STATUS_NOTE[review.status]}</p>}
      {open ? (
        <ReviewForm productId={productId} existing={review} onSaved={(r) => { setState({ state: 'ready', data: { canReview, review: r } }); setOpen(false); setSaved(true); }} />
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="min-h-11 w-full rounded-full bg-brand-ink px-6 font-bold text-white md:w-auto md:self-start">
          {review ? 'Sửa đánh giá' : 'Viết đánh giá'}
        </button>
      )}
    </div>
  );
}
