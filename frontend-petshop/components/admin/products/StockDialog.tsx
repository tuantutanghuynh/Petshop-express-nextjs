'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { adjustBody, previewAfter, reasonsFor, stocktakeBody, validateAdjust, validateStocktake, type Direction } from '../../../lib/adminStock';
import { fieldErrors, type FieldErrors } from '../../../lib/forms';
import type { PageMeta, StockMovement } from '../../../lib/types';
import { TextField } from '../../ui/TextField';
import { jsonBody, productApi, refreshProducts } from './productApi';
import { StockHistory } from './StockHistory';

type Variant = { id: string; label: string; sku: string; stock: number; reserved: number };
type History = { rows: StockMovement[] | null; total: number; page: number; failed: boolean; loadingMore: boolean };
type HistoryPage = { rows: StockMovement[]; total: number } | null;
type Props = { variant: Variant; onClose: () => void; onSaved: (stock: number, reserved: number) => void };

const PAGE_SIZE = 10;
// Backend field names → the inputs of this form, so a 422 lands under the right field.
const FIELD_OF: Record<string, string> = { delta: 'quantity', countedQuantity: 'counted', reason: 'reason', note: 'note' };
async function fetchHistory(variantId: string, page: number): Promise<HistoryPage> {
  const res = await productApi<StockMovement[]>(`/variants/${variantId}/stock-movements?page=${page}&pageSize=${PAGE_SIZE}`);
  if (res.error || !res.data) return null;
  return { rows: res.data, total: (res.meta as PageMeta | null)?.total ?? res.data.length };
}

// Page 1 replaces the list (after a save it holds the new line); later pages append.
function withPage(h: History, page: number, got: HistoryPage): History {
  if (!got) return { ...h, failed: page === 1, loadingMore: false };
  return { rows: page === 1 ? got.rows : [...(h.rows ?? []), ...got.rows], total: got.total, page, failed: false, loadingMore: false };
}

const tab = (on: boolean) => `min-h-11 flex-1 rounded-full px-3 text-sm font-bold ${on ? 'bg-brand-ink text-white' : 'border border-line text-ink'}`;

