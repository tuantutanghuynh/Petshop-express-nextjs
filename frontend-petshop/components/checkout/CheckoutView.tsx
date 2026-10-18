'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { bffFetch } from '../../lib/bffClient';
import { cartCount, variantLabel } from '../../lib/cart';
import { fieldErrors, type FieldErrors } from '../../lib/forms';
import { newIdempotencyKey, validateCheckout, type BankInfo } from '../../lib/orders';
import { formatVnd } from '../../lib/storefront';
import type { Order } from '../../lib/types';
import { useCart } from '../cart/CartProvider';
import { EmptyState } from '../ui/EmptyState';
import { FormAlert } from '../ui/FormAlert';
import { TextField } from '../ui/TextField';

type Method = 'COD' | 'BANK_TRANSFER';

// Errors that mean "the cart changed under you": the fix is in the cart, not in this form.
const CART_PROBLEMS = new Set(['OUT_OF_STOCK', 'PRODUCT_UNAVAILABLE', 'CART_EMPTY', 'ORDER_TOO_LARGE']);

export function CheckoutView({ bank }: { bank: BankInfo | null }) {
  const { status, cart, reload } = useCart();
  const router = useRouter();
  // One key for this checkout attempt (lib/orders.ts): a double submit cannot create two orders.
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [method, setMethod] = useState<Method>('COD');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<{ text: string; cart: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'loading') return <div aria-busy="true" aria-label="Đang tải" className="h-40 animate-pulse rounded-card bg-surface-alt" />;
  if (status === 'signedOut') {
    return (
      <div className="flex flex-col items-start gap-3">
        <p>Đăng nhập để đặt hàng.</p>
        <Link href="/dang-nhap?next=%2Fdat-hang" className="inline-flex min-h-12 items-center rounded-full bg-brand-ink px-6 font-bold text-white">Đăng nhập</Link>
      </div>
    );
  }
  if (status === 'error' || !cart) return <EmptyState tone="error" message="Chưa tải được giỏ hàng. Vui lòng tải lại trang." />;
  if (cart.items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <EmptyState message="Giỏ hàng đang trống." />
        <Link href="/" className="inline-flex min-h-11 items-center font-bold text-brand-ink underline">Tiếp tục mua sắm</Link>
      </div>
    );
  }
  if (cart.hasIssues) {
    return (
      <div className="flex flex-col items-start gap-3">
        <FormAlert message="Một số sản phẩm trong giỏ đã hết hoặc không đủ hàng." />
        <Link href="/gio-hang" className="inline-flex min-h-12 items-center rounded-full bg-brand-ink px-6 font-bold text-white">Quay lại giỏ hàng để điều chỉnh</Link>
      </div>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      fullName: String(form.get('fullName') ?? ''),
      phone: String(form.get('phone') ?? ''),
      addressLine: String(form.get('addressLine') ?? ''),
      city: String(form.get('city') ?? ''),
      note: String(form.get('note') ?? ''),
    };
    const clientErrors = validateCheckout(values);
    setErrors(clientErrors);
    setAlert(null);
    if (Object.keys(clientErrors).length > 0) return;

    setSubmitting(true);
    const res = await bffFetch<Order>('/api/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        paymentMethod: method,
        shippingAddress: {
          fullName: values.fullName.trim(),
          phone: values.phone.replace(/[\s.-]/g, ''),
          addressLine: values.addressLine.trim(),
          city: values.city.trim(),
        },
        note: values.note.trim() || null,
      },
    });
    if (res.ok) {
      await reload(); // the backend emptied the cart
      router.replace(`/tai-khoan/don-hang/${encodeURIComponent(res.data.code)}?moi=1`);
      return;
    }
    setSubmitting(false);
    if (res.error.code === 'VALIDATION_ERROR') setErrors(fieldErrors(res.error.details));
    else setAlert({ text: res.error.message ?? 'Chưa đặt được hàng, vui lòng thử lại.', cart: CART_PROBLEMS.has(res.error.code) });
    if (CART_PROBLEMS.has(res.error.code)) void reload();
  }

  const radio = (value: Method, title: string, text: string) => (
    <label className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-card border p-4 ${method === value ? 'border-brand-ink bg-mint' : 'border-line'}`}>
      <input type="radio" name="paymentMethod" value={value} checked={method === value} onChange={() => setMethod(value)} className="mt-1 size-5 accent-[var(--brand-teal-ink)]" />
      <span><b className="block text-ink">{title}</b><span className="text-sm">{text}</span></span>
    </label>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <div className="flex flex-col gap-6">
        {alert && (
          <div className="flex flex-col gap-2">
            <FormAlert message={alert.text} />
            {alert.cart && <Link href="/gio-hang" className="inline-flex min-h-11 items-center font-bold text-brand-ink underline">Xem lại giỏ hàng</Link>}
          </div>
        )}
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-lg font-extrabold text-ink">Giao hàng tới</legend>
          <TextField name="fullName" label="Họ tên người nhận" autoComplete="name" required error={errors['shippingAddress.fullName']} />
          <TextField name="phone" label="Số điện thoại" type="tel" inputMode="tel" autoComplete="tel" required error={errors['shippingAddress.phone']} />
          <TextField name="addressLine" label="Địa chỉ (số nhà, đường, phường / xã)" autoComplete="street-address" required error={errors['shippingAddress.addressLine']} />
          <TextField name="city" label="Tỉnh / thành phố" autoComplete="address-level1" required error={errors['shippingAddress.city']} />
          <div className="flex flex-col gap-1">
            <label htmlFor="f-note" className="text-sm font-bold text-ink">Ghi chú (không bắt buộc)</label>
            <textarea id="f-note" name="note" rows={3} maxLength={500} aria-describedby={errors.note ? 'f-note-error' : undefined} className="rounded-[var(--radius-sm)] border border-line bg-surface p-3 text-base text-ink" />
            {errors.note && <p id="f-note-error" className="text-sm text-pink-ink">{errors.note}</p>}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-lg font-extrabold text-ink">Thanh toán</legend>
          {radio('COD', 'Thanh toán khi nhận hàng (COD)', 'Trả tiền mặt cho người giao hàng.')}
          {bank && radio('BANK_TRANSFER', 'Chuyển khoản ngân hàng', 'Cửa hàng giữ hàng cho bạn 24 giờ; thông tin chuyển khoản hiện ngay sau khi đặt.')}
        </fieldset>
      </div>

      <section aria-labelledby="checkout-summary" className="flex flex-col gap-3 rounded-panel bg-surface-alt p-5">
        <h2 id="checkout-summary" className="text-lg font-extrabold">Đơn hàng ({cartCount(cart)} sản phẩm)</h2>
        <ul className="flex flex-col text-sm">
          {cart.items.map((line) => (
            <li key={line.id} className="flex justify-between gap-3 border-b border-line py-2">
              <span className="min-w-0">{line.product.name} · {variantLabel(line.variant)} × {line.quantity}</span>
              <span className="shrink-0 font-bold text-ink">{formatVnd(line.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <p className="flex justify-between font-extrabold text-ink"><span>Tạm tính</span><span>{formatVnd(cart.subtotal)}</span></p>
        <p className="text-sm text-muted">Phí giao hàng được báo khi cửa hàng xác nhận đơn.</p>
        <button type="submit" disabled={submitting} className="min-h-12 rounded-full bg-brand-ink px-6 font-bold text-white hover:bg-brand-deep disabled:opacity-60">
          {submitting ? 'Đang đặt hàng…' : 'Đặt hàng'}
        </button>
      </section>
    </form>
  );
}
