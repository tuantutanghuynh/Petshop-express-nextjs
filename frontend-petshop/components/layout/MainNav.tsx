'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActive, type NavLink } from './navLinks';

// Desktop menu links. Client component only for the current-page highlight; the links are plain
// anchors in the server HTML, so crawlers see them.
export function MainNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {links.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <li key={link.href} className="shrink-0">
            <Link
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-11 items-center rounded-full px-3 text-sm font-bold whitespace-nowrap hover:bg-mint ${active ? 'text-brand-ink underline decoration-2 underline-offset-8' : 'text-ink'}`}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
