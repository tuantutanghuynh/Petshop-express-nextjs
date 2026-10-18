'use client';

import Link from 'next/link';
import { cartCount } from '../../lib/cart';
import { useCart } from './CartProvider';

// Header cart icon with the number of units. The count is part of the accessible name, so a screen
// reader hears "Giỏ hàng, 3 sản phẩm" rather than a bare number.
export function CartLink() {
  const { cart } = useCart();
  const count = cartCount(cart);
  return (
    <Link href="/gio-hang" aria-label={`Giỏ hàng, ${count} sản phẩm`} className="relative grid size-11 place-items-center rounded-full text-xl hover:bg-mint">
      <span aria-hidden="true">🛒</span>
      {count > 0 && (
        <span aria-hidden="true" className="absolute top-0.5 right-0.5 grid min-w-5 place-items-center rounded-full bg-orange-ink px-1 text-[0.7rem] font-bold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
