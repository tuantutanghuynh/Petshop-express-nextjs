import { MEGA_MENU_SLUGS } from '../../lib/megaMenu';

// Site navigation (wireframe layout.js). Every link points at a page that exists.
// narrowHidden: dropped from the phone tab bar below 240px (200% zoom) so the other tabs keep a 44px
// target; that page stays reachable from the ☰ menu.
export type NavLink = { href: string; label: string; icon: string; shortLabel?: string; narrowHidden?: boolean };

// Desktop menu row. The species mega menus ("Chó ▾", "Mèo ▾") sit before it (SiteHeader), since
// they come from the catalogue rather than from code.
export const MAIN_NAV: NavLink[] = [
  { href: '/', label: 'Trang chủ', icon: '🏠' },
  { href: '/san-pham', label: 'Sản phẩm', icon: '▦' },
  { href: '/blog', label: 'Kiến thức', icon: '📖' },
  { href: '/gallery', label: 'Thư viện ảnh', icon: '🖼' },
  { href: '/tu-van-bao-gia', label: 'Tư vấn báo giá', icon: '💬' },
  { href: '/lien-he', label: 'Liên hệ', icon: '☎' },
];

// Species with a mega menu, in menu order ("Chó ▾", "Mèo ▾").
export const FEATURED_CATEGORY_SLUGS = MEGA_MENU_SLUGS;

// Phone tab bar (wireframe): home, catalogue, articles, cart, account.
export const BOTTOM_TABS: NavLink[] = [
  { href: '/', label: 'Trang chủ', icon: '🏠' },
  { href: '/san-pham', label: 'Danh mục', icon: '▦' },
  { href: '/blog', label: 'Kiến thức', icon: '📖', narrowHidden: true },
  { href: '/gio-hang', label: 'Giỏ hàng', icon: '🛒' },
  { href: '/tai-khoan', label: 'Tài khoản', icon: '👤' },
];

// "/blog/abc" keeps "Kiến thức" highlighted; "/" only matches itself; /danh-muc/* counts as products.
export function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/san-pham' && (pathname.startsWith('/danh-muc/') || pathname.startsWith('/san-pham/'))) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}
