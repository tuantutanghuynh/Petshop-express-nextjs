import Image from 'next/image';
import Link from 'next/link';

export type HeroContent = {
  title: string;
  accent: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  image: string | null;
};

// Mint hero with copy on the left and the photo over yellow + coral panels on the right.
// Holds the page's only <h1>. The photo is the LCP element, so it is fetched with high priority
// and given explicit sizes; with no photo configured the panels stay as a decorative block.
export function Hero({ content }: { content: HeroContent }) {
  return (
    <section aria-labelledby="hero-title" className="overflow-hidden bg-mint">
      <div className="mx-auto grid max-w-[1200px] gap-4 px-4 pt-6 lg:min-h-[420px] lg:grid-cols-2 lg:items-center lg:pt-0">
        <div className="flex flex-col gap-4 pb-4">
          <span className="w-fit rounded-full bg-pink-bg px-3 py-1 text-xs font-bold text-pink-ink">♥ Yêu thương &amp; chăm sóc</span>
          <h1 id="hero-title" className="text-[clamp(1.75rem,1.2rem+2.6vw,3rem)] font-extrabold">
            {content.title}
            <span className="block text-brand-deep">{content.accent}</span>
          </h1>
          <p className="max-w-prose">{content.subtitle}</p>
          <div className="flex flex-wrap gap-3">
            <Link href={content.ctaHref} className="inline-flex min-h-12 items-center rounded-full bg-brand-ink px-6 font-bold text-white hover:bg-brand-deep">
              {content.ctaLabel}
            </Link>
          </div>
        </div>
        {/* Without a photo the panels are pure decoration: shown on desktop only, so phones do not
            scroll past an empty colour block before the first real content. */}
        <div aria-hidden={content.image ? undefined : true} className={`relative min-h-60 grid-cols-2 sm:min-h-80 lg:grid lg:min-h-[420px] ${content.image ? 'grid' : 'hidden'}`}>
          <div className="bg-yellow-hero" />
          <div className="bg-coral" />
          {content.image && (
            <Image
              src={content.image}
              alt=""
              fill
              fetchPriority="high"
              sizes="(min-width: 1024px) 600px, 100vw"
              className="object-contain p-4"
            />
          )}
        </div>
      </div>
    </section>
  );
}
