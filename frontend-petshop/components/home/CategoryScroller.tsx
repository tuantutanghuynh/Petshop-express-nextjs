'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

// Horizontal strip with ‹ › buttons from 768px (phones swipe). The list itself is server-rendered;
// this only scrolls it. A button is disabled at its end of the strip.
export function CategoryScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, [measure]);

  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  const button = 'hidden size-11 shrink-0 place-items-center rounded-full border border-line bg-surface text-xl text-ink disabled:opacity-40 md:grid';

  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label="Danh mục trước" className={button} disabled={edges.start} onClick={() => scroll(-1)}>‹</button>
      <div ref={ref} className="min-w-0 flex-1 overflow-x-auto">{children}</div>
      <button type="button" aria-label="Danh mục sau" className={button} disabled={edges.end} onClick={() => scroll(1)}>›</button>
    </div>
  );
}
