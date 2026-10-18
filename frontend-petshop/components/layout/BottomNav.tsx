'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_LINKS, isActive } from './navLinks';

// Phone tab bar (hidden from 768px, where the header nav row takes over). Sits above the iPhone
// home indicator via safe-area-inset-bottom; the page reserves the same space (see layout).
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Điều hướng nhanh" className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${NAV_LINKS.length}, minmax(0, 1fr))` }}>
        {NAV_LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] ${active ? 'font-bold text-brand-ink' : 'text-muted'}`}
              >
                <span aria-hidden="true" className="text-xl leading-none">{link.icon}</span>
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
