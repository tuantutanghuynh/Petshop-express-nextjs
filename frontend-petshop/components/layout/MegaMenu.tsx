'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { categoryPath } from '../../lib/seo/structuredData';
import { Chevron } from '../ui/Chevron';

type Item = { slug: string; name: string; panel: ReactNode };

const HOVER_DELAY_MS = 150;

// "Chó ▾" / "Mèo ▾". The name links to the species page; the ▾ button (or hovering the pair) opens
// its panel. Panels are always in the HTML, hidden while closed, so crawlers see every category
// link. Escape closes and returns focus to ▾; a click outside or navigating closes. The panel spans
// the header width: it is positioned against the sticky <header>, outside MainNav's scrolling list.
export function MegaMenu({ items }: { items: Item[] }) {
  // The page a menu was opened on is stored with it: after navigating, `open` no longer matches the
  // current path and the menu counts as closed, without resetting state in an effect.
  const [opened, setOpened] = useState<{ slug: string; on: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const open = opened && opened.on === pathname ? opened.slug : null;
  const setOpen = (slug: string | null) => setOpened(slug ? { slug, on: pathname } : null);

  const openLater = (slug: string | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(slug), HOVER_DELAY_MS);
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      root.current?.querySelector<HTMLButtonElement>(`[data-toggle="${open}"]`)?.focus();
      setOpened(null);
    };
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpened(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  return (
    <div ref={root} className="flex shrink-0 items-center" onMouseLeave={() => openLater(null)}>
      {items.map((item) => {
        const isOpen = open === item.slug;
        return (
          <div key={item.slug} className={`flex min-h-11 items-center gap-0.5 rounded-full pr-1 pl-3 hover:bg-mint ${isOpen ? 'bg-mint' : ''}`}
            onMouseEnter={() => openLater(item.slug)}>
            <Link href={categoryPath(item.slug)} className="flex min-h-11 items-center text-sm font-bold whitespace-nowrap text-ink">
              {item.name}
            </Link>
            {/* 32×44 target: the pair sits in one 44px-high pill, so the arrow is never a tiny lone hit area. */}
            <button type="button" data-toggle={item.slug} aria-expanded={isOpen} aria-controls={`mega-${item.slug}`} aria-label={`Mở danh mục ${item.name}`}
              onClick={() => setOpen(isOpen ? null : item.slug)}
              className="grid h-11 w-8 place-items-center rounded-full text-ink focus-visible:outline-offset-[-3px]">
              <Chevron className={isOpen ? 'rotate-180' : ''} />
            </button>
            <div id={`mega-${item.slug}`} hidden={!isOpen}
              className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-140px)] overflow-y-auto overscroll-contain border-t border-line bg-surface shadow-card">
              {item.panel}
            </div>
          </div>
        );
      })}
    </div>
  );
}
