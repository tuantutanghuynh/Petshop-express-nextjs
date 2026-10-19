import Image from 'next/image';
import Link from 'next/link';
import { categoryPath, productPath } from '../../lib/seo/structuredData';
import { formatVnd, imageSrc, priceSummary } from '../../lib/storefront';
import type { Product } from '../../lib/types';

type Props = { products: Product[]; category: { name: string; slug: string } };

// Informational post → a few products of the same topic (seo.md: link the content cluster to its
// category). Only rendered when the post's topic is one of the shop's categories.
export function RelatedProducts({ products, category }: Props) {
  if (products.length === 0) return null;
  return (
    <section aria-labelledby="rel-products" className="flex flex-col gap-3 rounded-card bg-surface p-5 shadow-card">
      <h2 id="rel-products" className="text-base font-bold">Sản phẩm liên quan</h2>
      <ul className="flex flex-col gap-3">
        {products.map((p) => {
          const src = imageSrc(p.images[0]?.url);
          const price = priceSummary(p.variants);
          return (
            <li key={p.id}>
              <Link href={productPath(p.slug)} className="flex items-center gap-3 hover:underline">
                <span className="relative size-14 shrink-0 overflow-hidden rounded-card bg-surface-alt">
                  {src ? <Image src={src} alt="" fill sizes="56px" className="object-cover" /> : <span aria-hidden="true" className="grid h-full place-items-center">🐾</span>}
                </span>
                <span className="min-w-0 text-sm">
                  <span className="line-clamp-2 text-ink">{p.name}</span>
                  {price && <b className="text-ink tabular-nums">{formatVnd(price.price)}</b>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link href={categoryPath(category.slug)} className="inline-flex min-h-11 items-center justify-center rounded-full border border-brand-ink px-4 font-bold text-brand-ink hover:bg-mint">
        Xem danh mục {category.name}
      </Link>
    </section>
  );
}
