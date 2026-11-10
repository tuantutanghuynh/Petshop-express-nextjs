'use client';

import Image from 'next/image';
import { useState } from 'react';
import { formatVnd, imageSrc, variantOffer } from '../../lib/storefront';
import { AddToCart } from '../cart/AddToCart';
import { AskQuoteButton } from '../quote/AskQuoteButton';
import type { ProductVariant } from '../../lib/types';

type Props = { variants: ProductVariant[]; phone?: string; product: { name: string; slug: string } };

const labelOf = (v: ProductVariant) => (typeof v.variantAttributes.label === 'string' ? v.variantAttributes.label : v.sku);

// Price and availability of the chosen variant. Starts on the cheapest variant that is in stock.
// The server HTML already contains that price, so crawlers and no-JS visitors see a real one.
// Variants are cards with their own price and discount, so the cheaper option is visible without
// trying each one. "Chỉ còn N" only when few are really left. The phone line stays as a second way
// to order.
export function VariantPicker({ variants, phone, product }: Props) {
  const [selectedId, setSelectedId] = useState(() => (variants.find((v) => variantOffer(v).inStock) ?? variants[0]).id);
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  const offer = variantOffer(selected);

  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
        <span className="text-2xl font-extrabold text-ink">{formatVnd(selected.price)}</span>
        {offer.discountPercent !== null && selected.compareAtPrice !== null && (
          <>
            <s className="text-muted">{formatVnd(selected.compareAtPrice)}</s>
            <span className="rounded-full bg-pink px-2 py-0.5 text-xs font-bold text-white">-{offer.discountPercent}%</span>
          </>
        )}
      </p>

      {variants.length > 1 && (
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-bold text-ink">Phân loại</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {variants.map((v) => {
              const o = variantOffer(v);
              const on = v.id === selectedId;
              const thumb = imageSrc(v.imageUrl);
              return (
                <label key={v.id}
                  className={`relative flex min-h-14 min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border p-2 text-sm has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-ink ${
                    on ? 'border-brand-ink bg-mint' : 'border-line bg-surface'
                  } ${o.inStock ? '' : 'opacity-60'}`}>
                  <input type="radio" name="variant" value={v.id} checked={on} onChange={() => setSelectedId(v.id)} className="sr-only" />
                  {thumb && (
                    <span className="relative size-10 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface-alt">
                      <Image src={thumb} alt="" fill sizes="40px" className="object-cover" />
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col leading-[1.3]">
                    <span className={`break-words ${on ? 'font-bold text-brand-deep' : 'text-ink'}`}>{labelOf(v)}</span>
                    <span className="text-xs text-muted tabular-nums">{o.inStock ? formatVnd(v.price) : 'Hết hàng'}</span>
                  </span>
                  {o.discountPercent !== null && o.inStock && (
                    <span className="absolute -top-2 right-1 rounded-full bg-pink px-1.5 text-[11px] leading-[1.4] font-bold text-white">-{o.discountPercent}%</span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <p role="status" className={`text-sm font-bold ${!offer.inStock ? 'text-pink-ink' : offer.lowStock !== null ? 'text-orange-text' : 'text-brand-ink'}`}>
        {!offer.inStock ? 'Tạm hết hàng' : offer.lowStock !== null ? `Chỉ còn ${offer.lowStock} sản phẩm` : '✔ Còn hàng'}
      </p>

      {/* key: a new variant starts again at quantity 1 */}
      <AddToCart key={selected.id} variantId={selected.id} available={offer.available} priceLabel={formatVnd(selected.price)} />

      <AskQuoteButton item={{ variantId: selected.id, productName: product.name, label: labelOf(selected), price: selected.price, slug: product.slug }} variant="button" />

      {phone && (
        <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-11 items-center text-sm font-bold text-brand-ink underline">
          ☎ Hoặc gọi đặt hàng: {phone}
        </a>
      )}
    </div>
  );
}
