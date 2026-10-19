import Image from 'next/image';
import Link from 'next/link';
import { imageSrc, type Promo } from '../../lib/storefront';

// Admin-configured promotions (homepage_promo_1…5, /admin/cau-hinh), laid out as in the wireframe:
// three cards (slots 1–3) and two wide banners (slots 4–5). Colours are fixed by slot so the owner
// cannot break the palette. Empty, switched-off or out-of-date slots are simply not shown.
type Style = { bg: string; big: string; sub: string; btn: string };

const STYLES: Style[] = [
  { bg: 'bg-pink-bg', big: 'text-pink', sub: 'text-pink-ink', btn: 'bg-pink text-white' },
  { bg: 'bg-yellow-bg', big: 'text-orange-ink', sub: 'text-yellow-ink', btn: 'bg-yellow text-ink' },
  { bg: 'bg-mint-card', big: 'text-brand-deep', sub: 'text-brand-deep', btn: 'bg-brand-ink text-white' },
  { bg: 'bg-peach', big: 'text-brand-deep', sub: 'text-brand-deep', btn: 'bg-orange-ink text-white' },
  { bg: 'bg-lavender', big: 'text-orange-text', sub: 'text-purple-ink', btn: 'bg-purple text-white' },
];

type Slot = { promo: Promo; slot: number };

// Each row is filled by the promotions that are actually showing (wireframe: rows are always full).
// With a slot switched off or out of date, the remaining ones share the row instead of leaving a hole.
const COLS = ['', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-3'];

// Right half: the photo, or a soft placeholder block so every card keeps the wireframe's shape.
function Art({ src, sizes }: { src: string | null; sizes: string }) {
  return (
    <div className="relative h-full min-h-32 overflow-hidden rounded-card bg-surface/50">
      {src ? <Image src={src} alt="" fill sizes={sizes} className="object-contain" /> : <span aria-hidden="true" className="grid h-full place-items-center text-4xl opacity-40">🐾</span>}
    </div>
  );
}

function Card({ promo, slot }: Slot) {
  const s = STYLES[slot];
  return (
    <Link href={promo.href} className={`grid min-h-44 grid-cols-[1.1fr_1fr] items-center gap-3 rounded-panel p-5 ${s.bg}`}>
      <div className="flex min-w-0 flex-col items-start gap-1">
        {promo.big && <span className={`text-[clamp(1.6rem,1.2rem+1.6vw,2.4rem)] leading-[1.3] font-extrabold ${s.big}`}>{promo.big}</span>}
        <h3 className="text-lg font-extrabold">{promo.title}</h3>
        {promo.subtitle && <p className={`text-sm ${s.sub}`}>{promo.subtitle}</p>}
        <span className={`mt-2 inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold ${s.btn}`}>{promo.cta ?? 'Mua ngay'}</span>
      </div>
      <Art src={imageSrc(promo.image)} sizes="(min-width: 1024px) 180px, 40vw" />
    </Link>
  );
}

// Wide banner: small label on top ("Bộ sưu tập mới" — the `big` field), large coloured title.
function Banner({ promo, slot }: Slot) {
  const s = STYLES[slot];
  return (
    <Link href={promo.href} className={`grid min-h-40 grid-cols-[1fr_1fr] items-center gap-3 rounded-panel px-6 py-5 ${s.bg}`}>
      <div className="flex min-w-0 flex-col items-start gap-1">
        {promo.big && <small className="text-sm font-bold text-ink">{promo.big}</small>}
        <h3 className={`text-[clamp(1.3rem,1rem+1.2vw,1.8rem)] font-extrabold ${s.big}`}>{promo.title}</h3>
        {promo.subtitle && <p className={`text-sm ${s.sub}`}>{promo.subtitle}</p>}
        <span className={`mt-2 inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold ${s.btn}`}>{promo.cta ?? 'Khám phá'}</span>
      </div>
      <Art src={imageSrc(promo.image)} sizes="(min-width: 768px) 260px, 45vw" />
    </Link>
  );
}

export function PromoCards({ promos }: { promos: (Promo | null)[] }) {
  const slots: Slot[] = promos.flatMap((promo, slot) => (promo ? [{ promo, slot }] : []));
  if (slots.length === 0) return null;
  const cards = slots.filter((s) => s.slot < 3);
  const banners = slots.filter((s) => s.slot >= 3);
  return (
    <section aria-label="Ưu đãi và bộ sưu tập" className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-2 md:px-6">
      {cards.length > 0 && <div className={`grid gap-4 ${COLS[cards.length]}`}>{cards.map((s) => <Card key={s.slot} {...s} />)}</div>}
      {banners.length > 0 && <div className={`grid gap-4 ${COLS[banners.length]}`}>{banners.map((s) => <Banner key={s.slot} {...s} />)}</div>}
    </section>
  );
}
