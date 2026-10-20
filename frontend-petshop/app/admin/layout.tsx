import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminShell } from '../../components/admin/shell/AdminShell';

// robots.txt only stops crawling; a disallowed URL linked from elsewhere can still be indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
