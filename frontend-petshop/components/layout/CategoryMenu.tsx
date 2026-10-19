'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { categoryPath } from '../../lib/seo/structuredData';
import type { Category } from '../../lib/types';

// "☰ Danh mục sản phẩm ▾" (wireframe). A <details> element: opens and closes without JavaScript;
// the script only closes it on navigation, Escape and a click outside.
export function CategoryMenu({ categories }: { categories: Category[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !el.contains(e.target as Node)) {
        el.open = false;
        if (e instanceof KeyboardEvent) el.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', close);
    };
  }, []);

  return (
    <details ref={ref} className="relative shrink-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-card bg-brand-ink px-4 text-sm font-bold text-white [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true">☰</span> Danh mục sản phẩm <span aria-hidden="true">▾</span>
      </summary>
      <ul className="absolute top-full left-0 z-50 mt-2 w-64 rounded-card border border-line bg-surface p-2 shadow-card">
        {categories.map((c) => (
          <li key={c.id}>
            <Link href={categoryPath(c.slug)} className="flex min-h-11 items-center rounded-card px-3 text-sm font-bold text-ink hover:bg-mint">{c.name}</Link>
          </li>
        ))}
        <li className="mt-1 border-t border-line pt-1">
          <Link href="/san-pham" className="flex min-h-11 items-center rounded-card px-3 text-sm font-bold text-brand-ink hover:bg-mint">Tất cả sản phẩm ›</Link>
        </li>
      </ul>
    </details>
  );
}
