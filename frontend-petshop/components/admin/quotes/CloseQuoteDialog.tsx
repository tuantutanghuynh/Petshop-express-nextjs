'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_CLOSE_AMOUNT, parseAmount } from '../../../lib/adminQuotes';
import { TextField } from '../../ui/TextField';

type Props = { customerName: string; initial: number; onClose: () => void; onSubmit: (amount: number) => Promise<string | null> };

// "Chốt đơn" (wireframe admin-quotes.html): the real amount agreed on the phone, which may differ
// from the web price (negotiation, shipping, a regular's discount). Bottom sheet on phones, centred
// from md; Escape / ✕ / backdrop close and focus returns to the opener. onSubmit answers an error
// message (shown under the field) or null when saved.
export function CloseQuoteDialog({ customerName, initial, onClose, onSubmit }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const [text, setText] = useState(initial.toLocaleString('vi-VN'));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    opener.current = document.activeElement;
    dialog.current?.showModal();
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const amount = parseAmount(text);
    if (amount === null) {
      setError(`Nhập số tiền nguyên từ 0 đến ${MAX_CLOSE_AMOUNT.toLocaleString('vi-VN')} ₫`);
      (e.currentTarget.elements.namedItem('finalAmount') as HTMLInputElement | null)?.focus();
      return;
    }
    setSaving(true);
    const problem = await onSubmit(amount);
    setSaving(false);
    if (problem) setError(problem);
    else dialog.current?.close();
  }

  return (
    <dialog ref={dialog} aria-labelledby="close-title"
      onClose={() => { onClose(); if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus(); }}
      onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 w-full max-w-none rounded-t-[var(--radius-lg)] bg-surface p-0 backdrop:bg-ink/60 md:inset-auto md:top-1/2 md:left-1/2 md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-lg)]">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3">
          <h2 id="close-title" className="text-lg leading-[1.4] font-extrabold break-words">Chốt đơn — {customerName}</h2>
          <button type="button" aria-label="Đóng" onClick={() => dialog.current?.close()} className="grid size-11 shrink-0 place-items-center rounded-full border border-line text-xl">✕</button>
        </div>
        <TextField name="finalAmount" label="Số tiền chốt thật (VND)" inputMode="numeric" enterKeyHint="done" autoComplete="off" required value={text} error={error ?? undefined}
          hint="Giá sau khi thương lượng, phí ship, giảm cho khách quen…" onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={saving} className="min-h-12 rounded-full bg-brand-ink px-6 font-bold text-white disabled:opacity-60">
          {saving ? 'Đang lưu…' : 'Lưu — Đã chốt'}
        </button>
      </form>
    </dialog>
  );
}
