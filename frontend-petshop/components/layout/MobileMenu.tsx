'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { categoryPath } from '../../lib/seo/structuredData';
import type { CategoryNode } from '../../lib/categoryTree';
import { isActive, type NavLink } from './navLinks';
import { Chevron } from '../ui/Chevron';

type Props = { links: NavLink[]; categories: CategoryNode[]; phone?: string };

// Phone menu behind the ☰ button (wireframe): a native <dialog> drawer — focus is kept inside, Escape
// and a tap on the backdrop close it, focus returns to ☰. It closes itself after navigating.
export function MobileMenu({ links, categories, phone }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  const item = (active: boolean) => `flex min-h-12 items-center rounded-card px-3 font-bold ${active ? 'bg-mint text-brand-deep' : 'text-ink'}`;

  return (
    <>
      <button ref={trigger} type="button" aria-label="Mở menu" onClick={() => dialog.current?.showModal()} className="grid size-11 shrink-0 place-items-center rounded-full text-xl hover:bg-mint md:hidden">
        <span aria-hidden="true">☰</span>
      </button>
      <dialog
        ref={dialog}
        aria-label="Menu"
        onClose={() => trigger.current?.focus()}
        onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}
        className="m-0 h-dvh max-h-none w-[min(85vw,320px)] max-w-none bg-surface p-0 backdrop:bg-ink/60"
      >
        <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <b className="text-lg text-ink">Menu</b>
            <button type="button" aria-label="Đóng menu" onClick={() => dialog.current?.close()} className="grid size-11 place-items-center rounded-full border border-line text-xl">✕</button>
          </div>
          <nav aria-label="Menu chính">
            <ul className="flex flex-col">
              {links.map((l) => (
                <li key={l.href}><Link href={l.href} aria-current={isActive(pathname, l.href) ? 'page' : undefined} className={item(isActive(pathname, l.href))}>{l.label}</Link></li>
              ))}
            </ul>
          </nav>
          {categories.length > 0 && (
            <nav aria-label="Danh mục sản phẩm">
              <b className="mb-1 block px-3 text-sm text-muted">Danh mục sản phẩm</b>
              {/* Species → group → leaf as nested <details>: opens without JavaScript, every row 48px. */}
              <ul className="flex flex-col">
                {categories.map((c) => (
                  <li key={c.id}>
                    <details className="group">
                      <summary className={`${item(false)} cursor-pointer list-none justify-between [&::-webkit-details-marker]:hidden`}>
                        {c.name} <Chevron className="group-open:rotate-180" />
                      </summary>
                      <ul className="ml-3 border-l border-line pl-2">
                        <li><Link href={categoryPath(c.slug)} className={item(pathname === categoryPath(c.slug))}>Tất cả {c.name}</Link></li>
                        {c.children.map((g) => (
                          <li key={g.id}>
                            {g.children.length === 0 ? (
                              <Link href={categoryPath(g.slug)} className={item(pathname === categoryPath(g.slug))}>{g.name}</Link>
                            ) : (
                              <details className="group/g">
                                <summary className={`${item(false)} cursor-pointer list-none justify-between font-semibold [&::-webkit-details-marker]:hidden`}>
                                  {g.name} <Chevron className="group-open/g:rotate-180" />
                                </summary>
                                <ul className="ml-3 border-l border-line pl-2">
                                  <li><Link href={categoryPath(g.slug)} className={item(pathname === categoryPath(g.slug))}>Tất cả {g.name}</Link></li>
                                  {g.children.map((leaf) => (
                                    <li key={leaf.id}><Link href={categoryPath(leaf.slug)} className={item(pathname === categoryPath(leaf.slug))}>{leaf.name}</Link></li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {phone && (
            <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="mt-auto flex min-h-12 items-center justify-center rounded-full bg-brand-ink font-bold text-white">☎ {phone}</a>
          )}
        </div>
      </dialog>
    </>
  );
}
