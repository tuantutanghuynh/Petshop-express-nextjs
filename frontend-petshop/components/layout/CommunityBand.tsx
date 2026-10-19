import { zaloHref } from '../../lib/settings';
import type { ShopInfo } from '../../services/content';

// Wireframe's newsletter band. There is no newsletter API, so — as the wireframe note says — it links
// to the shop's real Zalo / social pages instead of collecting emails. Hidden when none is set.
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

export function CommunityBand({ shop }: { shop: ShopInfo }) {
  const links = communityLinks(shop);
  if (links.length === 0) return null;
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6">
      <section aria-labelledby="community-title" className="grid items-center gap-4 rounded-panel bg-brand-ink p-6 text-white md:grid-cols-[120px_1fr_auto] md:p-8">
        <span aria-hidden="true" className="hidden aspect-square place-items-center rounded-card bg-white/20 text-5xl md:grid">🐾</span>
        <div>
          <h2 id="community-title" className="text-xl font-extrabold text-white">Gia nhập cộng đồng yêu thú cưng!</h2>
          <p className="mt-1 text-white/90">Nhận mẹo chăm sóc và ưu đãi mới nhất.</p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel="noopener" className="inline-flex min-h-12 items-center rounded-full bg-yellow px-5 font-bold text-ink hover:brightness-95">{l.label}</a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
