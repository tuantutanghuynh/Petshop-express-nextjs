'use client';

import { PRODUCT_STATUSES } from '../../../lib/adminProducts';

type Props = {
  status: string;
  categoryId: string;
  categoryError?: string;
  options: { id: string; label: string }[] | null;
  saving: boolean;
  submitLabel: string;
  onStatus: (s: string) => void;
  onCategory: (id: string) => void;
  onDelete?: () => void;
};

const SELECT = 'min-h-12 w-full min-w-0 rounded-[var(--radius-sm)] border bg-surface px-3 text-base text-ink';

// Right column of the product form (under it on phones): status, category, save, delete.
export function ProductSidebar({ status, categoryId, categoryError, options, saving, submitLabel, onStatus, onCategory, onDelete }: Props) {
  return (
    <aside className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 lg:sticky lg:top-4">
      <label htmlFor="f-status" className="text-sm font-bold text-ink">Trạng thái</label>
      <select id="f-status" name="status" value={status} onChange={(e) => onStatus(e.target.value)} className={`${SELECT} border-line`}>
        {PRODUCT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <label htmlFor="f-categoryId" className="text-sm font-bold text-ink">Danh mục *</label>
      <select id="f-categoryId" name="categoryId" value={categoryId} onChange={(e) => onCategory(e.target.value)} disabled={!options}
        aria-invalid={categoryError ? true : undefined} aria-describedby={categoryError ? 'f-categoryId-error' : undefined}
        className={`${SELECT} ${categoryError ? 'border-pink-ink' : 'border-line'}`}>
        <option value="">{options ? '— Chọn danh mục —' : 'Đang tải danh mục…'}</option>
        {options?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {categoryError && <p id="f-categoryId-error" className="text-sm text-pink-ink">{categoryError}</p>}
      <button type="submit" disabled={saving} className="hidden min-h-12 rounded-full bg-brand-ink px-6 font-bold text-white disabled:opacity-60 md:block">
        {saving ? 'Đang lưu…' : submitLabel}
      </button>
      {onDelete && (
        <button type="button" onClick={onDelete} disabled={saving} className="min-h-12 rounded-full border border-pink-ink px-6 font-bold text-pink-ink disabled:opacity-60">
          Xoá sản phẩm
        </button>
      )}
    </aside>
  );
}
