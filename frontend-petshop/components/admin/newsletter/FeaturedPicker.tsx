'use client';

import { useState, type KeyboardEvent } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { CAMPAIGN_LIMITS, type FeaturedPick } from '../../../lib/adminNewsletter';
import type { FeaturedRef } from '../../../lib/types';

type Props = { value: FeaturedPick[]; error?: string; onChange: (next: FeaturedPick[]) => void };
type Result = { id: string; title: string; available: boolean };
type Search = { state: 'idle' } | { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: Result[] };

const KIND_LABEL: Record<FeaturedRef['type'], string> = { post: 'Bài viết', product: 'Sản phẩm' };
const SEARCH_SIZE = 8;

// Admin list APIs, any status: a draft post can be published before the campaign goes out; the email
// leaves out whatever is not public at that moment (the "không hiện" note says so).
async function search(type: FeaturedRef['type'], q: string): Promise<Result[]> {
  const p = new URLSearchParams({ search: q, page: '1', pageSize: String(SEARCH_SIZE) });
  if (type === 'post') {
    const res = await authFetch<{ id: string; title: string; status: string; publishedAt: string | null }[]>(`/blog/admin/list?${p}`);
    if (res.error || !res.data) throw new Error('search failed');
    return res.data.map((r) => ({ id: r.id, title: r.title, available: r.status === 'published' && !!r.publishedAt && new Date(r.publishedAt) <= new Date() }));
  }
  const res = await authFetch<{ id: string; name: string; status: string }[]>(`/products/admin/list?${p}`);
  if (res.error || !res.data) throw new Error('search failed');
  return res.data.map((r) => ({ id: r.id, title: r.name, available: r.status === 'active' }));
}

const BUTTON = 'inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold';

// Up to 6 posts / products shown as cards under the content, in the order chosen here.
export function FeaturedPicker({ value, error, onChange }: Props) {
  const [type, setType] = useState<FeaturedRef['type']>('post');
  const [q, setQ] = useState('');
  const [result, setResult] = useState<Search>({ state: 'idle' });
  const full = value.length >= CAMPAIGN_LIMITS.featured;
  const chosen = (r: { id: string }) => value.some((v) => v.type === type && v.id === r.id);

  async function run() {
    if (q.trim().length < 2) return setResult({ state: 'ready', rows: [] });
    setResult({ state: 'loading' });
    try {
      setResult({ state: 'ready', rows: await search(type, q.trim()) });
    } catch {
      setResult({ state: 'error' });
    }
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // the field sits inside the campaign form
      void run();
    }
  };
  const move = (i: number, by: -1 | 1) => {
    const next = [...value];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-card border border-line p-4" aria-describedby={error ? 'f-featured-error' : 'f-featured-hint'}>
      <legend className="px-1 text-sm font-bold text-ink">Bài viết / sản phẩm kèm theo</legend>
      <p id="f-featured-hint" className="text-xs text-muted">Hiện thành thẻ có ảnh và link dưới nội dung, tối đa {CAMPAIGN_LIMITS.featured} mục. Giá lấy lúc gửi.</p>

      {value.length > 0 && (
        <ol className="flex flex-col gap-2">
          {value.map((f, i) => (
            <li key={`${f.type}:${f.id}`} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-line bg-surface p-2">
              <span className="min-w-0 flex-1 text-sm break-words">
                <span className="text-xs font-bold text-muted">{KIND_LABEL[f.type]} · </span>{f.title ?? 'Đã bị xoá'}
                {!f.available && <span className="block text-xs text-orange-text">Hiện không công khai, sẽ không có trong email.</span>}
              </span>
              <span className="flex gap-1">
                <button type="button" aria-label={`Đưa «${f.title ?? ''}» lên`} disabled={i === 0} onClick={() => move(i, -1)} className="grid size-11 place-items-center rounded-full border border-line disabled:opacity-40">↑</button>
                <button type="button" aria-label={`Đưa «${f.title ?? ''}» xuống`} disabled={i === value.length - 1} onClick={() => move(i, 1)} className="grid size-11 place-items-center rounded-full border border-line disabled:opacity-40">↓</button>
                <button type="button" aria-label={`Bỏ «${f.title ?? ''}»`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="grid size-11 place-items-center rounded-full border border-pink-ink text-pink-ink">✕</button>
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Loại cần tìm">
        {(['post', 'product'] as const).map((t) => (
          <button key={t} type="button" aria-pressed={type === t} onClick={() => { setType(t); setResult({ state: 'idle' }); }}
            className={`${BUTTON} ${type === t ? 'bg-brand-ink text-white' : 'border border-line text-ink'}`}>{KIND_LABEL[t]}</button>
        ))}
      </div>
      <div className="flex flex-col gap-2 md:flex-row">
        <label htmlFor="f-featured" className="sr-only">Tìm {KIND_LABEL[type].toLowerCase()} theo tên</label>
        <input id="f-featured" name="featured" type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} enterKeyHint="search" disabled={full}
          placeholder={full ? `Đã đủ ${CAMPAIGN_LIMITS.featured} mục` : `Tìm ${KIND_LABEL[type].toLowerCase()} theo tên (từ 2 ký tự)`}
          className="min-h-11 w-full min-w-0 rounded-full border border-line bg-surface px-4 text-base md:w-80" />
        <button type="button" onClick={() => void run()} disabled={full} className={`${BUTTON} justify-center border border-brand-ink text-brand-ink disabled:opacity-40`}>Tìm</button>
      </div>

      {result.state === 'loading' && <p aria-busy="true" className="text-sm text-muted">Đang tìm…</p>}
      {result.state === 'error' && <p role="alert" className="text-sm text-pink-ink">Chưa tìm được. Thử lại.</p>}
      {result.state === 'ready' && (result.rows.length === 0 ? (
        <p className="text-sm text-muted">Không có kết quả. Gõ ít nhất 2 ký tự của tên.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {result.rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-sm break-words">{r.title}{!r.available && <span className="text-xs text-muted"> (chưa công khai)</span>}</span>
              <button type="button" disabled={full || chosen(r)} onClick={() => onChange([...value, { type, id: r.id, title: r.title, available: r.available }])}
                className={`${BUTTON} border border-brand-ink text-brand-ink disabled:opacity-40`}>{chosen(r) ? 'Đã chọn' : 'Thêm'}</button>
            </li>
          ))}
        </ul>
      ))}
      {error && <p id="f-featured-error" className="text-sm text-pink-ink">{error}</p>}
    </fieldset>
  );
}