// "Điều chỉnh tồn kho" for one variant (spec 2026-11-07 D2): a delivery / damage / return, or a
// stocktake, written to the stock ledger; the variant's history below. Bottom sheet on phones,
// centred from md, as CloseQuoteDialog. It is opened from inside the product <form>: rendered into
// <body> so the DOM has no form inside a form, and its submit stops there — React events bubble
// through portals, and "Lưu điều chỉnh" must not also run "Lưu thay đổi" of the product.
export function StockDialog({ variant, onClose, onSaved }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const [stock, setStock] = useState({ stock: variant.stock, reserved: variant.reserved });
  const [kind, setKind] = useState<'adjust' | 'stocktake'>('adjust');
  const [direction, setDirection] = useState<Direction>('in');
  const [form, setForm] = useState({ quantity: '', reason: 'PURCHASE', counted: '', note: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<History>({ rows: null, total: 0, page: 1, failed: false, loadingMore: false });

  const loadHistory = (page: number) => fetchHistory(variant.id, page).then((got) => setHistory((h) => withPage(h, page, got)));

  useEffect(() => {
    opener.current = document.activeElement;
    dialog.current?.showModal();
    let active = true;
    fetchHistory(variant.id, 1).then((got) => active && setHistory((h) => withPage(h, 1, got)));
    return () => {
      active = false;
    };
  }, [variant.id]);

  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const pickDirection = (d: Direction) => { setDirection(d); update({ reason: reasonsFor(d)[0].value }); };
  const after = previewAfter(stock.stock, kind === 'adjust' ? { kind, direction, quantity: form.quantity } : { kind, counted: form.counted });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    const found = kind === 'adjust' ? validateAdjust(form) : validateStocktake(form, stock.reserved);
    setErrors(found);
    setNotice(null);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    const body = kind === 'adjust' ? adjustBody(direction, form) : stocktakeBody(form);
    const res = await productApi<{ stockQuantity: number; reservedQuantity: number }>(`/variants/${variant.id}/stock-movements`, jsonBody('POST', body));
    setSaving(false);
    if (res.error || !res.data) {
      const byField = Object.fromEntries(Object.entries(fieldErrors(res.error?.details)).map(([k, v]) => [FIELD_OF[k] ?? k, v]));
      const field = kind === 'adjust' ? 'quantity' : 'counted';
      return setErrors(Object.keys(byField).length > 0 ? byField : { [field]: res.error?.message ?? 'Chưa lưu được điều chỉnh.' });
    }
    const next = { stock: res.data.stockQuantity, reserved: res.data.reservedQuantity };
    setStock(next);
    onSaved(next.stock, next.reserved);
    setForm((f) => ({ ...f, quantity: '', counted: '', note: '' }));
    setNotice(`Đã lưu. Tồn kho hiện tại: ${next.stock}.`);
    void refreshProducts();
    void loadHistory(1);
  }

  return createPortal(
    <dialog ref={dialog} aria-labelledby="stock-title"
      onClose={() => { onClose(); if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus(); }}
      onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-[var(--radius-lg)] bg-surface p-0 backdrop:bg-ink/60 md:inset-auto md:top-1/2 md:left-1/2 md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-lg)]">
      <div className="flex flex-col gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="stock-title" className="text-lg leading-[1.4] font-extrabold break-words">Tồn kho — {variant.label || variant.sku}</h2>
            <p className="text-sm text-muted tabular-nums">SKU {variant.sku} · Tồn <b className="text-ink">{stock.stock}</b> · Đang giữ {stock.reserved} · Bán được {stock.stock - stock.reserved}</p>
          </div>
          <button type="button" aria-label="Đóng" onClick={() => dialog.current?.close()} className="grid size-11 shrink-0 place-items-center rounded-full border border-line text-xl">✕</button>
        </div>
        <div role="group" aria-label="Loại điều chỉnh" className="flex gap-2">
          <button type="button" aria-pressed={kind === 'adjust'} onClick={() => { setKind('adjust'); setErrors({}); }} className={tab(kind === 'adjust')}>Nhập / xuất kho</button>
          <button type="button" aria-pressed={kind === 'stocktake'} onClick={() => { setKind('stocktake'); setErrors({}); }} className={tab(kind === 'stocktake')}>Kiểm kê</button>
        </div>
        <form onSubmit={submit} noValidate className="flex flex-col gap-3">
          {kind === 'adjust' ? (
            <>
              <div role="group" aria-label="Chiều" className="flex gap-2">
                <button type="button" aria-pressed={direction === 'in'} onClick={() => pickDirection('in')} className={tab(direction === 'in')}>Nhập (+)</button>
                <button type="button" aria-pressed={direction === 'out'} onClick={() => pickDirection('out')} className={tab(direction === 'out')}>Xuất (−)</button>
              </div>
              <TextField name="quantity" label="Số lượng" inputMode="numeric" autoComplete="off" value={form.quantity} error={errors.quantity} onChange={(e) => update({ quantity: e.target.value })} />
              <div className="flex flex-col gap-1">
                <label htmlFor="f-reason" className="text-sm font-bold text-ink">Lý do</label>
                <select id="f-reason" name="reason" value={form.reason} onChange={(e) => update({ reason: e.target.value })} aria-describedby={errors.reason ? 'f-reason-error' : undefined}
                  className="min-h-12 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base text-ink">
                  {reasonsFor(direction).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {errors.reason && <p id="f-reason-error" className="text-sm text-pink-ink">{errors.reason}</p>}
              </div>
            </>
          ) : (
            <TextField name="counted" label="Số đếm được thực tế" inputMode="numeric" autoComplete="off" value={form.counted} error={errors.counted}
              hint={stock.reserved > 0 ? `Không thấp hơn ${stock.reserved} đang giữ cho đơn chờ thanh toán.` : undefined} onChange={(e) => update({ counted: e.target.value })} />
          )}
          <TextField name="note" label={kind === 'adjust' && form.reason === 'OTHER' ? 'Ghi chú (bắt buộc)' : 'Ghi chú'} maxLength={500} value={form.note} error={errors.note}
            onChange={(e) => update({ note: e.target.value })} />
          {after !== null && (
            <p className="text-sm tabular-nums" aria-live="polite">
              {kind === 'adjust' ? 'Tồn sau điều chỉnh' : `Chênh lệch ${after - stock.stock > 0 ? '+' : ''}${after - stock.stock}`}: <b>{stock.stock} → {after}</b>
            </p>
          )}
          {notice && <p role="status" className="text-sm font-bold text-brand-ink">{notice}</p>}
          <button type="submit" disabled={saving} className="min-h-12 w-full rounded-full bg-brand-ink px-6 font-bold text-white disabled:opacity-60 md:w-auto md:self-start">
            {saving ? 'Đang lưu…' : 'Lưu điều chỉnh'}
          </button>
        </form>
        <section aria-labelledby="stock-history" className="flex flex-col gap-2 border-t border-line pt-3">
          <h3 id="stock-history" className="font-extrabold">Lịch sử kho</h3>
          <StockHistory rows={history.rows} failed={history.failed} hasMore={history.rows !== null && history.rows.length < history.total} loadingMore={history.loadingMore}
            onMore={() => { setHistory((h) => ({ ...h, loadingMore: true })); void loadHistory(history.page + 1); }} onRetry={() => void loadHistory(1)} />
        </section>
      </div>
    </dialog>,
    document.body,
  );
}
