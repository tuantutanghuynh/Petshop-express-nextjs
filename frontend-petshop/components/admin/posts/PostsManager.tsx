'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { POSTS_PAGE_SIZE, POST_TABS, parsePostsQuery, postsAdminHref, postsApiPath, type PostTab } from '../../../lib/adminPosts';
import { revalidateStorefront } from '../../../lib/adminRevalidate';
import type { BlogPost, PageMeta } from '../../../lib/types';
import { Pagination } from '../../ui/Pagination';
import { AdminTabs } from '../AdminTabs';
import { PostCard } from './PostCard';

type Page = { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: BlogPost[]; total: number };
type Loaded = { key: string; page: Page };

async function loadList(key: string): Promise<Loaded> {
  try {
    const res = await authFetch<BlogPost[]>(postsApiPath(parsePostsQuery(new URLSearchParams(key))));
    if (res.error || !res.data) return { key, page: { state: 'error' } };
    return { key, page: { state: 'ready', rows: res.data, total: (res.meta as PageMeta | null)?.total ?? res.data.length } };
  } catch {
    return { key, page: { state: 'error' } };
  }
}

// /admin/posts (spec 2026-11-10): every post with its state (draft / published / scheduled), title
// search, 20 a page, edit and delete. List state lives in the URL, as on the other admin lists.
export function PostsManager() {
  const router = useRouter();
  const key = useSearchParams().toString();
  const query = parsePostsQuery(new URLSearchParams(key));
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
    router.push(postsAdminHref({ ...query, q, page: 1 }), { scroll: false });
  }

  async function onDelete(post: BlogPost) {
    if (!window.confirm(`Xoá bài «${post.title}»? Không hoàn tác được.`)) return;
    setBusy(true);
    const res = await authFetch(`/blog/${post.id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.error) return setNotice({ ok: false, text: res.error.message || 'Chưa xoá được bài viết.' });
    setNotice({ ok: true, text: `Đã xoá «${post.title}».` });
    await revalidateStorefront(['blog']);
    setList(await loadList(key));
  }

  const page: Page = list && list.key === key ? list.page : { state: 'loading' };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl leading-[1.3] font-extrabold">Bài viết</h1>
        <Link href="/admin/posts/moi" className="inline-flex min-h-11 items-center rounded-full bg-brand-ink px-5 font-bold text-white hover:bg-brand-deep">+ Viết bài mới</Link>
      </div>
      <AdminTabs label="Lọc theo trạng thái" tabs={POST_TABS.map((t) => ({ key: t.key, label: t.label }))} current={query.tab}
        onSelect={(tab) => router.push(postsAdminHref({ ...query, tab: tab as PostTab, page: 1 }), { scroll: false })} />
      <form onSubmit={onSearch} role="search" className="flex flex-col gap-2 md:flex-row">
        <label htmlFor="f-q" className="sr-only">Tìm theo tiêu đề</label>
        <input id="f-q" key={query.q} name="q" type="search" defaultValue={query.q} placeholder="Tìm theo tiêu đề (từ 2 ký tự)" enterKeyHint="search"
          className="min-h-11 w-full rounded-full border border-line bg-surface px-4 text-base md:w-80" />
        <button type="submit" className="min-h-11 rounded-full border border-brand-ink px-5 font-bold text-brand-ink">Tìm</button>
      </form>
      {notice && <p role="status" className={notice.ok ? 'text-sm font-bold text-brand-ink' : 'rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink'}>{notice.text}</p>}
      {page.state === 'loading' && <div aria-busy="true" aria-label="Đang tải bài viết" className="h-48 animate-pulse rounded-card bg-line" />}
      {page.state === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink">
          Chưa tải được danh sách bài viết.
          <button type="button" onClick={() => loadList(key).then(setList)} className="min-h-11 rounded-full border border-pink-ink px-4 font-bold">Thử lại</button>
        </div>
      )}
      {page.state === 'ready' &&
        (page.rows.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-4 text-muted">
            {query.q || query.tab !== 'all' ? 'Không có bài nào khớp.' : <>Chưa có bài viết nào. <Link href="/admin/posts/moi" className="font-bold text-brand-ink underline">Viết bài đầu tiên</Link></>}
          </p>
        ) : (
          <div className="flex flex-col gap-3">{page.rows.map((p) => <PostCard key={p.id} post={p} busy={busy} onDelete={(x) => void onDelete(x)} />)}</div>
        ))}
      <Pagination page={query.page} totalPages={Math.ceil((page.state === 'ready' ? page.total : 0) / POSTS_PAGE_SIZE)} hrefFor={(p) => postsAdminHref({ ...query, page: p })} />
    </div>
  );
}
