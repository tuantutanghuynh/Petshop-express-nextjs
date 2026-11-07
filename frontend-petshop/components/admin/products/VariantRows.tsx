'use client';

import { useState } from 'react';
import type { VariantForm } from '../../../lib/adminProducts';
import type { FieldErrors } from '../../../lib/forms';
import { TextField } from '../../ui/TextField';
import { StockDialog } from './StockDialog';

type Props = {
  mode: 'create' | 'edit';
  rows: VariantForm[];
  errors: FieldErrors;
  onChange: (rows: VariantForm[]) => void;
  // Edit mode: a saved row is deleted at once (after a confirm); resolves to an error message, or
  // null when it worked. New rows are saved with the form.
  onRemoveSaved?: (id: string) => Promise<string | null>;
  // Edit mode: a stock adjustment was saved for a variant (StockDialog); the form shows the new numbers.
  onStockChange?: (id: string, stock: number, reserved: number) => void;
};

const EMPTY: VariantForm = { id: null, label: '', sku: '', price: '', compareAtPrice: '', stock: '0', reserved: 0 };
const BUTTON = 'min-h-11 rounded-full px-4 text-sm font-bold';

// "Biến thể, giá & tồn kho" (wireframe admin-product-edit.html). Stock of a saved variant is never
// typed over: "Điều chỉnh" records a delivery, damage, return or stocktake in the stock ledger
// (StockDialog), so every change keeps a reason and sales in between are not lost.
export function VariantRows({ mode, rows, errors, onChange, onRemoveSaved, onStockChange }: Props) {
  const [busy, setBusy] = useState<number | null>(null);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const set = (i: number, patch: Partial<VariantForm>) => onChange(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const err = (i: number, f: string) => errors[`variants.${i}.${f}`];

  async function run(i: number, job: () => Promise<string | null>) {
    setBusy(i);
    setMessage(null);
    const failed = await job();
    setBusy(null);
    if (failed) setMessage(failed);
  }

  function remove(i: number) {
    const row = rows[i];
    if (!row.id) return onChange(rows.filter((_, n) => n !== i));
    if (!onRemoveSaved || !window.confirm(`Xoá biến thể «${row.label || row.sku}»? Đơn đã đặt vẫn giữ thông tin của nó.`)) return;
    const id = row.id;
    void run(i, () => onRemoveSaved(id));
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <legend className="px-1 text-lg leading-[1.3] font-extrabold text-ink">Biến thể, giá &amp; tồn kho</legend>
      {message && <p role="alert" className="rounded-card bg-pink-bg px-3 py-2 text-sm text-pink-ink">{message}</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <li key={r.id ?? `new-${i}`} className="grid gap-3 border-b border-line pb-3 sm:grid-cols-2 xl:grid-cols-3">
            <TextField name={`variants-${i}-label`} label="Nhãn" placeholder="Gói 1kg" maxLength={100} value={r.label} onChange={(e) => set(i, { label: e.target.value })} />
            <TextField name={`variants-${i}-sku`} label="SKU" value={r.sku} maxLength={64} readOnly={r.id !== null} error={err(i, 'sku')}
              onChange={(e) => set(i, { sku: e.target.value })} className={r.id ? '[&_input]:bg-surface-alt' : ''} />
            <TextField name={`variants-${i}-price`} label="Giá (₫)" inputMode="numeric" value={r.price} error={err(i, 'price')} onChange={(e) => set(i, { price: e.target.value })} />
            <TextField name={`variants-${i}-compareAtPrice`} label="Giá gạch" inputMode="numeric" value={r.compareAtPrice} error={err(i, 'compareAtPrice')}
              onChange={(e) => set(i, { compareAtPrice: e.target.value })} />
            {r.id ? (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold text-ink">Tồn kho</span>
                <span className="flex min-h-12 flex-wrap items-center gap-2 tabular-nums">
                  <b className="text-ink">{r.stock}</b><small className="text-muted">(giữ {r.reserved})</small>
                  {onStockChange && (
                    <button type="button" onClick={() => setAdjusting(r.id)} aria-label={`Điều chỉnh tồn kho ${r.label || r.sku}`}
                      className={`${BUTTON} border border-brand-ink text-brand-ink`}>Điều chỉnh</button>
                  )}
                </span>
              </div>
            ) : (
              <TextField name={`variants-${i}-stock`} label="Tồn đầu" inputMode="numeric" value={r.stock} error={err(i, 'stock')} onChange={(e) => set(i, { stock: e.target.value })} />
            )}
            <div className="flex flex-wrap items-end gap-2 sm:self-end">
              {rows.length > 1 && (
                <button type="button" disabled={busy !== null} onClick={() => remove(i)} aria-label={`Xoá biến thể ${r.label || r.sku || i + 1}`}
                  className={`${BUTTON} border border-line text-pink-ink disabled:opacity-60`}>
                  {busy === i ? 'Đang xoá…' : 'Xoá'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onChange([...rows, { ...EMPTY }])} className={`${BUTTON} self-start border border-line text-ink`}>+ Thêm biến thể</button>
      {mode === 'edit' && <p className="text-xs text-muted">Biến thể mới được lưu khi bấm “Lưu thay đổi”. Tồn kho của biến thể đã lưu thay đổi qua nút “Điều chỉnh”.</p>}
      {adjusting && onStockChange && (() => {
        const row = rows.find((r) => r.id === adjusting);
        if (!row?.id) return null;
        const id = row.id;
        return (
          <StockDialog variant={{ id, label: row.label, sku: row.sku, stock: Number(row.stock), reserved: row.reserved }}
            onClose={() => setAdjusting(null)} onSaved={(stock, reserved) => onStockChange(id, stock, reserved)} />
        );
      })()}
    </fieldset>
  );
}
