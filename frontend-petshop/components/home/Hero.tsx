import Image from 'next/image';
import Link from 'next/link';
import type { HeroContent } from '../../lib/heroSlides';

export type { HeroContent };

type ViewProps = { content: HeroContent; headingId: string; level: 'h1' | 'h2'; priority: boolean; textClassName?: string };

// One hero layout — copy on the left, the photo over yellow + coral panels on the right — shared by
// the static hero and every slider slide. Only the first slide holds the page's <h1> and its photo
// is the LCP element (high priority); later slides use <h2> at the same size and lazy images.
export function HeroSlideView({ content, headingId, level: Heading, priority, textClassName = '' }: ViewProps) {
  return (
    <div className="grid lg:min-h-[420px] lg:grid-cols-2">
      {/* Text column aligned with the 1200px page frame; the art column runs to the screen edge, as in
          the wireframe. Padding % is relative to this column, which is half the page, so the frame's
          side margin is 100% - 600px (no 100vw, which counts the scrollbar). */}
      <div className={`flex flex-col justify-center gap-4 px-4 py-6 md:px-6 lg:py-10 lg:pr-10 lg:pl-[max(1.5rem,calc(100%-600px+1.5rem))] ${textClassName}`}>
        {content.badge && <span className="w-fit rounded-full bg-pink-bg px-3 py-1 text-xs font-bold text-pink-ink">{content.badge}</span>}
        <Heading id={headingId} className="text-[clamp(1.75rem,1.2rem+2.6vw,3rem)] leading-[1.3] font-extrabold">
          {content.title}
          {content.accent && <span className="block text-brand-deep">{content.accent}</span>}
        </Heading>
        {content.subtitle && <p className="max-w-prose">{content.subtitle}</p>}
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
          <Image src={content.image} alt="" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-contain p-4"
            {...(priority ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })} />
        )}
      </div>
    </div>
  );
}

// Static hero (a single slide): the same layout inside the labelled section.
export function Hero({ content }: { content: HeroContent }) {
  return (
    <section aria-labelledby="hero-title" className="overflow-hidden bg-mint">
      <HeroSlideView content={content} headingId="hero-title" level="h1" priority />
    </section>
  );
}
