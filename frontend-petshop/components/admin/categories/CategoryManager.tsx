'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { buildAdminTree, deleteBlockReason, moveInSiblings, type AdminNode } from '../../../lib/adminCategories';
import { getToken } from '../../../lib/adminAuth';
import { BRAND_SLUG } from '../../../lib/site';
import type { AdminCategory } from '../../../lib/types';
import { FormAlert } from '../../ui/FormAlert';
import { categoryApi, refreshStorefront } from './adminCategoryApi';
import { CategoryEditor, type Editing } from './CategoryEditor';
import { CategoryRows } from './CategoryRows';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: AdminCategory[] };

async function fetchRows(): Promise<Load> {
  const res = await categoryApi<AdminCategory[]>('/admin/list');
  return res.error || !res.data ? { state: 'error' } : { state: 'ready', rows: res.data };
}

// /admin/danh-muc: the shop's category tree with add / edit / move / reorder / delete. Every write
// reloads the list from the server (the source of truth) and refreshes the storefront cache.
export function CategoryManager() {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => setLoad(await fetchRows()), []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/admin/login');
      return;
    }
    let active = true;
    fetchRows().then((next) => active && setLoad(next));
    return () => {
      active = false;
    };
  }, [router]);

  const afterWrite = async (text: string) => {
    setNotice({ ok: true, text });
    await Promise.all([reload(), refreshStorefront()]);
  };

  if (load.state === 'loading') return <div aria-busy="true" aria-label="Đang tải danh mục" className="h-60 animate-pulse rounded-card bg-surface-alt" />;
  if (load.state === 'error') return <FormAlert message="Chưa tải được danh mục. Tải lại trang để thử lại." />;

  const { root, nodes } = buildAdminTree(load.rows, BRAND_SLUG);
  if (!root) return <FormAlert message={`Không tìm thấy danh mục gốc “${BRAND_SLUG}”.`} />;

  async function move(node: AdminNode, siblings: AdminNode[], dir: -1 | 1) {
    const ids = moveInSiblings(siblings.map((s) => s.id), node.id, dir);
    if (!ids || !node.parentId) return;
    setBusy(true);
    const res = await categoryApi('/reorder', { method: 'PUT', body: JSON.stringify({ parentId: node.parentId, ids }) });
    setBusy(false);
    if (res.error) setNotice({ ok: false, text: res.error.message });
    else await afterWrite(`Đã đổi thứ tự “${node.name}”.`);
  }

  async function remove(node: AdminNode) {
    const blocked = deleteBlockReason(node._count);
    if (blocked) return setNotice({ ok: false, text: `Chưa xoá được “${node.name}”: ${blocked} Chuyển hoặc xoá chúng trước.` });
    if (!window.confirm(`Xoá danh mục “${node.name}”? Không hoàn tác được.`)) return;
    setBusy(true);
    const res = await categoryApi(`/${node.id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.error) setNotice({ ok: false, text: res.error.message });
    else await afterWrite(`Đã xoá “${node.name}”.`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Thứ tự ở đây là thứ tự trong menu. Tối đa 3 tầng: loài → nhóm → mục.</p>
        <button type="button" onClick={() => setEditing({ mode: 'new', parentId: root.id })}
          className="min-h-12 rounded-full bg-brand-ink px-5 font-bold text-white">+ Thêm danh mục</button>
      </div>
      <p role="status" className={notice ? (notice.ok ? 'text-sm text-brand-ink' : 'rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink') : 'sr-only'}>
        {notice?.text ?? ''}
      </p>
      {nodes.length === 0 ? (
        <p className="text-muted">Chưa có danh mục nào — bấm “+ Thêm danh mục”.</p>
      ) : (
        <CategoryRows nodes={nodes} busy={busy} onEdit={(node) => setEditing({ mode: 'edit', node })}
          onAddChild={(node) => setEditing({ mode: 'new', parentId: node.id })} onMove={move} onDelete={remove} />
      )}
      {editing && (
        <CategoryEditor key={editing.mode === 'edit' ? editing.node.id : `new-${editing.parentId}`} editing={editing} nodes={nodes} root={root}
          onClose={() => setEditing(null)} onSaved={(text) => void afterWrite(text)} />
      )}
    </div>
  );
}
