'use client';

import Link from 'next/link';
import { ADMIN_NAV, activeNavItem } from '../../../lib/adminNav';

// The admin menu (sidebar on desktop, drawer on phones). Pages not built yet are plain text marked
// "Sắp có" — never a link to a 404.
export function AdminNavList({ pathname }: { pathname: string }) {
  const current = activeNavItem(pathname);
  return (
    <ul className="flex flex-col gap-1">
      {ADMIN_NAV.map((item) => {
        const row = 'flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] px-3 text-sm';
        if (!item.ready) {
          return (
            <li key={item.href}>
              <span aria-disabled="true" className={`${row} text-white/40`}>
                <span aria-hidden="true" className="w-6 shrink-0 text-center text-base">{item.icon}</span>{item.label}<span className="ml-auto text-xs">Sắp có</span>
              </span>
            </li>
          );
        }
        const active = current?.href === item.href;
        return (
          <li key={item.href}>
            <Link href={item.href} aria-current={active ? 'page' : undefined}
              className={`${row} ${active ? 'bg-white/10 font-bold text-white' : 'text-white/80 hover:bg-white/5 hover:text-white'}`}>
              <span aria-hidden="true" className="w-6 shrink-0 text-center text-base">{item.icon}</span>{item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
