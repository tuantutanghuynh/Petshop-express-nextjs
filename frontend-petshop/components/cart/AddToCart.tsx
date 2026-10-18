'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { maxQuantity } from '../../lib/cart';
import { QuantityStepper } from '../ui/QuantityStepper';
import { useCart } from './CartProvider';

type Props = { variantId: string; available: number };

// Quantity + "Thêm vào giỏ" for the variant chosen in VariantPicker. A signed-out visitor is sent to
// the login page and comes back here afterwards. Stock is re-checked by the backend at checkout.
export function AddToCart({ variantId, available }: Props) {
  const { status, addItem } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const isOut = available <= 0;

  async function onAdd() {
    if (status === 'signedOut') {
      router.push(`/dang-nhap?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setPending(true);
    setMessage(null);
    const res = await addItem(variantId, Math.min(quantity, maxQuantity(available)));
    setPending(false);
    if (res.ok) setMessage({ ok: true, text: 'Đã thêm vào giỏ hàng.' });
    else if (res.error.code === 'UNAUTHENTICATED' || res.error.code === 'ACCESS_EXPIRED') router.push(`/dang-nhap?next=${encodeURIComponent(pathname)}`);
    else setMessage({ ok: false, text: res.error.message ?? 'Chưa thêm được, vui lòng thử lại.' });
  }

  if (isOut) {
    return <button type="button" disabled className="min-h-12 w-full rounded-full bg-surface-alt px-6 font-bold text-muted sm:w-auto">Tạm hết hàng</button>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper label="Số lượng" value={quantity} max={maxQuantity(available)} onChange={setQuantity} disabled={pending} />
        <button
          type="button"
          onClick={() => void onAdd()}
          disabled={pending || status === 'loading'}
          className="min-h-12 flex-1 rounded-full bg-brand-ink px-6 font-bold text-white hover:bg-brand-deep disabled:opacity-60 sm:flex-none"
        >
          {pending ? 'Đang thêm…' : 'Thêm vào giỏ'}
        </button>
      </div>
      {message && (
        <p role="status" className={`text-sm ${message.ok ? 'text-brand-ink' : 'text-pink-ink'}`}>
          {message.text}{' '}
          {message.ok && <Link href="/gio-hang" className="inline-flex min-h-11 items-center font-bold underline">Xem giỏ hàng</Link>}
        </p>
      )}
    </div>
  );
}
