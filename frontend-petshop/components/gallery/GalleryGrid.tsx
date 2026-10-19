'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type TouchEvent } from 'react';

export type GalleryPhoto = { id: string; src: string; alt: string; title: string | null };

// Gallery items have no stored width/height yet, so the masonry cycles the wireframe's three frame
// ratios and crops with object-cover: the space is reserved before a photo loads (no layout shift).
// Storing real dimensions is a later migration (ADR-013).
const RATIOS = ['aspect-[3/4]', 'aspect-square', 'aspect-[4/3]'];
const SWIPE_PX = 50;

export function GalleryGrid({ photos }: { photos: GalleryPhoto[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggers = useRef<Array<HTMLButtonElement | null>>([]);
  const touchX = useRef<number | null>(null);
  // The photo that opened the lightbox: focus goes back to it, even after browsing to other photos.
  const opener = useRef<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  // Native <dialog>: focus trap, Escape and the top layer come from the browser. The page behind
  // does not scroll while it is open; focus returns to the photo that opened it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open !== null && !dialog.open) {
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    }
    if (open === null && dialog.open) dialog.close();
  }, [open]);

  function onClose() {
    document.body.style.overflow = '';
    setOpen(null);
    if (opener.current !== null) triggers.current[opener.current]?.focus();
    opener.current = null;
  }

  const step = (delta: number) => setOpen((i) => (i === null ? i : (i + delta + photos.length) % photos.length));

  function onTouchEnd(e: TouchEvent) {
    const start = touchX.current;
    touchX.current = null;
    if (start === null) return;
    const dx = e.changedTouches[0].clientX - start;
    if (Math.abs(dx) > SWIPE_PX) step(dx < 0 ? 1 : -1);
  }

  const current = open === null ? null : photos[open];

  return (
    <>
      <ul className="columns-2 gap-3 md:columns-3 lg:columns-4">
        {photos.map((photo, i) => (
          <li key={photo.id} className="mb-3 break-inside-avoid">
            <figure>
              <button
                type="button"
                ref={(el) => { triggers.current[i] = el; }}
                onClick={() => {
                  opener.current = i;
                  setOpen(i);
                }}
                aria-label={`Phóng to: ${photo.title || photo.alt}`}
                className={`relative block w-full overflow-hidden rounded-card bg-mint ${RATIOS[i % RATIOS.length]}`}
              >
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  sizes="(min-width: 1024px) 280px, (min-width: 768px) 33vw, 50vw"
                  className="object-cover"
                  {...(i === 0 ? { fetchPriority: 'high' as const } : {})}
                />
              </button>
              {photo.title && <figcaption className="px-0.5 py-1.5 text-sm">{photo.title}</figcaption>}
            </figure>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        onClose={onClose}
        onClick={(e) => { if (e.target === e.currentTarget) dialogRef.current?.close(); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') step(1);
          if (e.key === 'ArrowLeft') step(-1);
        }}
        aria-label={current ? current.title || current.alt : 'Ảnh'}
        className="m-auto w-[min(100%-2rem,720px)] max-w-none rounded-panel bg-surface p-3 backdrop:bg-ink/80"
      >
        {current && (
          <div onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }} onTouchEnd={onTouchEnd}>
            <div className="relative aspect-[4/3] max-h-[75dvh] w-full overflow-hidden rounded-card bg-mint">
              <Image src={current.src} alt={current.alt} fill sizes="(min-width: 768px) 720px, 100vw" className="object-contain" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <b className="min-w-0 flex-1 text-ink">{current.title || current.alt}</b>
              {photos.length > 1 && (
                <>
                  <button type="button" onClick={() => step(-1)} aria-label="Ảnh trước" className="grid size-11 place-items-center rounded-full border border-line text-xl">‹</button>
                  <button type="button" onClick={() => step(1)} aria-label="Ảnh sau" className="grid size-11 place-items-center rounded-full border border-line text-xl">›</button>
                </>
              )}
              <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Đóng" className="grid size-11 place-items-center rounded-full border border-line text-xl">✕</button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
