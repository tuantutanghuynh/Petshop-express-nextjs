'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { CAMPAIGNS_PAGE_SIZE, CAMPAIGN_TABS, campaignsAdminHref, campaignsApiPath, parseCampaignsQuery, type CampaignTab } from '../../../lib/adminNewsletter';
import type { CampaignSummary, PageMeta } from '../../../lib/types';
import { Pagination } from '../../ui/Pagination';
import { AdminTabs } from '../AdminTabs';
import { CampaignCard } from './CampaignCard';

type Page = { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: CampaignSummary[]; total: number };
type Loaded = { key: string; page: Page };

async function loadList(key: string): Promise<Loaded> {
  try {
    const res = await authFetch<CampaignSummary[]>(campaignsApiPath(parseCampaignsQuery(new URLSearchParams(key))));
    if (res.error || !res.data) return { key, page: { state: 'error' } };
    return { key, page: { state: 'ready', rows: res.data, total: (res.meta as PageMeta | null)?.total ?? res.data.length } };
  } catch {
    return { key, page: { state: 'error' } };
  }
}

// /admin/ban-tin (spec 2026-11-10): every campaign with its status and send counts, 20 a page, status
// tabs in the URL like the other admin lists. Only drafts can be deleted.
export function CampaignsManager() {
  const router = useRouter();
  const key = useSearchParams().toString();
  const query = parseCampaignsQuery(new URLSearchParams(key));
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

  async function onDelete(c: CampaignSummary) {
    if (!window.confirm(`Xoá bản nháp «${c.subject}»? Không hoàn tác được.`)) return;
    setBusy(true);
    const res = await authFetch(`/newsletter/campaigns/${c.id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.error) return setNotice({ ok: false, text: res.error.message || 'Chưa xoá được bản tin.' });
    setNotice({ ok: true, text: `Đã xoá «${c.subject}».` });
    setList(await loadList(key));
  }

  const page: Page = list && list.key === key ? list.page : { state: 'loading' };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl leading-[1.3] font-extrabold">Bản tin</h1>
        <Link href="/admin/ban-tin/moi" className="inline-flex min-h-11 items-center rounded-full bg-brand-ink px-5 font-bold text-white hover:bg-brand-deep">+ Soạn bản tin</Link>
      </div>
      <p className="text-sm text-muted">
        Gửi tới người đã xác nhận đăng ký nhận tin (<Link href="/admin/dang-ky-nhan-tin" className="font-bold text-brand-ink underline">xem danh sách</Link>). Mỗi email có link huỷ riêng.
      </p>
      <AdminTabs label="Lọc theo trạng thái" tabs={CAMPAIGN_TABS.map((t) => ({ key: t.key, label: t.label }))} current={query.tab}
        onSelect={(tab) => router.push(campaignsAdminHref({ tab: tab as CampaignTab, page: 1 }), { scroll: false })} />
      {notice && <p role="status" className={notice.ok ? 'text-sm font-bold text-brand-ink' : 'rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink'}>{notice.text}</p>}
      {page.state === 'loading' && <div aria-busy="true" aria-label="Đang tải bản tin" className="h-48 animate-pulse rounded-card bg-line" />}
      {page.state === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink">
          Chưa tải được danh sách bản tin.
          <button type="button" onClick={() => loadList(key).then(setList)} className="min-h-11 rounded-full border border-pink-ink px-4 font-bold">Thử lại</button>
        </div>
      )}
      {page.state === 'ready' &&
        (page.rows.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-4 text-muted">
            {query.tab !== 'all' ? 'Không có bản tin nào ở trạng thái này.' : <>Chưa có bản tin nào. <Link href="/admin/ban-tin/moi" className="font-bold text-brand-ink underline">Soạn bản tin đầu tiên</Link></>}
          </p>
        ) : (
          <div className="flex flex-col gap-3">{page.rows.map((c) => <CampaignCard key={c.id} campaign={c} busy={busy} onDelete={(x) => void onDelete(x)} />)}</div>
        ))}
      <Pagination page={query.page} totalPages={Math.ceil((page.state === 'ready' ? page.total : 0) / CAMPAIGNS_PAGE_SIZE)} hrefFor={(p) => campaignsAdminHref({ ...query, page: p })} />
    </div>
  );
}
