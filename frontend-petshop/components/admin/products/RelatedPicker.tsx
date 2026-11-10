'use client';

import { useState, type KeyboardEvent } from 'react';
import type { AdminProduct } from '../../../lib/types';
import { jsonBody, productApi, refreshProducts } from './productApi';

type Row = NonNullable<AdminProduct['related']>[number];
type Search = { state: 'idle' } | { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: Row[] };

const MAX = 4; // the backend refuses more (ADR-026)
const BUTTON = 'inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold';
const STATUS_NOTE: Record<string, string> = { draft: 'nháp, chưa hiện', archived: 'lưu trữ, chưa hiện' };

// "Thường mua kèm" of one product (edit page only: it needs the product's id). Like the photos, every
// change is saved at once; the storefront then refreshes. One-way: it shows on this product's page.
export function RelatedPicker({ productId, initial }: { productId: string; initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [q, setQ] = useState('');
  const [result, setResult] = useState<Search>({ state: 'idle' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const full = rows.length >= MAX;

  async function save(next: Row[]) {
    setSaving(true);
    setMessage(null);
    const res = await productApi<Row[]>(`/${productId}/related`, jsonBody('PUT', { ids: next.map((r) => r.id) }));
    setSaving(false);
    if (res.error || !res.data) {
      const detail = Array.isArray(res.error?.details) ? (res.error?.details as { msg?: string }[])[0]?.msg : undefined;
      return setMessage({ ok: false, text: detail || res.error?.message || 'Chưa lưu được.' });
    }
    setRows(res.data);
    setMessage({ ok: true, text: 'Đã lưu sản phẩm mua kèm.' });
    await refreshProducts();
  }

  async function search() {
    if (q.trim().length < 2) return setResult({ state: 'ready', rows: [] });
    setResult({ state: 'loading' });
    const p = new URLSearchParams({ search: q.trim(), page: '1', pageSize: '8' });
    const res = await productApi<Row[]>(`/admin/list?${p}`);
    setResult(res.error || !res.data ? { state: 'error' } : { state: 'ready', rows: res.data.filter((r) => r.id !== productId) });
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // not the product form's submit
      void search();
    }
  };
  const move = (i: number, by: -1 | 1) => {
    const next = [...rows];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    void save(next);
  };

  return (
    <section aria-labelledby="related-picker" className="flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <h2 id="related-picker" className="text-lg leading-[1.3] font-extrabold">Thường mua kèm</h2>
      <p className="text-xs text-muted">Tối đa {MAX} sản phẩm, hiện dưới nút mua của sản phẩm này để khách thêm cả nhóm vào giỏ. Lưu ngay khi chọn.</p>

      {rows.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-line p-2">
              <span className="min-w-0 flex-1 text-sm break-words">
                {r.name}
                {STATUS_NOTE[r.status] && <span className="block text-xs text-orange-text">Đang {STATUS_NOTE[r.status]} trên web.</span>}
              </span>
              <span className="flex gap-1">
                <button type="button" aria-label={`Đưa «${r.name}» lên`} disabled={saving || i === 0} onClick={() => move(i, -1)} className="grid size-11 place-items-center rounded-full border border-line disabled:opacity-40">↑</button>
                <button type="button" aria-label={`Đưa «${r.name}» xuống`} disabled={saving || i === rows.length - 1} onClick={() => move(i, 1)} className="grid size-11 place-items-center rounded-full border border-line disabled:opacity-40">↓</button>
                <button type="button" aria-label={`Bỏ «${r.name}»`} disabled={saving} onClick={() => void save(rows.filter((x) => x.id !== r.id))} className="grid size-11 place-items-center rounded-full border border-pink-ink text-pink-ink disabled:opacity-40">✕</button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">Chưa chọn sản phẩm nào.</p>
      )}

      <div className="flex flex-col gap-2 md:flex-row">
        <label htmlFor="f-related" className="sr-only">Tìm sản phẩm theo tên</label>
        <input id="f-related" type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} enterKeyHint="search" disabled={full}
          placeholder={full ? `Đã đủ ${MAX} sản phẩm` : 'Tìm sản phẩm theo tên (từ 2 ký tự)'}
          className="min-h-11 w-full min-w-0 rounded-full border border-line bg-surface px-4 text-base md:w-80" />
        <button type="button" onClick={() => void search()} disabled={full} className={`${BUTTON} justify-center border border-brand-ink text-brand-ink disabled:opacity-40`}>Tìm</button>
      </div>
      {result.state === 'loading' && <p aria-busy="true" className="text-sm text-muted">Đang tìm…</p>}
      {result.state === 'error' && <p role="alert" className="text-sm text-pink-ink">Chưa tìm được. Thử lại.</p>}
      {result.state === 'ready' && (result.rows.length === 0 ? (
        <p className="text-sm text-muted">Không có kết quả. Gõ ít nhất 2 ký tự của tên.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {result.rows.map((r) => {
            const chosen = rows.some((x) => x.id === r.id);
            return (
              <li key={r.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-sm break-words">{r.name}{STATUS_NOTE[r.status] && <span className="text-xs text-muted"> ({STATUS_NOTE[r.status]})</span>}</span>
                <button type="button" disabled={saving || full || chosen} onClick={() => void save([...rows, r])} className={`${BUTTON} border border-brand-ink text-brand-ink disabled:opacity-40`}>{chosen ? 'Đã chọn' : 'Thêm'}</button>
              </li>
            );
          })}
        </ul>
      ))}
      {message && <p role="status" className={`text-sm ${message.ok ? 'font-bold text-brand-ink' : 'text-pink-ink'}`}>{message.text}</p>}
    </section>
  );
}
