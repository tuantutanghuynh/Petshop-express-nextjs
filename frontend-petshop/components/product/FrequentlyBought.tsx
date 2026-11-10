'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { bundleSelection, defaultVariantId, type BundleLine } from '../../lib/bundle';
import { productPath } from '../../lib/seo/structuredData';
import { formatVnd, imageSrc, variantOffer } from '../../lib/storefront';
import type { RelatedProduct } from '../../lib/types';
import { useCart } from '../cart/CartProvider';

type Item = RelatedProduct;
const labelOf = (v: Item['variants'][number]) => (typeof v.variantAttributes.label === 'string' ? v.variantAttributes.label : v.sku);

// "Thường mua kèm" (ADR-026): this product plus the ones the admin picked. Each line can be ticked
// off and has its own variant choice (cheapest in stock first); one button adds the ticked ones.
// The list and its links are in the server HTML; only ticking and the total run in the browser.
export function FrequentlyBought({ main, related }: { main: Item; related: Item[] }) {
  const items = [main, ...related];
  const router = useRouter();
  const pathname = usePathname();
  const { status, addItem } = useCart();
  const [lines, setLines] = useState<BundleLine[]>(() =>
    items.map((p) => { const variantId = defaultVariantId(p.variants); return { key: p.id, name: p.name, variants: p.variants, variantId, checked: variantId !== null }; }),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const selection = bundleSelection(lines);
  const update = (key: string, patch: Partial<BundleLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function addAll() {
    if (status === 'signedOut') return router.push(`/dang-nhap?next=${encodeURIComponent(pathname)}`);
    setBusy(true);
    setMessage(null);
    const failed: string[] = [];
    // One call per item through the cart API the page already uses; one that fails (sold out a
    // moment ago) is named, the others stay in the cart.
    for (const l of lines) {
      if (!l.checked || !l.variantId || !selection.variantIds.includes(l.variantId)) continue;
      const res = await addItem(l.variantId, 1);
      if (!res.ok && (res.error.code === 'UNAUTHENTICATED' || res.error.code === 'ACCESS_EXPIRED')) {
        setBusy(false);
        return router.push(`/dang-nhap?next=${encodeURIComponent(pathname)}`);
      }
      if (!res.ok) failed.push(l.name);
    }
    setBusy(false);
    const added = selection.count - failed.length;
    setMessage(failed.length === 0
      ? { ok: true, text: `Đã thêm ${added} sản phẩm vào giỏ hàng.` }
      : { ok: false, text: `Đã thêm ${added} sản phẩm. Chưa thêm được: ${failed.join(', ')} (có thể vừa hết hàng).` });
  }

  return (
    <section aria-labelledby="bundle-title" className="mt-10">
      <h2 id="bundle-title" className="mb-3 text-xl leading-[1.3] font-extrabold">Thường mua kèm</h2>
      <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
        {items.map((p, i) => {
          const l = lines[i];
          const src = imageSrc(p.images[0]?.url ?? p.variants[0]?.imageUrl);
          const chosen = p.variants.find((v) => v.id === l.variantId);
          const sellable = l.variantId !== null;
          return (
            <li key={p.id} className="flex items-start gap-3 p-3">
              <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
                <input type="checkbox" checked={l.checked} disabled={!sellable} onChange={(e) => update(p.id, { checked: e.target.checked })}
                  aria-label={`Chọn ${p.name}`} className="size-5 accent-brand-ink" />
              </label>
              <span className="relative size-14 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface-alt">
                {src ? <Image src={src} alt="" fill sizes="56px" className="object-cover" /> : <span aria-hidden="true" className="grid h-full place-items-center">🐾</span>}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                {i === 0 ? (
                  <span className="text-sm leading-[1.4] font-bold break-words">{p.name} <span className="text-xs font-normal text-muted">(sản phẩm này)</span></span>
                ) : (
                  <Link href={productPath(p.slug)} className="text-sm leading-[1.4] font-bold break-words text-ink underline-offset-2 hover:underline">{p.name}</Link>
                )}
                {p.variants.length > 1 && sellable && (
                  <select aria-label={`Phân loại của ${p.name}`} value={l.variantId ?? ''} onChange={(e) => update(p.id, { variantId: e.target.value })}
                    className="min-h-11 w-full max-w-64 rounded-[var(--radius-sm)] border border-line bg-surface px-2 text-base">
                    {p.variants.map((v) => (
                      <option key={v.id} value={v.id} disabled={!variantOffer(v).inStock}>{labelOf(v)} · {variantOffer(v).inStock ? formatVnd(v.price) : 'hết hàng'}</option>
                    ))}
                  </select>
                )}
                <span className="text-sm font-extrabold tabular-nums">{chosen && sellable ? formatVnd(chosen.price) : <span className="font-bold text-pink-ink">Tạm hết hàng</span>}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted">Tổng cộng ({selection.count} sản phẩm): <b className="text-lg text-ink tabular-nums">{formatVnd(selection.total)}</b></p>
        <button type="button" onClick={() => void addAll()} disabled={busy || selection.count === 0 || status === 'loading'}
          className="min-h-12 w-full rounded-full bg-brand-ink px-6 font-bold text-white hover:bg-brand-deep disabled:opacity-60 md:w-auto">
          {busy ? 'Đang thêm…' : `Thêm ${selection.count} sản phẩm vào giỏ`}
        </button>
      </div>
      {message && (
        <p role="status" className={`mt-2 text-sm ${message.ok ? 'text-brand-ink' : 'text-pink-ink'}`}>
          {message.text}{' '}
          {message.ok && <Link href="/gio-hang" className="inline-flex min-h-11 items-center font-bold underline">Xem giỏ hàng</Link>}
        </p>
      )}
    </section>
  );
}
