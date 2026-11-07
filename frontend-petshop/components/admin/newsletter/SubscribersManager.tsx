'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { NEWSLETTER_PAGE_SIZE, NEWSLETTER_TABS, newsletterApiPath, newsletterHref, parseNewsletterQuery, type NewsletterTab } from '../../../lib/newsletter';
import type { NewsletterSubscriber, PageMeta } from '../../../lib/types';
import { Pagination } from '../../ui/Pagination';
import { AdminTabs } from '../AdminTabs';
import { SubscriberCard } from './SubscriberCard';

type Page = { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: NewsletterSubscriber[]; total: number };
type Loaded = { key: string; page: Page };

async function loadList(key: string): Promise<Loaded> {
  const res = await authFetch<NewsletterSubscriber[]>(newsletterApiPath(parseNewsletterQuery(new URLSearchParams(key))));
  const page: Page = res.error || !res.data ? { state: 'error' } : { state: 'ready', rows: res.data, total: (res.meta as PageMeta | null)?.total ?? res.data.length };
  return { key, page };
}

// /admin/dang-ky-nhan-tin (spec 2026-11-07): subscribers by status, email search, CSV export of the
// confirmed ones for the sending service, delete on a customer's request. Newsletter is not
// brand-scoped, so no X-Brand-Slug.
export function SubscribersManager() {
  const router = useRouter();
  const key = useSearchParams().toString();
  const query = parseNewsletterQuery(new URLSearchParams(key));
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

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
    router.push(newsletterHref({ ...query, q, page: 1 }), { scroll: false });
  }

  async function onExport() {
    setBusy(true);
    const res = await authFetch<{ filename: string; csv: string }>('/newsletter/subscribers/export');
    setBusy(false);
    if (res.error || !res.data) return setNotice({ ok: false, text: res.error?.message || 'Chưa xuất được danh sách.' });
    const url = URL.createObjectURL(new Blob([res.data.csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = res.data.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onDelete(s: NewsletterSubscriber) {
    if (!window.confirm(`Xoá ${s.email} khỏi danh sách nhận tin? Không hoàn tác được.`)) return;
    setBusy(true);
    const res = await authFetch(`/newsletter/subscribers/${s.id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.error) return setNotice({ ok: false, text: res.error.message || 'Chưa xoá được.' });
    setNotice({ ok: true, text: `Đã xoá ${s.email}.` });
    setList(await loadList(key));
  }

  const page: Page = list && list.key === key ? list.page : { state: 'loading' };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl leading-[1.3] font-extrabold">Đăng ký nhận tin</h1>
        <button type="button" disabled={busy} onClick={() => void onExport()} className="inline-flex min-h-11 items-center rounded-full bg-brand-ink px-5 font-bold text-white disabled:opacity-60">Xuất CSV (đã xác nhận)</button>
      </div>
      <AdminTabs label="Lọc theo trạng thái" tabs={NEWSLETTER_TABS.map((t) => ({ key: t.key, label: t.label }))} current={query.tab} onSelect={(tab) => router.push(newsletterHref({ ...query, tab: tab as NewsletterTab, page: 1 }), { scroll: false })} />
      <form onSubmit={onSearch} role="search" className="flex flex-col gap-2 md:flex-row">
        <label htmlFor="f-q" className="sr-only">Tìm email</label>
        <input id="f-q" key={query.q} name="q" type="search" defaultValue={query.q} placeholder="Tìm email (từ 2 ký tự)" enterKeyHint="search" className="min-h-11 w-full rounded-full border border-line bg-surface px-4 text-base md:w-80" />
        <button type="submit" className="min-h-11 rounded-full border border-brand-ink px-5 font-bold text-brand-ink">Tìm</button>
      </form>
      {notice && <p role="status" className={notice.ok ? 'text-sm font-bold text-brand-ink' : 'rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink'}>{notice.text}</p>}
      {page.state === 'loading' && <div aria-busy="true" aria-label="Đang tải danh sách" className="h-48 animate-pulse rounded-card bg-surface" />}
      {page.state === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink">
          Chưa tải được danh sách.
          <button type="button" onClick={() => loadList(key).then(setList)} className="min-h-11 rounded-full border border-pink-ink px-4 font-bold">Thử lại</button>
        </div>
      )}
      {page.state === 'ready' &&
        (page.rows.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-4 text-muted">{query.q ? 'Không có email nào khớp.' : 'Chưa có ai trong mục này. Khách đăng ký ở khối cuối trang.'}</p>
        ) : (
          <div className="flex flex-col gap-3">{page.rows.map((s) => <SubscriberCard key={s.id} s={s} busy={busy} onDelete={(x) => void onDelete(x)} />)}</div>
        ))}
      <Pagination page={query.page} totalPages={Math.ceil((page.state === 'ready' ? page.total : 0) / NEWSLETTER_PAGE_SIZE)} hrefFor={(p) => newsletterHref({ ...query, page: p })} />
    </div>
  );
}
