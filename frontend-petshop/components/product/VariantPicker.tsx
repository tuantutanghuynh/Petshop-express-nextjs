'use client';

import { useState } from 'react';
import { formatVnd } from '../../lib/storefront';
import { AddToCart } from '../cart/AddToCart';
import { AskQuoteButton } from '../quote/AskQuoteButton';
import type { ProductVariant } from '../../lib/types';

type Props = { variants: ProductVariant[]; phone?: string; product: { name: string; slug: string } };

const available = (v: ProductVariant) => v.stockQuantity - v.reservedQuantity > 0;
const labelOf = (v: ProductVariant) => (typeof v.variantAttributes.label === 'string' ? v.variantAttributes.label : v.sku);

// Price and availability of the chosen variant. Starts on the cheapest variant that is in stock.
// The server HTML already contains that price, so crawlers and no-JS visitors see a real one.
// The shop's phone line stays as a second way to order.
export function VariantPicker({ variants, phone, product }: Props) {
  const [selectedId, setSelectedId] = useState(() => (variants.find(available) ?? variants[0]).id);
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  const inStock = available(selected);
  const discounted = selected.compareAtPrice !== null && selected.compareAtPrice > selected.price;

  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-wrap items-baseline gap-x-3 tabular-nums">
        <span className="text-2xl font-extrabold text-ink">{formatVnd(selected.price)}</span>
        {discounted && selected.compareAtPrice !== null && (
          <s className="text-muted">{formatVnd(selected.compareAtPrice)}</s>
        )}
      </p>

      {variants.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-sm font-bold text-ink">Phân loại</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <label
                key={v.id}
                className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-ink ${
                  v.id === selectedId ? 'border-brand-ink bg-mint font-bold text-brand-deep' : 'border-line'
                } ${available(v) ? '' : 'text-muted line-through'}`}
              >
                <input
                  type="radio"
                  name="variant"
                  value={v.id}
                  checked={v.id === selectedId}
                  onChange={() => setSelectedId(v.id)}
                  className="sr-only"
                />
                {labelOf(v)}
                {!available(v) && <span className="sr-only"> (hết hàng)</span>}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <p role="status" className={`text-sm font-bold ${inStock ? 'text-brand-ink' : 'text-pink-ink'}`}>
        {inStock ? '✔ Còn hàng' : 'Tạm hết hàng'}
      </p>

      {/* key: a new variant starts again at quantity 1 */}
      <AddToCart key={selected.id} variantId={selected.id} available={selected.stockQuantity - selected.reservedQuantity} priceLabel={formatVnd(selected.price)} />

      <AskQuoteButton item={{ variantId: selected.id, productName: product.name, label: labelOf(selected), price: selected.price, slug: product.slug }} variant="button" />

      {phone && (
        <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-11 items-center text-sm font-bold text-brand-ink underline">
          ☎ Hoặc gọi đặt hàng: {phone}
        </a>
      )}
    </div>
  );
}
