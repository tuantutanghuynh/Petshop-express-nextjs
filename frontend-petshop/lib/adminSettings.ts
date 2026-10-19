import type { FieldErrors } from './forms';
import { MAX_ANNOUNCEMENTS, SETTING_KEYS, parseAnnouncements, parseCategoryImages } from './settings';
import { isSafeHref, parseSocialLinks } from './storefront';

// Mapping between stored settings and the /admin/cau-hinh form (test/adminSettings.test.ts).
// formToSettings refuses what the public pages would otherwise have to drop silently, so the
// owner sees the problem on the field instead of a banner that never appears.

export const PROMO_SLOTS = 5;
const promoKey = (i: number) => `homepage_promo_${i + 1}`;

const HERO_KEYS = {
  badge: SETTING_KEYS.heroBadge,
  title: 'homepage_hero_title',
  accent: 'homepage_hero_accent',
  subtitle: 'homepage_hero_subtitle',
  ctaLabel: 'homepage_hero_cta_label',
  ctaHref: 'homepage_hero_cta_href',
  cta2Label: SETTING_KEYS.heroCta2Label,
  cta2Href: SETTING_KEYS.heroCta2Href,
  image: 'homepage_hero_image',
} as const;

const SHOP_KEYS = { phone: 'shop_phone', zalo: 'shop_zalo', email: 'shop_email', address: 'shop_address', hours: 'shop_hours' } as const;
const BANK_KEYS = { name: 'bank_name', account: 'bank_account', holder: 'bank_holder' } as const;

export const ADMIN_SETTING_KEYS: string[] = [
  SETTING_KEYS.announcements,
  SETTING_KEYS.categoryImages,
  ...Object.values(HERO_KEYS),
  ...Array.from({ length: PROMO_SLOTS }, (_, i) => promoKey(i)),
  ...Object.values(SHOP_KEYS),
  'shop_social_links',
  ...Object.values(BANK_KEYS),
];

export type PromoForm = {
  enabled: boolean;
  big: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  image: string;
  startsAt: string;
  endsAt: string;
};

type Keyed<T extends Record<string, string>> = { -readonly [K in keyof T]: string };

export type SettingsForm = {
  announcements: string[];
  hero: Keyed<typeof HERO_KEYS>;
  promos: PromoForm[];
  categoryImages: Record<string, string>;
  shop: Keyed<typeof SHOP_KEYS> & { socialLinks: string };
  bank: Keyed<typeof BANK_KEYS>;
};

const EMPTY_PROMO: PromoForm = { enabled: true, big: '', title: '', subtitle: '', cta: '', href: '', image: '', startsAt: '', endsAt: '' };

function readKeys<T extends Record<string, string>>(keys: T, s: Record<string, string>): Keyed<T> {
  return Object.fromEntries(Object.entries(keys).map(([field, key]) => [field, s[key] ?? ''])) as Keyed<T>;
}

function readPromo(raw: string | undefined): PromoForm {
  try {
    const v = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const str = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : '');
    return {
      enabled: v.enabled !== false,
      big: str('big'), title: str('title'), subtitle: str('subtitle'), cta: str('cta'), href: str('href'),
      image: str('image'), startsAt: str('startsAt'), endsAt: str('endsAt'),
    };
  } catch {
    return { ...EMPTY_PROMO };
  }
}

