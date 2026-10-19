import type { ReactNode } from 'react';

// Same 1200px frame as the shop pages (it used to be a narrow max-w-3xl column).
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto max-w-[1200px] px-4 pb-8 md:px-6">
      {children}
    </main>
  );
}
