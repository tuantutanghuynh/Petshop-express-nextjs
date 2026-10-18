import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OrderDetailView } from '../../../../components/orders/OrderDetailView';
import { isOrderCode } from '../../../../lib/orders';
import { getBankInfo } from '../../../../services/content';

export const metadata: Metadata = { title: 'Chi tiết đơn hàng', robots: { index: false, follow: false } };

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ moi?: string | string[] }> };

// The order itself is loaded in the browser (session cookies are httpOnly); ?moi=1 marks the
// redirect right after checkout so the page can say the order was placed.
export default async function OrderPage({ params, searchParams }: Props) {
  const [{ code }, { moi }] = await Promise.all([params, searchParams]);
  if (!isOrderCode(code)) notFound();
  const bank = await getBankInfo();
  return (
    <main id="main" className="mx-auto min-h-dvh max-w-[1200px] px-4 md:px-6 py-6">
      <OrderDetailView code={code} bank={bank} isNew={moi === '1'} />
    </main>
  );
}
