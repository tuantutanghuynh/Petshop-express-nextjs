'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { bffFetch } from '../../lib/bffClient';
import { fieldErrors, focusFirstError, type FieldErrors } from '../../lib/forms';
import { clearQuote, readQuote, removeFromQuote, setQuoteQuantity, type QuoteItem } from '../../lib/quoteList';
import { productPath } from '../../lib/seo/structuredData';
import { formatVnd } from '../../lib/storefront';
import { FormAlert } from '../ui/FormAlert';
import { Honeypot } from '../ui/Honeypot';
import { QuantityStepper } from '../ui/QuantityStepper';
import { TextField } from '../ui/TextField';

const PHONE = /^(?:\+?84|0)\d{9,10}$/;

function validate(v: Record<string, string>): FieldErrors {
  const e: FieldErrors = {};
  if (!v.customerName.trim()) e.customerName = 'Nhập họ tên';
  const phone = v.phone.replace(/[\s.-]/g, '');
  if (!phone) e.phone = 'Nhập số điện thoại';
  else if (!PHONE.test(phone)) e.phone = 'Số điện thoại không hợp lệ';
  if (!v.address.trim()) e.address = 'Nhập địa chỉ';
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Email không hợp lệ';
  return e;
}

// /tu-van-bao-gia (wireframe quote.html): the products picked with "Nhờ tư vấn" (sessionStorage)
// plus contact details; the shop calls back. No account needed.
export function QuoteView() {
  const [items, setItems] = useState<QuoteItem[] | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // sessionStorage only exists in the browser: read it once after mount.
  useEffect(() => {
    const id = requestAnimationFrame(() => setItems(readQuote()));
    return () => cancelAnimationFrame(id);
  }, []);

  const refresh = () => setItems(readQuote());

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const f = new FormData(formEl);
    const v = Object.fromEntries(['customerName', 'phone', 'email', 'address', 'note', 'website_url'].map((k) => [k, String(f.get(k) ?? '')]));
    const found = validate(v);
    setErrors(found);
    setAlert(null);
    if (Object.keys(found).length > 0) {
      focusFirstError(formEl, found);
      return;
    }
    if (!items?.length) return;
    setSending(true);
    const res = await bffFetch('/api/quote-requests', {
      method: 'POST',
      body: { ...v, phone: v.phone.replace(/[\s.-]/g, ''), items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) },
    });
    setSending(false);
    if (res.ok) {
      clearQuote();
      setItems([]);
      setSent(true);
      return;
    }
    if (res.status === 429) setAlert('Bạn gửi hơi nhiều, vui lòng thử lại sau 15 phút.');
    else if (res.error.code === 'VALIDATION_ERROR') setErrors(fieldErrors(res.error.details));
    else setAlert(res.error.message ?? 'Chưa gửi được, vui lòng thử lại.');
  }

  if (sent) {
    return (
      <p role="status" className="rounded-panel bg-mint p-5 font-bold text-brand-deep">
        ✓ Đã nhận yêu cầu! Cửa hàng sẽ gọi lại cho bạn trong giờ làm việc.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="relative grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <div className="flex flex-col gap-4">
        <FormAlert message={alert} />
        <TextField name="customerName" label="Họ và tên *" autoComplete="name" enterKeyHint="next" required error={errors.customerName} />
        <TextField name="phone" label="Số điện thoại *" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" required error={errors.phone} />
        <TextField name="email" label="Email (không bắt buộc)" type="email" inputMode="email" autoComplete="email" enterKeyHint="next" error={errors.email} />
        <TextField name="address" label="Địa chỉ *" autoComplete="street-address" enterKeyHint="next" required error={errors.address} />
        <div className="flex flex-col gap-1">
          <label htmlFor="f-note" className="text-sm font-bold text-ink">Bé nhà bạn là ai? Cần tư vấn gì?</label>
          <textarea id="f-note" name="note" rows={4} maxLength={1000} className="rounded-[var(--radius-sm)] border border-line bg-surface p-3 text-base text-ink" />
        </div>
        <Honeypot />
      </div>

      <section aria-labelledby="quote-items" className="flex flex-col gap-3 rounded-panel bg-surface-alt p-5">
        <h2 id="quote-items" className="text-lg font-extrabold">Sản phẩm cần tư vấn</h2>
        {items === null ? (
          <div aria-busy="true" className="h-20 animate-pulse rounded-card bg-surface" />
        ) : items.length === 0 ? (
          <p className="text-sm">
            Chưa có sản phẩm nào. Bấm <b>“Nhờ tư vấn”</b> ở trang sản phẩm để thêm.{' '}
            <Link href="/san-pham" className="inline-flex min-h-11 items-center font-bold text-brand-ink underline">Xem sản phẩm</Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-3 tabular-nums">
            {items.map((i) => (
              <li key={i.variantId} className="flex flex-col gap-2 border-b border-line pb-3">
                <Link href={productPath(i.slug)} className="font-bold text-ink hover:underline">{i.productName}</Link>
                <span className="text-sm text-muted">{i.label}{i.label && ' · '}{formatVnd(i.price)}</span>
                <div className="flex items-center gap-3">
                  <QuantityStepper label={`Số lượng ${i.productName}`} value={i.quantity} max={99}
                    onChange={(q) => { setQuoteQuantity(i.variantId, q); refresh(); }} />
                  <button type="button" onClick={() => { removeFromQuote(i.variantId); refresh(); }} className="min-h-11 px-2 text-sm font-bold text-pink-ink underline">Xoá</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button type="submit" disabled={sending || !items?.length} className="min-h-12 rounded-full bg-brand-ink px-6 font-bold text-white disabled:opacity-60">
          {sending ? 'Đang gửi…' : 'Gửi yêu cầu tư vấn'}
        </button>
      </section>
    </form>
  );
}
