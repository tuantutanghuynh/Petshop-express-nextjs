import { isWithinDates } from './settings';
import type { ProductVariant } from './types';

// Pure helpers that turn raw API values into what storefront pages show. Kept free of React and
// fetch so they are unit tested (test/storefront.test.ts), because this is where "only show what
// is true" is enforced: no discount unless the price really dropped, availability from real stock.

const VND = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

// Money is an Int of VND everywhere in the backend; never a float.
export function formatVnd(amount: number): string {
  return VND.format(amount);
}

export type PriceSummary = {
  price: number;
  compareAtPrice: number | null;
  discountPercent: number | null;
  hasRange: boolean;
  isOutOfStock: boolean;
};

// Card price for a product: its cheapest variant (the API sorts variants by price ascending, but
// we do not rely on it). Out of stock only when no variant has anything left after reservations —
// the same rule the checkout uses (stockQuantity - reservedQuantity).
export function priceSummary(variants: ProductVariant[]): PriceSummary | null {
  if (variants.length === 0) return null;
  const cheapest = variants.reduce((min, v) => (v.price < min.price ? v : min));
  const compareAt = cheapest.compareAtPrice;
  const isDiscounted = compareAt !== null && compareAt > cheapest.price;
  return {
    price: cheapest.price,
    compareAtPrice: isDiscounted ? compareAt : null,
    discountPercent: isDiscounted ? Math.round((1 - cheapest.price / compareAt) * 100) : null,
    hasRange: variants.some((v) => v.price !== cheapest.price),
    isOutOfStock: variants.every((v) => v.stockQuantity - v.reservedQuantity <= 0),
  };
}

export type Promo = {
  title: string;
  href: string;
  subtitle?: string;
  cta?: string;
  big?: string;
  image?: string;
};

// A link an admin typed into a setting: same-site paths ("/blog") or https URLs only. Rejects
// "javascript:" (runs script on click) and protocol-relative "//host" (silently leaves the site).
export function isSafeHref(href: string): boolean {
  return (href.startsWith('/') && !href.startsWith('//')) || href.startsWith('https://');
}

const optionalString = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

// homepage_promo_N holds a JSON string {title, href, subtitle?, cta?, big?, image?, enabled?,
// startsAt?, endsAt?}. Anything missing or malformed hides the banner — an empty slot is better than
// an invented promotion — and so does enabled: false or a date window that does not include `now`.
export function parsePromo(raw: string | undefined, now: Date = new Date()): Promo | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null; // broken JSON saved by hand in the admin: treated as "no banner"
  }
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.enabled === false || !isWithinDates(v, now)) return null;
  const title = optionalString(v.title);
  const href = optionalString(v.href);
  if (!title || !href || !isSafeHref(href)) return null;
  const image = optionalString(v.image);
  const promo: Promo = { title, href };
  for (const key of ['subtitle', 'cta', 'big'] as const) {
    const s = optionalString(v[key]);
    if (s) promo[key] = s;
  }
  if (image && image.startsWith('https://')) promo.image = image;
  return promo;
}

// shop_social_links: a JSON array or one URL per line. Only https URLs survive; they feed the
// footer links and Organization.sameAs, so a typo must not become a broken or unsafe link.
export function parseSocialLinks(raw: string | undefined): string[] {
  if (!raw) return [];
  let items: unknown[];
  try {
    const parsed: unknown = JSON.parse(raw);
    items = Array.isArray(parsed) ? parsed : [];
  } catch {
    items = raw.split('\n');
  }
  return items
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('https://'));
}

// Image URL for next/image. New uploads are full Cloudinary URLs; old ones are /uploads/... paths
// on the Express server. Any other host returns null (the caller shows a placeholder): next/image
// throws on hosts missing from images.remotePatterns in next.config.ts, and a URL typed into a
// setting must not be able to break the whole homepage.
export function imageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/uploads/')) return `${process.env.NEXT_PUBLIC_BACKEND_ORIGIN ?? ''}${url}`;
  if (url.startsWith('https://res.cloudinary.com/')) return url;
  return null;
}
