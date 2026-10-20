import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

// robots.txt only stops crawling; a disallowed URL linked from elsewhere can still be indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

const LINKS = [
  { href: '/admin/posts', label: 'Bài viết' },
  { href: '/admin/danh-muc', label: 'Danh mục' },
  { href: '/admin/gallery', label: 'Thư viện ảnh' },
  { href: '/admin/cau-hinh', label: 'Cấu hình trang chủ' },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto max-w-3xl p-4 md:px-6">
      <nav aria-label="Quản trị" className="mb-6 flex flex-wrap gap-2 border-b border-line pb-3">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold text-ink hover:bg-mint">{l.label}</Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
