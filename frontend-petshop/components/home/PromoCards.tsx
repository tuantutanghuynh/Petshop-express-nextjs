import Image from 'next/image';
import Link from 'next/link';
import { imageSrc, type Promo } from '../../lib/storefront';

// Admin-configured banners (homepage_promo_1…5). Colours are fixed by slot to keep the palette:
// slots 1–3 are the three small cards, 4–5 the two wide banners. Empty slots are simply not shown —
// the section disappears when no banner is configured, instead of displaying invented offers.
const CARD_STYLES = [
  { bg: 'bg-pink-bg', big: 'text-pink', sub: 'text-pink-ink', btn: 'bg-pink text-white' },
  { bg: 'bg-yellow-bg', big: 'text-orange-ink', sub: 'text-yellow-ink', btn: 'bg-yellow text-ink' },
  { bg: 'bg-mint-card', big: 'text-brand-deep', sub: 'text-brand-deep', btn: 'bg-brand-ink text-white' },
  { bg: 'bg-peach', big: 'text-brand-deep', sub: 'text-ink', btn: 'bg-orange-ink text-white' },
  { bg: 'bg-lavender', big: 'text-orange-text', sub: 'text-ink', btn: 'bg-purple text-white' },
];

type Slot = { promo: Promo; slot: number };

function PromoCard({ promo, slot }: Slot) {
  const style = CARD_STYLES[slot];
  const src = imageSrc(promo.image);
  return (
    <Link href={promo.href} className={`grid min-h-44 grid-cols-[1.1fr_1fr] items-center gap-2 rounded-panel p-5 ${style.bg}`}>
      <div className="flex flex-col items-start gap-1">
        {promo.big && <span className={`text-[clamp(1.6rem,1.2rem+1.6vw,2.4rem)] leading-[1.3] font-extrabold ${style.big}`}>{promo.big}</span>}
        <h3 className="text-lg font-extrabold">{promo.title}</h3>
        {promo.subtitle && <p className={`text-sm ${style.sub}`}>{promo.subtitle}</p>}
        <span className={`mt-2 inline-flex min-h-10 items-center rounded-full px-4 text-sm font-bold ${style.btn}`}>{promo.cta ?? 'Xem ngay'}</span>
      </div>
      <div className="relative h-full min-h-32">
        {src && <Image src={src} alt="" fill sizes="(min-width: 1024px) 200px, 45vw" className="object-contain" />}
      </div>
    </Link>
  );
}

export function PromoCards({ promos }: { promos: (Promo | null)[] }) {
  const slots: Slot[] = promos.flatMap((promo, slot) => (promo ? [{ promo, slot }] : []));
  if (slots.length === 0) return null;
  const cards = slots.filter((s) => s.slot < 3);
  const banners = slots.filter((s) => s.slot >= 3);
  return (
    <section aria-label="Ưu đãi và bộ sưu tập" className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-2">
      {cards.length > 0 && <div className="grid gap-4 md:grid-cols-3">{cards.map((s) => <PromoCard key={s.slot} {...s} />)}</div>}
      {banners.length > 0 && <div className="grid gap-4 md:grid-cols-2">{banners.map((s) => <PromoCard key={s.slot} {...s} />)}</div>}
    </section>
  );
}
