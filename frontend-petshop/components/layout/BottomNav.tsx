'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cartCount } from '../../lib/cart';
import { useCart } from '../cart/CartProvider';
import { BOTTOM_TABS, isActive } from './navLinks';

// Phone tab bar (wireframe: Trang chủ · Danh mục · Kiến thức · Giỏ hàng · Tài khoản), hidden from 768px
// where the header menu takes over. Sits above the iPhone home indicator (safe-area-inset-bottom);
// StoreChrome reserves the same space under the page.
export function BottomNav() {
  const pathname = usePathname();
  const count = cartCount(useCart().cart);
  return (
    <nav aria-label="Điều hướng nhanh" className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="flex">
        {BOTTOM_TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const isCart = tab.href === '/gio-hang';
          return (
            <li key={tab.href} className={`min-w-0 flex-1 ${tab.narrowHidden ? 'max-[239px]:hidden' : ''}`}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${active ? 'font-bold text-brand-ink' : 'text-muted'}`}
              >
                <span aria-hidden="true" className="relative text-xl leading-none">
                  {tab.icon}
                  {isCart && count > 0 && (
                    <span className="absolute -top-1 -right-3 grid min-w-4 place-items-center rounded-full bg-orange-ink px-1 text-xs font-bold text-white">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate">
                  {tab.label}
                  {isCart && count > 0 && <span className="sr-only">, {count} sản phẩm</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
