import type { Metadata } from 'next';
import { CheckoutView } from '../../components/checkout/CheckoutView';
import { getBankInfo } from '../../services/content';

// Private page (noindex, disallowed in robots.txt). The bank account is public shop information
// read on the server; the cart and the order go through the BFF in the browser.
export const metadata: Metadata = { title: 'Đặt hàng', robots: { index: false, follow: false } };

export default async function CheckoutPage() {
  const bank = await getBankInfo();
  return (
    <main id="main" className="mx-auto min-h-dvh max-w-[1200px] px-4 py-6">
      <h1 className="mb-6 text-2xl font-extrabold">Đặt hàng</h1>
      <CheckoutView bank={bank} />
    </main>
  );
}
