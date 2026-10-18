'use client';

import Link from 'next/link';
import { cartCount } from '../../lib/cart';
import { formatVnd } from '../../lib/storefront';
import { EmptyState } from '../ui/EmptyState';
import { StickyActionBar } from '../ui/StickyActionBar';
import { CartLineItem } from './CartLineItem';
import { useCart } from './CartProvider';

// The cart page body: loading, signed out, error, empty and the cart itself.
export function CartView() {
  const { status, cart, reload } = useCart();

  if (status === 'loading') {
    return (
      <div aria-busy="true" aria-label="Đang tải giỏ hàng" className="flex flex-col gap-3">
        {[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-card bg-surface-alt" />)}
      </div>
    );
  }
  if (status === 'signedOut') {
    return (
      <div className="flex flex-col items-start gap-3">
        <p>Đăng nhập để xem và lưu giỏ hàng của bạn.</p>
        <Link href="/dang-nhap?next=%2Fgio-hang" className="inline-flex min-h-12 items-center rounded-full bg-brand-ink px-6 font-bold text-white">Đăng nhập</Link>
      </div>
    );
  }
  if (status === 'error' || !cart) {
    return (
      <div className="flex flex-col items-start gap-3">
        <EmptyState tone="error" message="Chưa tải được giỏ hàng." />
        <button type="button" onClick={() => void reload()} className="min-h-11 rounded-full border border-line px-5 font-bold">Thử lại</button>
      </div>
    );
  }
  if (cart.items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <EmptyState message="Giỏ hàng đang trống." />
        <Link href="/" className="inline-flex min-h-11 items-center font-bold text-brand-ink underline">Tiếp tục mua sắm</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
      <ul aria-label="Sản phẩm trong giỏ">{cart.items.map((line) => <CartLineItem key={line.id} line={line} />)}</ul>
      <section aria-labelledby="summary-title" className="flex flex-col gap-3 rounded-panel bg-surface-alt p-5 tabular-nums">
        <h2 id="summary-title" className="text-lg font-extrabold">Tóm tắt</h2>
        <p className="flex justify-between"><span>Tạm tính ({cartCount(cart)} sản phẩm)</span><b className="text-ink">{formatVnd(cart.subtotal)}</b></p>
        <p className="text-sm text-muted">Phí giao hàng được báo khi cửa hàng xác nhận đơn.</p>
        {cart.hasIssues ? (
          <p role="status" className="rounded-card bg-pink-bg p-3 text-sm text-pink-ink">Một số sản phẩm cần điều chỉnh trước khi đặt hàng.</p>
        ) : (
          <Link href="/dat-hang" className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand-ink px-6 font-bold text-white hover:bg-brand-deep">
            Đặt hàng
          </Link>
        )}
      </section>
      {!cart.hasIssues && (
        <StickyActionBar label="Đặt hàng">
          <span className="text-sm">Tạm tính <b className="block text-base text-ink tabular-nums">{formatVnd(cart.subtotal)}</b></span>
          <Link href="/dat-hang" className="inline-flex min-h-12 items-center rounded-full bg-brand-ink px-6 font-bold text-white">Đặt hàng</Link>
        </StickyActionBar>
      )}
    </div>
  );
}