export function settingsToForm(s: Record<string, string>): SettingsForm {
  const lines = parseAnnouncements(s[SETTING_KEYS.announcements]) ?? [];
  return {
    announcements: Array.from({ length: MAX_ANNOUNCEMENTS }, (_, i) => lines[i] ?? ''),
    hero: readKeys(HERO_KEYS, s),
    promos: Array.from({ length: PROMO_SLOTS }, (_, i) => readPromo(s[promoKey(i)])),
    categoryImages: parseCategoryImages(s[SETTING_KEYS.categoryImages]),
    shop: { ...readKeys(SHOP_KEYS, s), socialLinks: parseSocialLinks(s.shop_social_links).join('\n') },
    bank: readKeys(BANK_KEYS, s),
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isHttps = (v: string) => v.startsWith('https://');

function writeKeys<T extends Record<string, string>>(keys: T, values: Keyed<T>, out: Record<string, string>) {
  for (const [field, key] of Object.entries(keys)) out[key] = (values[field as keyof T] ?? '').trim();
}

// Validated settings ready for PATCH /settings ({ key: value }). An emptied value is saved as ""
// (the readers treat "" as "not set"), so the owner can clear anything from the form.
export function formToSettings(f: SettingsForm): { settings: Record<string, string>; errors: FieldErrors } {
  const settings: Record<string, string> = {};
  const errors: FieldErrors = {};

  settings[SETTING_KEYS.announcements] = JSON.stringify(f.announcements.map((l) => l.trim()).filter(Boolean).slice(0, MAX_ANNOUNCEMENTS));

  writeKeys(HERO_KEYS, f.hero, settings);
  for (const field of ['ctaHref', 'cta2Href'] as const) {
    const href = settings[HERO_KEYS[field]];
    if (href && !isSafeHref(href)) errors[`hero.${field}`] = 'Link phải bắt đầu bằng / (trang trong shop) hoặc https://';
  }
  if (settings[HERO_KEYS.image] && !isHttps(settings[HERO_KEYS.image])) errors['hero.image'] = 'Ảnh phải là link https://';

  f.promos.forEach((raw, i) => {
    const p = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])) as PromoForm;
    const filled = [p.big, p.title, p.subtitle, p.cta, p.href, p.image, p.startsAt, p.endsAt].some(Boolean);
    if (!filled) {
      settings[promoKey(i)] = '';
      return;
    }
    if (!p.title) errors[`promos.${i}.title`] = 'Nhập tiêu đề';
    if (!p.href || !isSafeHref(p.href)) errors[`promos.${i}.href`] = 'Nhập link bắt đầu bằng / hoặc https://';
    if (p.image && !isHttps(p.image)) errors[`promos.${i}.image`] = 'Ảnh phải là link https://';
    if (p.startsAt && !DAY.test(p.startsAt)) errors[`promos.${i}.startsAt`] = 'Ngày không hợp lệ';
    if (p.endsAt && !DAY.test(p.endsAt)) errors[`promos.${i}.endsAt`] = 'Ngày không hợp lệ';
    if (p.startsAt && p.endsAt && p.endsAt < p.startsAt) errors[`promos.${i}.endsAt`] = 'Ngày kết thúc phải sau ngày bắt đầu';
    const json: Record<string, unknown> = {};
    for (const k of ['title', 'href', 'subtitle', 'cta', 'big', 'image'] as const) if (p[k]) json[k] = p[k];
    json.enabled = p.enabled;
    if (p.startsAt) json.startsAt = p.startsAt;
    if (p.endsAt) json.endsAt = p.endsAt;
    settings[promoKey(i)] = JSON.stringify(json);
  });

  settings[SETTING_KEYS.categoryImages] = JSON.stringify(
    Object.fromEntries(Object.entries(f.categoryImages).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)),
  );
  for (const [slug, url] of Object.entries(f.categoryImages)) {
    if (url.trim() && !isHttps(url.trim())) errors[`categoryImages.${slug}`] = 'Ảnh phải là link https://';
  }

  writeKeys(SHOP_KEYS, f.shop, settings);
  const socialLines = f.shop.socialLinks.split('\n').map((l) => l.trim()).filter(Boolean);
  if (socialLines.some((l) => !isHttps(l))) errors['shop.socialLinks'] = 'Mỗi dòng một link https://';
  settings.shop_social_links = JSON.stringify(socialLines);

  writeKeys(BANK_KEYS, f.bank, settings);
  return { settings, errors };
}
