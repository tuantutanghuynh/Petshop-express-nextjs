'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { ADMIN_BADGES_CHANGED } from '../../../lib/adminNav';
import { REVIEWS_ADMIN_PAGE_SIZE, REVIEW_TABS, parseReviewsQuery, reviewsAdminApiPath, reviewsAdminHref, type ReviewTab } from '../../../lib/adminReviews';
import { revalidateStorefront } from '../../../lib/adminRevalidate';
import type { AdminReview, PageMeta } from '../../../lib/types';
import { Pagination } from '../../ui/Pagination';
import { AdminTabs } from '../AdminTabs';
import { ReviewModerationCard } from './ReviewModerationCard';

type Page = { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: AdminReview[]; total: number };
type Loaded = { key: string; page: Page };

async function loadList(key: string): Promise<Loaded> {
  try {
    const res = await authFetch<AdminReview[]>(reviewsAdminApiPath(parseReviewsQuery(new URLSearchParams(key))));
    if (res.error || !res.data) return { key, page: { state: 'error' } };
    return { key, page: { state: 'ready', rows: res.data, total: (res.meta as PageMeta | null)?.total ?? res.data.length } };
  } catch {
    return { key, page: { state: 'error' } };
  }
}

// Storefront pages showing reviews (product page list, stars on cards) refresh after each change.
const refresh = () => revalidateStorefront(['reviews', 'products']);

// /admin/danh-gia (ADR-027): the queue first, oldest first. Approve or hide, and reply publicly.
export function ReviewsManager() {
  const router = useRouter();
  const key = useSearchParams().toString();
  const query = parseReviewsQuery(new URLSearchParams(key));
  const [list, setList] = useState<Loaded | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    loadList(key).then((next) => active && setList(next));
    return () => {
      active = false;
    };
  }, [key]);

  async function onMove(r: AdminReview, action: 'approve' | 'hide') {
    setBusy(true);
    const res = await authFetch<AdminReview>(`/reviews/admin/${r.id}/${action}`, { method: 'POST', body: '{}' });
    setBusy(false);
    if (res.error) {
      setNotice({ ok: false, text: res.error.message || 'Chưa thực hiện được.' });
    } else {
      setNotice({ ok: true, text: action === 'approve' ? 'Đã duyệt, đánh giá đang hiện trên web.' : 'Đã ẩn đánh giá.' });
      window.dispatchEvent(new Event(ADMIN_BADGES_CHANGED)); // the menu count drops at once
      await refresh();
    }
    setList(await loadList(key));
  }

  async function onReply(r: AdminReview, text: string): Promise<string | null> {
    const res = await authFetch<AdminReview>(`/reviews/admin/${r.id}/reply`, { method: 'PATCH', body: JSON.stringify({ reply: text.trim() || null }) });
    if (res.error) return res.error.message || 'Chưa lưu được phản hồi.';
    setNotice({ ok: true, text: text.trim() ? 'Đã lưu phản hồi.' : 'Đã xoá phản hồi.' });
    if (r.status === 'APPROVED') await refresh();
    setList(await loadList(key));
    return null;
  }

  const page: Page = list && list.key === key ? list.page : { state: 'loading' };
  const go = (patch: Partial<typeof query>) => router.push(reviewsAdminHref({ ...query, ...patch, page: 1 }), { scroll: false });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl leading-[1.3] font-extrabold">Đánh giá sản phẩm</h1>
      <p className="rounded-card bg-surface-alt px-4 py-3 text-sm text-ink">
        Chỉ ẩn khi <b>nội dung vi phạm</b> (spam, chửi bới, số điện thoại / địa chỉ, quảng cáo nơi khác). <b>Không ẩn vì khách chê</b>: điểm sao phải trung thực, và phản hồi lịch sự giúp khách khác tin shop hơn.
      </p>
      <AdminTabs label="Lọc theo trạng thái" tabs={REVIEW_TABS.map((t) => ({ key: t.key, label: t.label }))} current={query.tab} onSelect={(tab) => go({ tab: tab as ReviewTab })} />
      <label className="flex items-center gap-2 self-start text-sm text-muted">
        Số sao
        <select value={query.rating ?? ''} onChange={(e) => go({ rating: e.target.value ? Number(e.target.value) : null })}
          className="min-h-11 rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-base text-ink">
          <option value="">Tất cả</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} sao</option>)}
        </select>
      </label>
      {notice && <p role="status" className={notice.ok ? 'text-sm font-bold text-brand-ink' : 'rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink'}>{notice.text}</p>}
      {page.state === 'loading' && <div aria-busy="true" aria-label="Đang tải đánh giá" className="h-48 animate-pulse rounded-card bg-line" />}
      {page.state === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink">
          Chưa tải được danh sách đánh giá.
          <button type="button" onClick={() => loadList(key).then(setList)} className="min-h-11 rounded-full border border-pink-ink px-4 font-bold">Thử lại</button>
        </div>
      )}
      {page.state === 'ready' &&
        (page.rows.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-4 text-muted">{query.tab === 'PENDING' ? 'Không có đánh giá nào chờ duyệt.' : 'Không có đánh giá nào khớp.'}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {page.rows.map((r) => <ReviewModerationCard key={`${r.id}:${r.updatedAt}:${r.adminReplyAt ?? ''}`} review={r} busy={busy} onMove={(x, a) => void onMove(x, a)} onReply={onReply} />)}
          </div>
        ))}
      <Pagination page={query.page} totalPages={Math.ceil((page.state === 'ready' ? page.total : 0) / REVIEWS_ADMIN_PAGE_SIZE)} hrefFor={(p) => reviewsAdminHref({ ...query, page: p })} />
    </div>
  );
}
