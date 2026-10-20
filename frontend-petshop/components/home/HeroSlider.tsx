'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { nextIndex, type HeroContent } from '../../lib/heroSlides';
import { useDocumentHidden, usePrefersReducedMotion } from '../../lib/useMediaState';
import { HeroSlideView } from './Hero';

const AUTOPLAY_MS = 6000;
const SWIPE_PX = 40;
const ctrl = 'grid size-11 shrink-0 place-items-center rounded-full bg-surface/90 text-ink shadow-card hover:bg-surface';

// Accessible auto-playing hero (WAI-ARIA carousel pattern). Every slide is in the server HTML,
// stacked in one grid cell so the hero is as tall as its tallest slide and switching never shifts
// the layout; hidden slides are inert. Autoplay stops while hovered, while focus is inside, while
// the tab is hidden, after ⏸, and by default when the visitor prefers reduced motion.
export function HeroSlider({ slides }: { slides: HeroContent[] }) {
  const n = slides.length;
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<boolean | null>(null); // null = default (play unless reduced motion)
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const hidden = useDocumentHidden();
  const startX = useRef<number | null>(null);
  const autoplay = choice ?? !reduced;
  const running = autoplay && !hovered && !focused && !hidden;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setIndex((i) => nextIndex(i, n, 1)), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [running, n]);

  const go = (dir: -1 | 1) => setIndex((i) => nextIndex(i, n, dir));
  const onPointerDown = (e: PointerEvent) => {
    startX.current = e.clientX;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) >= SWIPE_PX) go(dx < 0 ? 1 : -1);
  };

  return (
    <section aria-roledescription="carousel" aria-label="Nổi bật" className="relative overflow-hidden bg-mint touch-pan-y"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}
      onKeyDown={(e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); }}
      onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <div className="grid" aria-live={running ? 'off' : 'polite'}>
        {slides.map((s, i) => {
          const active = i === index;
          return (
            <div key={i} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${n}`} inert={!active} aria-hidden={!active}
              className={`[grid-area:1/1] bg-mint transition-opacity duration-300 motion-reduce:transition-none ${active ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
              <HeroSlideView content={s} headingId={`hero-title-${i}`} level={i === 0 ? 'h1' : 'h2'} priority={i === 0} textClassName="lg:pb-16" />
            </div>
          );
        })}
      </div>
      <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 px-4">
        <button type="button" className={ctrl} onClick={() => go(-1)} aria-label="Slide trước">‹</button>
        <ol className="hidden items-center sm:flex">
          {slides.map((s, i) => (
            <li key={i}>
              <button type="button" onClick={() => setIndex(i)} aria-label={`Slide ${i + 1}: ${s.title}`} aria-current={i === index ? 'true' : undefined}
                className="grid size-11 place-items-center">
                <span aria-hidden="true" className={`block size-2.5 rounded-full ${i === index ? 'bg-brand-ink' : 'bg-ink/30'}`} />
              </button>
            </li>
          ))}
        </ol>
        <span className="min-w-12 rounded-full bg-surface/90 px-2 py-1 text-center text-sm font-bold tabular-nums sm:hidden">{index + 1} / {n}</span>
        <button type="button" className={ctrl} onClick={() => setChoice(!autoplay)} aria-pressed={!autoplay}
          aria-label={autoplay ? 'Dừng tự chuyển slide' : 'Tự chuyển slide'}>{autoplay ? '⏸' : '▶'}</button>
        <button type="button" className={ctrl} onClick={() => go(1)} aria-label="Slide sau">›</button>
      </div>
    </section>
  );
}
