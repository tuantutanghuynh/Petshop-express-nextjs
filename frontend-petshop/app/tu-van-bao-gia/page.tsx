import type { Metadata } from 'next';
import { QuoteView } from '../../components/quote/QuoteView';
import { Breadcrumb } from '../../components/ui/Breadcrumb';

// A form page tied to the visitor's own list: not indexed.
export const metadata: Metadata = { title: 'Tư vấn báo giá', robots: { index: false, follow: true } };

export default function QuotePage() {
  return (
    <main id="main" className="mx-auto min-h-dvh max-w-[1200px] px-4 pb-8 md:px-6">
      <Breadcrumb crumbs={[{ name: 'Trang chủ', path: '/' }, { name: 'Tư vấn báo giá' }]} />
      <h1 className="text-[clamp(1.5rem,1.1rem+1.6vw,2.1rem)] font-extrabold">Nhờ shop tư vấn &amp; báo giá</h1>
      <p className="mt-2 mb-6 max-w-prose">Không cần tài khoản. Để lại số điện thoại, shop gọi lại để tư vấn và chốt đơn.</p>
      <QuoteView />
    </main>
  );
}
