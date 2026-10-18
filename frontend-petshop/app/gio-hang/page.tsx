import type { Metadata } from 'next';
import { CartView } from '../../components/cart/CartView';

// Private, per-customer page: not indexed (also disallowed in robots.txt). The cart is loaded in the
// browser through the BFF, since the session cookies are httpOnly.
export const metadata: Metadata = { title: 'Giỏ hàng', robots: { index: false, follow: false } };

export default function CartPage() {
  return (
    <main id="main" className="mx-auto max-w-[1200px] px-4 py-6">
      <h1 className="mb-6 text-2xl font-extrabold">Giỏ hàng</h1>
      <CartView />
    </main>
  );
}
