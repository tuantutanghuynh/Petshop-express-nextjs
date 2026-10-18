'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { lineIssue, maxQuantity, variantLabel } from '../../lib/cart';
import { productPath } from '../../lib/seo/structuredData';
import { formatVnd, imageSrc } from '../../lib/storefront';
import type { CartLine } from '../../lib/types';
import { QuantityStepper } from '../ui/QuantityStepper';
import { useCart } from './CartProvider';

export function CartLineItem({ line }: { line: CartLine }) {
  const { updateQuantity, removeItem } = useCart();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const issue = lineIssue(line);
  const src = imageSrc(line.variant.imageUrl);

  async function run(action: () => ReturnType<typeof removeItem>) {
    setPending(true);
    setError(null);
    const res = await action();
    setPending(false);
    if (!res.ok) setError(res.error.message ?? 'Chưa cập nhật được, vui lòng thử lại.');
  }

  return (
    <li className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 tabular-nums border-b border-line py-4 sm:grid-cols-[96px_minmax(0,1fr)]">
      <div className="relative aspect-square overflow-hidden rounded-card bg-surface-alt">
        {src ? <Image src={src} alt="" fill sizes="96px" className="object-cover" /> : <span aria-hidden="true" className="grid h-full place-items-center text-2xl">🐾</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-x-4">
          <div className="min-w-0">
            <Link href={productPath(line.product.slug)} className="-my-3 inline-block py-3 font-bold text-ink hover:underline">{line.product.name}</Link>
            <p className="text-sm text-muted">{variantLabel(line.variant)} · {formatVnd(line.unitPrice)}</p>
          </div>
          <p className="font-extrabold text-ink">{formatVnd(line.lineTotal)}</p>
        </div>
        {issue && <p className="text-sm text-pink-ink">{issue}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <QuantityStepper
            label={`Số lượng ${line.product.name}`}
            value={line.quantity}
            max={Math.max(line.quantity, maxQuantity(line.available))}
            disabled={pending}
            onChange={(q) => void run(() => updateQuantity(line.id, q))}
          />
          <button type="button" disabled={pending} onClick={() => void run(() => removeItem(line.id))} className="min-h-11 px-2 text-sm font-bold text-pink-ink underline disabled:opacity-50">
            Xoá
          </button>
        </div>
        {error && <p role="alert" className="text-sm text-pink-ink">{error}</p>}
      </div>
    </li>
  );
}
