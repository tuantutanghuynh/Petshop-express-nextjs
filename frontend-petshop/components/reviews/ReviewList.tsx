'use client';

import { useState } from 'react';
import { apiFetch } from '../../lib/apiClient';
import { REVIEWS_PAGE_SIZE, REVIEW_SORT_LABELS, reviewsApiPath, type ReviewSortKey, type ReviewsQuery } from '../../lib/reviews';
import type { PageMeta, PublicReview } from '../../lib/types';
import { ReviewItem } from './ReviewItem';

type Props = { slug: string; initial: PublicReview[]; initialTotal: number; withImages: number };
type State = { rows: PublicReview[]; total: number; page: number; status: 'idle' | 'loading' | 'error' };

const CHIP = 'min-h-11 shrink-0 rounded-full px-4 text-sm font-bold whitespace-nowrap';

// The first page comes with the server HTML (crawlers and no-JS visitors read it); filters, sorting
// and "Xem thêm" fetch from the public API in the browser. Filter state is not in the URL: these
// views are not pages of their own and must not be indexed.
export function ReviewList({ slug, initial, initialTotal, withImages }: Props) {
  const [query, setQuery] = useState<ReviewsQuery>({});
  const [state, setState] = useState<State>({ rows: initial, total: initialTotal, page: 1, status: 'idle' });

  async function load(next: ReviewsQuery, append: boolean) {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const res = await apiFetch<PublicReview[], PageMeta>(reviewsApiPath(slug, next), { cache: 'no-store' });
      setState((s) => ({ rows: append ? [...s.rows, ...res.data] : res.data, total: res.meta?.total ?? res.data.length, page: next.page ?? 1, status: 'idle' }));
    } catch {
      setState((s) => ({ ...s, status: 'error' }));
    }
  }
  const apply = (patch: ReviewsQuery) => {
    const next = { ...query, ...patch, page: 1 };
    setQuery(next);
    void load(next, false);
  };
  const ratingChip = (r: number | undefined, label: string) => (
    <button key={label} type="button" aria-pressed={query.rating === r && !query.hasImages} onClick={() => apply({ rating: r, hasImages: false })}
      className={`${CHIP} ${query.rating === r && !query.hasImages ? 'bg-brand-ink text-white' : 'border border-line bg-surface text-ink'}`}>{label}</button>
  );
  const more = state.rows.length < state.total;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div role="group" aria-label="Lọc đánh giá" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          {ratingChip(undefined, 'Tất cả')}
          {[5, 4, 3, 2, 1].map((r) => ratingChip(r, `${r} sao`))}
          {withImages > 0 && (
            <button type="button" aria-pressed={!!query.hasImages} onClick={() => apply({ hasImages: true, rating: undefined })}
              className={`${CHIP} ${query.hasImages ? 'bg-brand-ink text-white' : 'border border-line bg-surface text-ink'}`}>Có ảnh ({withImages})</button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          Sắp xếp
          <select value={query.sort ?? 'newest'} onChange={(e) => apply({ sort: e.target.value as ReviewSortKey })}
            className="min-h-11 rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-base text-ink">
            {(Object.keys(REVIEW_SORT_LABELS) as ReviewSortKey[]).map((k) => <option key={k} value={k}>{REVIEW_SORT_LABELS[k]}</option>)}
          </select>
        </label>
      </div>
      <div aria-live="polite" aria-busy={state.status === 'loading'} className={state.status === 'loading' ? 'opacity-60' : ''}>
        {state.rows.length === 0 ? (
          <p className="py-4 text-sm text-muted">{state.status === 'loading' ? 'Đang tải…' : 'Chưa có đánh giá nào khớp bộ lọc.'}</p>
        ) : (
          <ul>{state.rows.map((r) => <ReviewItem key={r.id} review={r} />)}</ul>
        )}
      </div>
      {state.status === 'error' && <p role="alert" className="text-sm text-pink-ink">Chưa tải được đánh giá. Thử lại.</p>}
      {more && (
        <button type="button" disabled={state.status === 'loading'} onClick={() => void load({ ...query, page: state.page + 1 }, true)}
          className="min-h-11 self-center rounded-full border border-brand-ink px-6 text-sm font-bold text-brand-ink disabled:opacity-60">
          Xem thêm {Math.min(REVIEWS_PAGE_SIZE, state.total - state.rows.length)} đánh giá
        </button>
      )}
    </div>
  );
}
