'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type Props = { header: ReactNode; footer: ReactNode; bottomNav: ReactNode; children: ReactNode };

// The storefront header / footer wrap every page except the admin, which has its own shell.
// The header and footer stay Server Components: they are passed in as already-rendered props,
// and this client wrapper only decides whether to show them.
// (A route group such as app/(store)/ would do this without a client check, but it means moving
// the existing blog and gallery folders — left for a separate, approved change.)
export function StoreChrome({ header, footer, bottomNav, children }: Props) {
  const isAdmin = usePathname().startsWith('/admin');
  if (isAdmin) return <>{children}</>;
  return (
    <>
      {header}
      {/* Bottom padding keeps the last content clear of the fixed phone tab bar. */}
      <div className="pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
        {children}
        {footer}
      </div>
      {bottomNav}
    </>
  );
}
