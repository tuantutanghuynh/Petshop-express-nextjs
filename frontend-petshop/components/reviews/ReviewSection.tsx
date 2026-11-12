import { distributionRows, formatRating } from '../../lib/reviews';
import type { PublicReview, ReviewSummary } from '../../lib/types';
import { ReviewList } from './ReviewList';
import { Stars } from './Stars';
import { WriteReview } from './WriteReview';

type Props = { productId: string; slug: string; items: PublicReview[]; total: number; summary: ReviewSummary };

// "Đánh giá sản phẩm" (ADR-027): only approved reviews of real buyers. The summary and the first page
// are in the server HTML; writing and filtering happen in the browser. With no review yet the
// section still invites buyers to write the first one, and shows no stars.
export function ReviewSection({ productId, slug, items, total, summary }: Props) {
  const rows = distributionRows(summary.distribution, summary.count);
  return (
    <section id="danh-gia" aria-labelledby="reviews-title" className="mt-12 scroll-mt-24">
      <h2 id="reviews-title" className="mb-4 text-xl leading-[1.3] font-extrabold">Đánh giá sản phẩm</h2>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-10">
        <div className="flex flex-col gap-4">
          {summary.count > 0 ? (
            <>
              <div>
                <p className="text-4xl leading-[1.2] font-extrabold tabular-nums">{formatRating(summary.average)}<span className="text-base font-normal text-muted">/5</span></p>
                <Stars value={summary.average} className="text-xl" />
                <p className="mt-1 text-sm text-muted">{summary.count} đánh giá từ khách đã mua</p>
              </div>
              <ul className="flex flex-col gap-1.5" aria-label="Phân bố số sao">
                {rows.map((r) => (
                  <li key={r.stars} className="flex items-center gap-2 text-sm tabular-nums">
                    <span className="w-10 shrink-0">{r.stars} ★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true"><span className="block h-full rounded-full bg-yellow" style={{ width: `${r.percent}%` }} /></span>
                    <span className="w-10 shrink-0 text-right text-muted">{r.percent}%</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">Chưa có đánh giá. Nếu bạn đã mua, hãy là người đầu tiên chia sẻ cảm nhận.</p>
          )}
          <WriteReview productId={productId} />
        </div>
        {summary.count > 0 && <ReviewList slug={slug} initial={items} initialTotal={total} withImages={summary.withImages} />}
      </div>
    </section>
  );
}
