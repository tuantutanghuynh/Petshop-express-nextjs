import { isWithinDates } from './settings';
import { imageSrc, isSafeHref } from './storefront';

// Homepage hero slides (spec 2026-10-21, test/heroSlides.test.ts), edited in /admin/cau-hinh and
// stored as a JSON list in homepage_hero_slides. Parsed on the server: the slider only receives
// slides that are on, titled, within their dates and safe to render. Until a list is saved, the
// older single hero (homepage_hero_* keys) is the one slide.
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

export const HERO_SLIDES_KEY = 'homepage_hero_slides';
export const MAX_HERO_SLIDES = 6;
export const HERO_LIMITS = { badge: 40, title: 80, accent: 80, subtitle: 240, label: 30 } as const;
export const LEGACY_HERO_KEYS = ['badge', 'title', 'accent', 'subtitle', 'cta_label', 'cta_href', 'cta2_label', 'cta2_href', 'image'].map((k) => `homepage_hero_${k}`);

const MAIN_CTA = { label: 'Mua ngay', href: '/san-pham' };
type Settings = Record<string, string | undefined>;

// The single hero used before slides existed, with the wireframe copy as defaults.
export function legacyHero(s: Settings): HeroContent {
  const href = s.homepage_hero_cta_href;
  const cta2Href = s.homepage_hero_cta2_href;
  return {
    badge: s.homepage_hero_badge ?? '♥ Yêu thương & chăm sóc',
    title: s.homepage_hero_title || 'Lựa chọn tốt nhất',
    accent: s.homepage_hero_accent || 'cho bé cưng nhà bạn',
    subtitle: s.homepage_hero_subtitle || 'Thức ăn dinh dưỡng, pate, phụ kiện chất lượng và kiến thức chăm sóc chó mèo từ người nuôi thật.',
    ctaLabel: s.homepage_hero_cta_label || MAIN_CTA.label,
    ctaHref: href && isSafeHref(href) ? href : MAIN_CTA.href,
    cta2: { label: s.homepage_hero_cta2_label || 'Nhờ tư vấn', href: cta2Href && isSafeHref(cta2Href) ? cta2Href : '/tu-van-bao-gia' },
    image: imageSrc(s.homepage_hero_image),
  };
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const link = (label: unknown, href: unknown) => {
  const l = text(label, HERO_LIMITS.label);
  const h = text(href, 2000);
  return l && h && isSafeHref(h) ? { label: l, href: h } : null;
};

function readSlide(v: Record<string, unknown>, now: Date): HeroContent | null {
  const title = text(v.title, HERO_LIMITS.title);
  if (v.enabled === false || !title || !isWithinDates(v, now)) return null;
  const main = link(v.ctaLabel, v.ctaHref) ?? MAIN_CTA;
  const image = text(v.image, 2000);
  return {
    badge: text(v.badge, HERO_LIMITS.badge),
    title,
    accent: text(v.accent, HERO_LIMITS.accent),
    subtitle: text(v.subtitle, HERO_LIMITS.subtitle),
    ctaLabel: main.label,
    ctaHref: main.href,
    cta2: link(v.cta2Label, v.cta2Href),
    image: image.startsWith('https://') ? imageSrc(image) : null,
  };
}

export function parseHeroSlides(s: Settings, now: Date = new Date()): HeroContent[] {
  const raw = s[HERO_SLIDES_KEY];
  if (!raw) return [legacyHero(s)];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    value = null; // malformed list = nothing visible
  }
  const visible = (Array.isArray(value) ? value : [])
    .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
    .map((v) => readSlide(v, now))
    .filter((v): v is HeroContent => v !== null)
    .slice(0, MAX_HERO_SLIDES);
  return visible.length > 0 ? visible : [legacyHero({})];
}

export const nextIndex = (i: number, n: number, dir: -1 | 1) => (i + dir + n) % n;
