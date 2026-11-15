import type { ReactNode } from 'react';

// Same page frame (max-w-page) as the shop pages (it used to be a narrow max-w-3xl column).
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto max-w-page px-4 pb-8 md:px-6">
      {children}
    </main>
  );
}
