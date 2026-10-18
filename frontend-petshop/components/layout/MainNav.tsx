'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_LINKS, isActive } from './navLinks';

// Desktop / tablet nav row. Client component only for usePathname (the current-page highlight);
// the links themselves are plain anchors in the server HTML, so crawlers see them.
export function MainNav() {
  const pathname = usePathname();
  return (
    <ul className="flex gap-1 overflow-x-auto">
      {NAV_LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-11 items-center rounded-full px-4 text-sm font-bold whitespace-nowrap transition-colors hover:bg-mint ${active ? 'text-brand-ink' : 'text-ink'}`}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
