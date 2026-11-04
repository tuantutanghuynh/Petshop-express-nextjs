import Image from 'next/image';
import Link from 'next/link';
import { priceRange, statusLabel, stockSummary } from '../../../lib/adminProducts';
import { imageSrc } from '../../../lib/storefront';
import type { Product } from '../../../lib/types';
import { STATUS_TONE_CLASSES } from '../../orders/OrderStatusBadge';

type Props = { rows: Product[]; categoryLabel: (id: string) => string };

const TONE: Record<string, keyof typeof STATUS_TONE_CLASSES> = { active: 'ok', draft: 'off', archived: 'wait' };
const BADGE = 'inline-block rounded-full px-3 py-1 text-xs font-bold';

function Thumb({ product, size }: { product: Product; size: number }) {
  const src = imageSrc(product.images[0]?.url);
  return (
    <span className="relative grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] bg-surface-alt" style={{ width: size, height: size }}>
      {src ? <Image src={src} alt="" fill sizes={`${size}px`} className="object-cover" /> : <span aria-hidden="true">🐾</span>}
    </span>
  );
}

function Badges({ product }: { product: Product }) {
  const soldOut = stockSummary(product.variants).sellable <= 0;
  return (
    <span className="flex flex-wrap gap-1">
      <span className={`${BADGE} ${STATUS_TONE_CLASSES[TONE[product.status] ?? 'off']}`}>{statusLabel(product.status)}</span>
      {soldOut && <span className={`${BADGE} bg-pink-bg text-pink-ink`}>Hết hàng</span>}
    </span>
  );
}

// Cards on phones, a table from 768px (wireframe admin-products.html). Stock reads "tồn / giữ":
// what is on the shelf and how much of it waits on unpaid transfers.
export function ProductsList({ rows, categoryLabel }: Props) {
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((p) => {
          const s = stockSummary(p.variants);
          return (
            <li key={p.id}>
              <Link href={`/admin/san-pham/${p.id}`} className="flex gap-3 rounded-card border border-line bg-surface p-3 active:bg-surface-alt">
                <Thumb product={p} size={64} />
                <span className="flex min-w-0 flex-col gap-1">
                  <b className="break-words text-ink">{p.name}</b>
                  <small className="text-muted">{p.variants.length} biến thể · tồn {s.stock} (giữ {s.reserved})</small>
                  <small className="tabular-nums text-ink">{priceRange(p.variants)}</small>
                  <Badges product={p} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-left text-muted">
            <tr>
              <th className="p-3"><span className="sr-only">Ảnh</span></th><th className="p-3">Sản phẩm</th><th className="p-3">Danh mục</th>
              <th className="p-3">Trạng thái</th><th className="p-3 text-right">Giá</th><th className="p-3 text-right">Tồn / Đang giữ</th>
              <th className="p-3"><span className="sr-only">Thao tác</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const s = stockSummary(p.variants);
              return (
                <tr key={p.id} className="border-t border-line">
                  <td className="p-3"><Thumb product={p} size={48} /></td>
                  <td className="p-3"><b className="break-words text-ink">{p.name}</b><br /><small className="text-muted"><span className="break-all">{p.slug}</span> · <span className="whitespace-nowrap">{p.variants.length} biến thể</span></small></td>
                  <td className="p-3">{categoryLabel(p.category.id)}</td>
                  <td className="p-3"><Badges product={p} /></td>
                  <td className="p-3 text-right tabular-nums whitespace-nowrap">{priceRange(p.variants)}</td>
                  <td className={`p-3 text-right tabular-nums ${s.sellable <= 0 ? 'text-pink-ink' : ''}`}>{s.stock} / {s.reserved}</td>
                  <td className="p-3 text-right">
                    <Link href={`/admin/san-pham/${p.id}`} aria-label={`Sửa ${p.name}`} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 font-bold text-ink">Sửa</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
