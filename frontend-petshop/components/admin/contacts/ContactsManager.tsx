'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CONTACT_TABS, CONTACTS_PAGE_SIZE, contactsApiPath, contactsHref, parseContactsQuery, type ContactTab } from '../../../lib/adminContacts';
import { authFetch } from '../../../lib/adminAuth';
import { ADMIN_BRAND_HEADERS } from '../../../lib/adminOrders';
import type { AdminContactMessage, PageMeta } from '../../../lib/types';
import { Pagination } from '../../ui/Pagination';
import { AdminTabs } from '../AdminTabs';
import { ContactCard } from './ContactCard';

type Page = { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: AdminContactMessage[]; total: number };
type Loaded = { key: string; page: Page; unread: number | null };

const api = <T,>(path: string, init: RequestInit = {}) => authFetch<T>(path, { ...init, headers: ADMIN_BRAND_HEADERS });

async function loadList(key: string): Promise<Loaded> {
  const q = parseContactsQuery(new URLSearchParams(key));
  const [list, count] = await Promise.all([api<AdminContactMessage[]>(contactsApiPath(q)), api<AdminContactMessage[]>('/contact/admin/list?isRead=false&pageSize=1')]);
  const page: Page = list.error || !list.data ? { state: 'error' } : { state: 'ready', rows: list.data, total: (list.meta as PageMeta | null)?.total ?? list.data.length };
  return { key, page, unread: count.error ? null : ((count.meta as PageMeta | null)?.total ?? null) };
}

// /admin/lien-he (wireframe admin-contacts.html): messages of the tab in the URL, unread first by
// default, with reply / call / mark read / delete.
export function ContactsManager() {
  const router = useRouter();
  const key = useSearchParams().toString();
  const query = parseContactsQuery(new URLSearchParams(key));
  const [list, setList] = useState<Loaded | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let active = true;
    loadList(key).then((next) => active && setList(next));
    return () => {
      active = false;
    };
  }, [key]);

  async function act(m: AdminContactMessage, kind: 'read' | 'delete') {
    if (kind === 'delete' && !window.confirm(`Xoá tin nhắn của ${m.name}? Không hoàn tác được.`)) return;
    setBusy(true);
    const res = await api(kind === 'read' ? `/contact/admin/${m.id}/read` : `/contact/admin/${m.id}`, { method: kind === 'read' ? 'PATCH' : 'DELETE' });
    setBusy(false);
    if (res.error) return setNotice({ ok: false, text: res.error.message || 'Không cập nhật được tin nhắn.' });
    setNotice({ ok: true, text: kind === 'read' ? `Đã đánh dấu đã đọc tin của ${m.name}.` : `Đã xoá tin nhắn của ${m.name}.` });
    setNow(new Date());
    setList(await loadList(key));
  }

  const current = list && list.key === key ? list : null;
  const page: Page = current?.page ?? { state: 'loading' };
  const tabs = CONTACT_TABS.map((t) => ({ key: t.key, label: t.key === 'unread' && current?.unread != null ? `${t.label} (${current.unread})` : t.label }));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl leading-[1.3] font-extrabold">Tin nhắn liên hệ</h1>
      <AdminTabs label="Lọc tin nhắn" tabs={tabs} current={query.tab} onSelect={(tab) => router.push(contactsHref({ tab: tab as ContactTab, page: 1 }), { scroll: false })} />
      {notice && <p role="status" className={notice.ok ? 'text-sm font-bold text-brand-ink' : 'rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink'}>{notice.text}</p>}
      {page.state === 'loading' && <div aria-busy="true" aria-label="Đang tải tin nhắn" className="h-48 animate-pulse rounded-card bg-surface" />}
      {page.state === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink">
          Chưa tải được tin nhắn.
          <button type="button" onClick={() => loadList(key).then(setList)} className="min-h-11 rounded-full border border-pink-ink px-4 font-bold">Thử lại</button>
        </div>
      )}
      {page.state === 'ready' &&
        (page.rows.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-4 text-muted">{query.tab === 'unread' ? 'Không có tin nhắn chưa đọc.' : 'Không có tin nhắn nào.'}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {page.rows.map((m) => <ContactCard key={m.id} message={m} now={now} busy={busy} onRead={(x) => void act(x, 'read')} onDelete={(x) => void act(x, 'delete')} />)}
          </div>
        ))}
      <Pagination page={query.page} totalPages={Math.ceil((page.state === 'ready' ? page.total : 0) / CONTACTS_PAGE_SIZE)} hrefFor={(p) => contactsHref({ ...query, page: p })} />
    </div>
  );
}
