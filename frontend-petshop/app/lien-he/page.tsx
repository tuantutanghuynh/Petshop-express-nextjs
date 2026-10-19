import type { Metadata } from 'next';
import { ContactForm } from '../../components/contact/ContactForm';
import { JsonLd } from '../../components/seo/JsonLd';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import { zaloHref } from '../../lib/settings';
import { breadcrumbJsonLd, type Crumb } from '../../lib/seo/structuredData';
import { SITE_NAME, siteUrl } from '../../lib/site';
import { getShopInfo } from '../../services/content';

// Search intent: navigational. Contact lines come from /admin/cau-hinh; missing ones are left out.
export const metadata: Metadata = {
  title: 'Liên hệ',
  description: `Hotline, Zalo, địa chỉ và giờ mở cửa của ${SITE_NAME}.`,
  alternates: { canonical: '/lien-he' },
};

export default async function ContactPage() {
  const shop = await getShopInfo();
  const zalo = zaloHref(shop.zalo);
  const crumbs: Crumb[] = [{ name: 'Trang chủ', path: '/' }, { name: 'Liên hệ' }];
  const row = 'flex min-h-11 items-center gap-3';
  return (
    <main id="main" className="mx-auto max-w-[1200px] px-4 pb-8 md:px-6">
      <JsonLd data={breadcrumbJsonLd(siteUrl(), crumbs)} />
      <Breadcrumb crumbs={crumbs} />
      <h1 className="mb-6 text-[clamp(1.5rem,1.1rem+1.6vw,2.1rem)] font-extrabold">Liên hệ</h1>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <address className="flex flex-col gap-1 rounded-panel bg-mint p-5 not-italic">
          <b className="mb-1 text-lg text-ink">{SITE_NAME}</b>
          {shop.phone && <a className={row} href={`tel:${shop.phone.replace(/[^\d+]/g, '')}`}>☎ <span className="font-bold text-ink">{shop.phone}</span></a>}
          {zalo && <a className={row} href={zalo} target="_blank" rel="noopener">💬 <span className="font-bold text-ink">Nhắn Zalo</span></a>}
          {shop.email && <a className={row} href={`mailto:${shop.email}`}>✉ <span className="break-all text-ink">{shop.email}</span></a>}
          {shop.address && <span className={row}>📍 {shop.address}</span>}
          {shop.hours && <span className={row}>🕘 {shop.hours}</span>}
          {!shop.phone && !shop.email && !shop.address && <span className="text-sm text-brand-deep">Gửi tin nhắn bằng form bên cạnh, shop sẽ trả lời sớm.</span>}
        </address>
        <section aria-labelledby="form-title">
          <h2 id="form-title" className="mb-4 text-xl font-extrabold">Gửi tin nhắn</h2>
          <ContactForm />
        </section>
      </div>
    </main>
  );
}
