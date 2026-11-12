import Link from 'next/link';
import { productPath } from '../../lib/seo/structuredData';
import { formatVnd } from '../../lib/storefront';
import type { Order } from '../../lib/types';

// Items and totals as they were when the order was placed (snapshots, not today's prices).
export function OrderItems({ order }: { order: Order }) {
  return (
    <section aria-labelledby="items-title" className="flex flex-col gap-3 tabular-nums">
      <h2 id="items-title" className="text-lg font-extrabold">Sản phẩm</h2>
      <ul className="flex flex-col">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-4 border-b border-line py-3 text-sm">
            <span className="min-w-0">
              <b className="text-ink">{item.productName}</b><br />{item.quantity} × {formatVnd(item.unitPrice)}
              {/* Reviews are for delivered orders only (ADR-027); the form lives on the product page. */}
              {order.orderStatus === 'COMPLETED' && item.product && (
                <><br /><Link href={`${productPath(item.product.slug)}#danh-gia`} className="inline-flex min-h-11 items-center font-bold text-brand-ink underline">★ Đánh giá sản phẩm</Link></>
              )}
            </span>
            <span className="shrink-0 font-bold text-ink">{formatVnd(item.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <p className="flex justify-between text-sm"><span>Tạm tính</span><span>{formatVnd(order.subtotal)}</span></p>
      <p className="flex justify-between text-sm">
        <span>Phí giao hàng</span>
        <span>{order.shippingFee > 0 ? formatVnd(order.shippingFee) : 'Cửa hàng báo khi xác nhận'}</span>
      </p>
      <p className="flex justify-between text-base font-extrabold text-ink"><span>Tổng</span><span>{formatVnd(order.grandTotal)}</span></p>
    </section>
  );
}
