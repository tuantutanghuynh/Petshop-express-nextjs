import { zaloHref } from '../../lib/settings';
import type { ShopInfo } from '../../services/content';
import { NewsletterForm } from './NewsletterForm';

function socialName(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (host.includes('facebook')) return 'Theo dõi Facebook';
  if (host.includes('instagram')) return 'Theo dõi Instagram';
  if (host.includes('tiktok')) return 'Xem TikTok';
  if (host.includes('youtube')) return 'Xem YouTube';
  return host;
}

export function communityLinks(shop: ShopInfo): { href: string; label: string }[] {
  const zalo = zaloHref(shop.zalo);
  return [...(zalo ? [{ href: zalo, label: 'Kết bạn Zalo' }] : []), ...shop.socialLinks.map((href) => ({ href, label: socialName(href) }))];
}

// Wireframe's newsletter band (spec 2026-11-07): always shown, with the email signup; the shop's
// Zalo / social pages follow as smaller buttons when set.
export function CommunityBand({ shop }: { shop: ShopInfo }) {
  const links = communityLinks(shop);
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6">
      <section aria-labelledby="community-title" className="grid items-center gap-4 rounded-panel bg-brand-ink p-6 text-white md:grid-cols-[120px_minmax(0,1fr)] md:p-8 lg:grid-cols-[120px_minmax(0,1fr)_minmax(0,30rem)]">
        <span aria-hidden="true" className="hidden aspect-square place-items-center rounded-card bg-white/20 text-5xl md:row-span-2 md:grid lg:row-span-1">🐾</span>
        <div>
          {/* Colour on the span: globals.css colours h1–h4 outside any layer, which beats a class on the h2. */}
          <h2 id="community-title" className="text-xl leading-[1.3] font-extrabold"><span className="text-white">Gia nhập cộng đồng yêu thú cưng!</span></h2>
          <p className="mt-1 text-white/90">Nhận mẹo chăm sóc và ưu đãi mới nhất qua email.</p>
        </div>
        <div className="flex flex-col gap-3">
          <NewsletterForm />
          {links.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Theo dõi cửa hàng">
              {links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-full border border-white/60 px-4 text-sm font-bold text-white hover:bg-white/10">{l.label}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
