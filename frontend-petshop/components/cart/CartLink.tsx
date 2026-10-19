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
    <Link href="/gio-hang" aria-label={`Giỏ hàng, ${count} sản phẩm`} className="flex min-h-11 min-w-11 flex-col items-center justify-center rounded-card px-2 text-ink hover:bg-mint">
      <span aria-hidden="true" className="relative text-xl leading-none">
        🛒
        {count > 0 && (
          <span className="absolute -top-2 -right-3 grid min-w-5 place-items-center rounded-full bg-orange-ink px-1 text-xs font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </span>
      {/* Label under the icon from 768px (wireframe); phones show the icon only. */}
      <span aria-hidden="true" className="hidden text-xs font-bold md:block">Giỏ hàng</span>
    </Link>
  );
}
