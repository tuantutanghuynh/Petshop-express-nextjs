// Main navigation. Only routes that exist today: a link to a page that answers 404 wastes crawl
// budget and sends visitors nowhere. Shop, cart, account and contact join this list when their
// pages are built (design/wireframes/layout.js has the full target menu).
// shortLabel: for the phone tab bar, where five tabs share 320px. narrowHidden: dropped from the tab
// bar below 240px (200% zoom), so the remaining tabs keep a 44px target; it stays in the footer.
export type NavLink = { href: string; label: string; icon: string; shortLabel?: string; narrowHidden?: boolean };

export const NAV_LINKS: NavLink[] = [
  { href: '/', label: 'Trang chủ', icon: '🏠' },
  { href: '/blog', label: 'Kiến thức', icon: '📖' },
  { href: '/gallery', label: 'Thư viện ảnh', icon: '🖼', shortLabel: 'Thư viện', narrowHidden: true },
];

// "/blog/abc" keeps "Kiến thức" highlighted; "/" only matches itself.
export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
