'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCart } from '../cart/CartProvider';

type Props = { productName: string; href: string; variantId: string | null; isOutOfStock: boolean };

// The action in a product card's corner (wireframe): 🛒 adds a single-variant product straight to the
// cart; "›" opens the product page when a variant must be chosen; "Hỏi giá" when nothing is in stock.
// Sits above the card's stretched link (z-10) so it is its own tap target.
export function CardAction({ productName, href, variantId, isOutOfStock }: Props) {
  const { status, addItem } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<'idle' | 'adding' | 'added' | 'failed'>('idle');
  const square = 'relative z-10 grid size-11 shrink-0 place-items-center rounded-card text-lg font-bold';

  if (isOutOfStock) {
    return <Link href={href} className="relative z-10 inline-flex min-h-11 shrink-0 items-center rounded-full bg-mint px-3 text-xs font-bold text-brand-deep">Hỏi giá</Link>;
  }
  if (!variantId) {
    return <Link href={href} aria-label={`Chọn phân loại: ${productName}`} className={`${square} bg-brand-ink text-white`}>›</Link>;
  }

  async function add() {
    if (status === 'signedOut') {
      router.push(`/dang-nhap?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setState('adding');
    const res = await addItem(variantId as string, 1);
    setState(res.ok ? 'added' : 'failed');
    if (!res.ok && (res.error.code === 'UNAUTHENTICATED' || res.error.code === 'ACCESS_EXPIRED')) {
      router.push(`/dang-nhap?next=${encodeURIComponent(pathname)}`);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void add()}
        disabled={state === 'adding' || status === 'loading'}
        aria-label={`Thêm vào giỏ: ${productName}`}
        className={`${square} bg-brand-ink text-white disabled:opacity-60`}
      >
        <span aria-hidden="true">{state === 'added' ? '✓' : '🛒'}</span>
      </button>
      <span role="status" className="sr-only">
        {state === 'added' ? `Đã thêm ${productName} vào giỏ` : state === 'failed' ? 'Chưa thêm được, vui lòng thử lại' : ''}
      </span>
    </>
  );
}
