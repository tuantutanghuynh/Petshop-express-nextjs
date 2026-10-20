import { isSafeHref } from './storefront';

// "Mua theo bé cưng" circles on the homepage, edited in /admin/cau-hinh and stored as a JSON list in
// homepage_category_circles (test/settings.test.ts). Each circle is a name, a link and an optional
// image, so a circle can point at any category (Pate exists for dogs and for cats). Until the owner
// saves a list, the six wireframe circles show.
export const CATEGORY_CIRCLES_KEY = 'homepage_category_circles';
export const MAX_CATEGORY_CIRCLES = 8;
export const MAX_CIRCLE_LABEL = 40;

export type CategoryCircle = { label: string; href: string; image: string | null };

export const DEFAULT_CATEGORY_CIRCLES: { label: string; href: string }[] = [
  { label: 'Mèo', href: '/danh-muc/meo' },
  { label: 'Chó', href: '/danh-muc/cho' },
  { label: 'Thức ăn', href: '/danh-muc/cho-thuc-an' },
  { label: 'Pate', href: '/danh-muc/pate-cho-meo' },
  { label: 'Phụ kiện', href: '/danh-muc/cho-phu-kien-nha' },
  { label: 'Sức khoẻ', href: '/danh-muc/cho-ve-sinh-suc-khoe' },
];

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const httpsUrl = (v: unknown) => (text(v).startsWith('https://') ? text(v) : null);

// legacyImages: homepage_category_images ({ slug: url }), the older per-category circle images;
// they still dress the default Chó / Mèo circles.
export function parseCategoryCircles(raw: string | undefined, legacyImages: Record<string, string>): CategoryCircle[] {
  let value: unknown;
  try {
    value = raw ? JSON.parse(raw) : undefined;
  } catch {
    value = undefined; // malformed setting = not set
  }
  const saved = (Array.isArray(value) ? value : [])
    .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
    .map((v) => ({ label: text(v.label), href: text(v.href), image: httpsUrl(v.image) }))
    .filter((c) => c.label.length > 0 && c.label.length <= MAX_CIRCLE_LABEL && c.href && isSafeHref(c.href))
    .slice(0, MAX_CATEGORY_CIRCLES);
  if (saved.length > 0) return saved;
  return DEFAULT_CATEGORY_CIRCLES.map((c) => ({ ...c, image: legacyImages[c.href.replace('/danh-muc/', '')] ?? null }));
}
