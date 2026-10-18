'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cartCount } from '../../lib/cart';
import { useCart } from '../cart/CartProvider';
import { NAV_LINKS, isActive, type NavLink } from './navLinks';

// Phone tab bar (hidden from 768px, where the header nav row takes over). Sits above the iPhone
// home indicator via safe-area-inset-bottom; the page reserves the same space (see layout).
const CART_TAB: NavLink = { href: '/gio-hang', label: 'Giỏ hàng', icon: '🛒' };

export function BottomNav() {
  const pathname = usePathname();
  const count = cartCount(useCart().cart);
  const tabs = [...NAV_LINKS, CART_TAB];
  return (
    <nav aria-label="Điều hướng nhanh" className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] ${active ? 'font-bold text-brand-ink' : 'text-muted'}`}
              >
                <span aria-hidden="true" className="relative text-xl leading-none">
                  {link.icon}
                  {link === CART_TAB && count > 0 && (
                    <span className="absolute -top-1 -right-3 grid min-w-4 place-items-center rounded-full bg-orange-ink px-1 text-[0.6rem] font-bold text-white">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </span>
                {link === CART_TAB && count > 0 ? <span>{link.label}<span className="sr-only">, {count} sản phẩm</span></span> : link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
