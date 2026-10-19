import Link from 'next/link';
import { SITE_DESCRIPTION, SITE_NAME } from '../../lib/site';
import type { ShopInfo } from '../../services/content';
import { CommunityBand, communityLinks } from './CommunityBand';
import { Logo } from './Logo';
import { NAV_LINKS } from './navLinks';

type Props = { shop: ShopInfo };

// Contact lines come from shop_* settings and are left out when empty — never placeholder text.
// The wireframe's newsletter band links to the shop's Zalo / social pages (no newsletter API).
export function SiteFooter({ shop }: Props) {
  const year = new Date().getFullYear();
  return (
    // With the community band, the mint starts halfway down it (wireframe); without, plain mint.
    <footer className={`mt-12 ${communityLinks(shop).length > 0 ? 'bg-[linear-gradient(to_bottom,var(--surface)_3.5rem,var(--mint-soft)_3.5rem)]' : 'bg-mint-soft'}`}>
      <CommunityBand shop={shop} />
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr]">
        <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-1">
          <Logo />
          <p className="max-w-prose text-sm">{SITE_DESCRIPTION}</p>
          <address className="flex flex-col gap-1 text-sm not-italic">
            {shop.address && <span>📍 {shop.address}</span>}
            {shop.phone && (
              <a className="min-h-11 content-center hover:underline" href={`tel:${shop.phone.replace(/[^\d+]/g, '')}`}>☎ {shop.phone}</a>
            )}
            {shop.email && (
              <a className="min-h-11 content-center hover:underline" href={`mailto:${shop.email}`}>✉ {shop.email}</a>
            )}
            {shop.hours && <span>🕘 {shop.hours}</span>}
          </address>
        </div>

        <div>
          <h2 className="mb-2 text-base font-bold">Thông tin</h2>
          <ul>
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link className="flex min-h-11 items-center text-sm hover:underline" href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <h2 className="mb-2 text-base font-bold">Thanh toán</h2>
            <ul className="flex flex-wrap gap-2 text-xs font-bold">
              <li className="rounded-full bg-surface px-3 py-1 text-brand-deep">COD</li>
              <li className="rounded-full bg-surface px-3 py-1 text-purple-ink">Chuyển khoản</li>
            </ul>
          </div>
          {shop.socialLinks.length > 0 && (
            <div>
              <h2 className="mb-2 text-base font-bold">Theo dõi</h2>
              <ul>
                {shop.socialLinks.map((url) => (
                  <li key={url}>
                    <a className="flex min-h-11 items-center text-sm break-all hover:underline" href={url} rel="noopener" target="_blank">
                      {new URL(url).hostname.replace(/^www\./, '')}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <p className="border-t border-line px-4 py-4 text-center text-xs text-muted">© {year} {SITE_NAME}</p>
    </footer>
  );
}
