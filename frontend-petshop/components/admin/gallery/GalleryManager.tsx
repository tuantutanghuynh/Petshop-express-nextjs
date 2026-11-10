'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { GALLERY_PAGE_SIZE, galleryAdminHref, galleryApiPath, parseGalleryPage } from '../../../lib/adminGallery';
import { revalidateStorefront } from '../../../lib/adminRevalidate';
import type { GalleryItem, PageMeta } from '../../../lib/types';
import { Pagination } from '../../ui/Pagination';
import { GalleryCard } from './GalleryCard';

type Page = { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: GalleryItem[]; total: number };
type Loaded = { page: number; result: Page };

async function loadPage(page: number): Promise<Loaded> {
  try {
    const res = await authFetch<GalleryItem[]>(galleryApiPath(page));
    if (res.error || !res.data) return { page, result: { state: 'error' } };
    return { page, result: { state: 'ready', rows: res.data, total: (res.meta as PageMeta | null)?.total ?? res.data.length } };
  } catch {
    return { page, result: { state: 'error' } };
  }
}

// /admin/gallery (spec 2026-11-10): every photo, 24 a page, edit and delete. The photos are not
// brand-scoped. After a delete the public /gallery cache is refreshed so the photo goes at once.
export function GalleryManager() {
  const page = parseGalleryPage(useSearchParams());
  const [list, setList] = useState<Loaded | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    loadPage(page).then((next) => active && setList(next));
    return () => {
      active = false;
    };
  }, [page]);

  async function onDelete(item: GalleryItem) {
    if (!window.confirm(`Xoá ảnh «${item.title || item.altText}»? Không hoàn tác được.`)) return;
    setBusy(true);
    const res = await authFetch(`/gallery/${item.id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.error) return setNotice({ ok: false, text: res.error.message || 'Chưa xoá được ảnh.' });
    setNotice({ ok: true, text: 'Đã xoá ảnh.' });
    await revalidateStorefront(['gallery']);
    setList(await loadPage(page));
  }

  const result: Page = list && list.page === page ? list.result : { state: 'loading' };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl leading-[1.3] font-extrabold">Thư viện ảnh</h1>
        <Link href="/admin/gallery/moi" className="inline-flex min-h-11 items-center rounded-full bg-brand-ink px-5 font-bold text-white hover:bg-brand-deep">+ Thêm ảnh</Link>
      </div>
      {notice && <p role="status" className={notice.ok ? 'text-sm font-bold text-brand-ink' : 'rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink'}>{notice.text}</p>}
      {result.state === 'loading' && (
        <div aria-busy="true" aria-label="Đang tải ảnh" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="aspect-square animate-pulse rounded-card bg-line" />)}
        </div>
      )}
      {result.state === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink">
          Chưa tải được thư viện ảnh.
          <button type="button" onClick={() => loadPage(page).then(setList)} className="min-h-11 rounded-full border border-pink-ink px-4 font-bold">Thử lại</button>
        </div>
      )}
      {result.state === 'ready' &&
        (result.rows.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-4 text-muted">
            Chưa có ảnh nào. <Link href="/admin/gallery/moi" className="font-bold text-brand-ink underline">Thêm ảnh đầu tiên</Link>
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {result.rows.map((item) => <GalleryCard key={item.id} item={item} busy={busy} onDelete={(x) => void onDelete(x)} />)}
          </div>
        ))}
      <Pagination page={page} totalPages={Math.ceil((result.state === 'ready' ? result.total : 0) / GALLERY_PAGE_SIZE)} hrefFor={galleryAdminHref} />
    </div>
  );
}
