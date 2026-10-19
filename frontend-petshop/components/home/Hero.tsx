import Image from 'next/image';
import Link from 'next/link';

export type HeroContent = {
  badge: string;
  title: string;
  accent: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  cta2: { label: string; href: string } | null;
  image: string | null;
};

// Mint hero with copy on the left and the photo over yellow + coral panels on the right.
// Holds the page's only <h1>. The photo is the LCP element, so it is fetched with high priority
// and given explicit sizes; with no photo configured the panels stay as a decorative block.
export function Hero({ content }: { content: HeroContent }) {
  return (
    <section aria-labelledby="hero-title" className="grid overflow-hidden bg-mint lg:min-h-[420px] lg:grid-cols-2">
      {/* Text column aligned with the 1200px page frame; the art column runs to the screen edge, as in
          the wireframe. Padding % is relative to this column, which is half the page, so the frame's
          side margin is 100% - 600px (no 100vw, which counts the scrollbar). */}
      <div className="flex flex-col justify-center gap-4 px-4 py-6 md:px-6 lg:py-10 lg:pr-10 lg:pl-[max(1.5rem,calc(100%-600px+1.5rem))]">
        {content.badge && <span className="w-fit rounded-full bg-pink-bg px-3 py-1 text-xs font-bold text-pink-ink">{content.badge}</span>}
        <h1 id="hero-title" className="text-[clamp(1.75rem,1.2rem+2.6vw,3rem)] font-extrabold">
          {content.title}
          <span className="block text-brand-deep">{content.accent}</span>
        </h1>
        <p className="max-w-prose">{content.subtitle}</p>
        <div className="flex flex-wrap gap-3">
          <Link href={content.ctaHref} className="inline-flex min-h-12 items-center rounded-full bg-brand-ink px-6 font-bold text-white hover:bg-brand-deep">
            {content.ctaLabel}
          </Link>
          {content.cta2 && (
            <Link href={content.cta2.href} className="inline-flex min-h-12 items-center rounded-full border-2 border-brand-ink bg-surface px-6 font-bold text-brand-ink hover:bg-mint">
              {content.cta2.label}
            </Link>
          )}
        </div>
      </div>
      {/* Yellow + coral panels with the photo on top (the LCP element when set). Decorative without
          a photo, but kept on phones too, as in the wireframe. */}
      <div aria-hidden={content.image ? undefined : true} className="relative grid min-h-60 grid-cols-2 sm:min-h-80 lg:min-h-[420px]">
        <div className="bg-yellow-hero" />
        <div className="bg-coral" />
        {content.image && (
          <Image src={content.image} alt="" fill fetchPriority="high" sizes="(min-width: 1024px) 50vw, 100vw" className="object-contain p-4" />
        )}
      </div>
    </section>
  );
}
