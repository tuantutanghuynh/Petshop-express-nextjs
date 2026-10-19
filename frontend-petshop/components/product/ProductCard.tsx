import Image from 'next/image';
import Link from 'next/link';
import { productPath } from '../../lib/seo/structuredData';
import { formatVnd, imageSrc, priceSummary } from '../../lib/storefront';
import { CardAction } from './CardAction';
import type { Product } from '../../lib/types';

// Product tile: first image, name, cheapest price ("từ" when variants differ), a real discount
// tag only when compareAtPrice is higher, and "Hết hàng" from stock minus reservations.
// No star rating (there are no reviews). The whole card is one link (the name is the link text, so
// screen readers hear the product name); the corner action is a separate button above it.
export function ProductCard({ product }: { product: Product }) {
  const summary = priceSummary(product.variants);
  const cover = product.images[0];
  const src = imageSrc(cover?.url ?? product.variants[0]?.imageUrl);
  return (
    <article className="relative flex h-full flex-col gap-2 rounded-card bg-surface p-3 shadow-card transition-shadow hover:shadow-md">
      <div className="relative aspect-square overflow-hidden rounded-card bg-surface-alt">
        {src ? (
          <Image src={src} alt={cover?.altText || product.name} fill sizes="(min-width: 1024px) 220px, (min-width: 768px) 30vw, 45vw" className="object-cover" />
        ) : (
          <span aria-hidden="true" className="grid h-full place-items-center text-4xl">🐾</span>
        )}
        {summary?.discountPercent && (
          <span className="absolute top-2 left-2 rounded-full bg-pink px-2 py-0.5 text-xs font-bold text-white">-{summary.discountPercent}%</span>
        )}
        {summary?.isOutOfStock && (
          <span className="absolute top-2 right-2 rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-white">Hết hàng</span>
        )}
      </div>
      <h3 className="line-clamp-2 text-sm font-bold">
        {/* The ::after overlay stretches this link over the whole card (one tab stop, big target). */}
        <Link href={productPath(product.slug)} className="after:absolute after:inset-0 after:rounded-card">{product.name}</Link>
      </h3>
      {summary && (
        <div className="mt-auto flex items-end justify-between gap-2">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 tabular-nums">
            <span className="font-extrabold text-ink">
              {summary.hasRange && <small className="font-normal">từ </small>}
              {formatVnd(summary.price)}
            </span>
            {summary.compareAtPrice && <s className="text-xs text-muted">{formatVnd(summary.compareAtPrice)}</s>}
          </p>
          <CardAction
            productName={product.name}
            href={productPath(product.slug)}
            variantId={product.variants.length === 1 ? product.variants[0].id : null}
            isOutOfStock={summary.isOutOfStock}
          />
        </div>
      )}
    </article>
  );
}
