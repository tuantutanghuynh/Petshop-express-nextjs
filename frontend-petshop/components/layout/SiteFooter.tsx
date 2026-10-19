import Link from 'next/link';
import { categoryPath } from '../../lib/seo/structuredData';
import { SITE_DESCRIPTION, SITE_NAME } from '../../lib/site';
import type { Category } from '../../lib/types';
import type { ShopInfo } from '../../services/content';
import { CommunityBand, communityLinks } from './CommunityBand';
import { Logo } from './Logo';

type Props = { shop: ShopInfo; categories: Category[]; pages: { path: string; title: string }[] };

// Footer as in the wireframe: brand block + Mua sắm · Hỗ trợ khách hàng · Thông tin · Thanh toán.
// Contact lines come from shop_* settings, owner-written pages only when they have text — no
// placeholder text and no link that would answer 404.
function Column({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  if (links.length === 0) return null;
  return (
    <div>
      <h2 className="mb-2 text-base font-bold">{title}</h2>
      <ul>
        {links.map((l) => (
          <li key={l.href + l.label}><Link className="flex min-h-11 items-center text-sm hover:underline" href={l.href}>{l.label}</Link></li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter({ shop, categories, pages }: Props) {
  const year = new Date().getFullYear();
  const page = (path: string) => pages.find((p) => p.path === path);
  const about = page('/gioi-thieu');
  const policies = pages.filter((p) => p.path.startsWith('/chinh-sach/'));
  const contact = [shop.address && `📍 ${shop.address}`, shop.phone && `☎ ${shop.phone}`, shop.email && `✉ ${shop.email}`].filter(Boolean);

  return (
    // With the community band, the mint starts halfway down it (wireframe); without, plain mint.
    <footer className={`mt-12 ${communityLinks(shop).length > 0 ? 'bg-[linear-gradient(to_bottom,var(--surface)_3.5rem,var(--mint-soft)_3.5rem)]' : 'bg-mint-soft'}`}>
      <CommunityBand shop={shop} />
      <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 md:px-6 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
        <div className="col-span-2 flex flex-col gap-3 lg:col-span-1">
          <Logo />
          <p className="max-w-prose text-sm">{SITE_DESCRIPTION}</p>
          {contact.length > 0 && (
            <address className="flex flex-col gap-1 text-sm not-italic">
              {shop.address && <span>📍 {shop.address}</span>}
              {shop.phone && <a className="min-h-11 content-center hover:underline" href={`tel:${shop.phone.replace(/[^\d+]/g, '')}`}>☎ {shop.phone}</a>}
              {shop.email && <a className="min-h-11 content-center break-all hover:underline" href={`mailto:${shop.email}`}>✉ {shop.email}</a>}
              {shop.hours && <span>🕘 {shop.hours}</span>}
            </address>
          )}
        </div>
        <Column title="Mua sắm" links={[...categories.slice(0, 5).map((c) => ({ href: categoryPath(c.slug), label: c.name })), { href: '/san-pham', label: 'Tất cả sản phẩm' }]} />
        <Column title="Hỗ trợ khách hàng" links={[
          { href: '/tai-khoan', label: 'Tài khoản của tôi' },
          { href: '/tai-khoan', label: 'Đơn hàng của tôi' },
          { href: '/tu-van-bao-gia', label: 'Tư vấn báo giá' },
          { href: '/lien-he', label: 'Liên hệ' },
        ]} />
        <Column title="Thông tin" links={[
          ...(about ? [{ href: about.path, label: about.title }] : []),
          { href: '/blog', label: 'Kiến thức' },
          { href: '/gallery', label: 'Thư viện ảnh' },
          ...policies.map((p) => ({ href: p.path, label: p.title })),
        ]} />
        <div>
          <h2 className="mb-2 text-base font-bold">Thanh toán</h2>
          <ul className="flex flex-wrap gap-2 text-xs font-bold">
            <li className="rounded-full bg-surface px-3 py-1 text-brand-deep">COD</li>
            <li className="rounded-full bg-surface px-3 py-1 text-purple-ink">Chuyển khoản</li>
          </ul>
        </div>
      </div>
      <p className="border-t border-line px-4 py-4 text-center text-xs text-muted">© {year} {SITE_NAME}</p>
    </footer>
  );
}
