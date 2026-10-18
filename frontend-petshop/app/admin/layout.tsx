import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// robots.txt only stops crawling; a disallowed URL linked from elsewhere can still be indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// The narrow content column every page had when the root layout wrapped them all. The root layout
// no longer does (the homepage is full width), so this segment keeps its previous look.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto max-w-3xl p-4 md:px-6">
      {children}
    </main>
  );
}
