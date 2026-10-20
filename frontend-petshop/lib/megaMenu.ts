import { isSafeHref } from './storefront';

// Banner and featured brands of the Chó / Mèo mega menus, edited in /admin/cau-hinh and stored as
// JSON in mega_menu_<species slug> (test/megaMenu.test.ts). Anything unusable is dropped: the menu
// still shows the category tree without them.
export const MEGA_MENU_SLUGS = ['cho', 'meo'];
export const MAX_MENU_BRANDS = 8;
export const MAX_BRAND_NAME = 60;
const MAX_BANNER_TITLE = 80;

export type MegaMenuBanner = { image: string; title: string; href: string | null };
export type MegaMenuBrand = { name: string; logo: string | null };
export type MegaMenuExtras = { banner: MegaMenuBanner | null; brands: MegaMenuBrand[] };

export const megaMenuKey = (slug: string) => `mega_menu_${slug}`;

const EMPTY: MegaMenuExtras = { banner: null, brands: [] };
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const httpsUrl = (v: unknown) => (text(v).startsWith('https://') ? text(v) : null);

export function parseMegaMenu(raw: string | undefined): MegaMenuExtras {
  let value: unknown;
  try {
    value = raw ? JSON.parse(raw) : undefined;
  } catch {
    return EMPTY; // malformed setting = not set
  }
  if (!isObject(value)) return EMPTY;

  const b = isObject(value.banner) ? value.banner : {};
  const image = httpsUrl(b.image);
  const href = text(b.href);
  const banner = image ? { image, title: text(b.title).slice(0, MAX_BANNER_TITLE), href: href && isSafeHref(href) ? href : null } : null;

  const brands = (Array.isArray(value.brands) ? value.brands : [])
    .filter(isObject)
    .map((x) => ({ name: text(x.name), logo: httpsUrl(x.logo) }))
    .filter((x) => x.name.length > 0 && x.name.length <= MAX_BRAND_NAME)
    .slice(0, MAX_MENU_BRANDS);
  return { banner, brands };
}
