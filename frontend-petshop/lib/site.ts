// Site identity and absolute URLs. One place, because the brand name must read exactly the same
// everywhere (title template, Open Graph, JSON-LD, footer) and every absolute URL must come from
// NEXT_PUBLIC_SITE_URL — the project has no domain yet, and the legacy demo domain that used to be
// hardcoded here would have told search engines that every page lives somewhere else.

export const SITE_NAME = 'Siêu thị của chó mèo';
export const SITE_TAGLINE = 'Yêu thương từng bé cưng';
export const SITE_DESCRIPTION =
  'Thức ăn, pate, phụ kiện cho chó mèo và kiến thức chăm sóc, dinh dưỡng, sức khoẻ thú cưng từ người nuôi thật.';

// The storefront this frontend serves. The backend needs it as X-Brand-Slug for cart, orders and
// quote requests, and it is the slug of the root category whose children are the shop's categories.
export const BRAND_SLUG = process.env.NEXT_PUBLIC_BRAND_SLUG || 'petshop';

const DEV_SITE_URL = 'http://localhost:3000';

// Base URL without a trailing slash. Outside production a missing value falls back to localhost so
// `npm run dev` works with no setup. In production it throws: a build that silently used localhost
// would ship canonical URLs, Open Graph links and a sitemap pointing at a machine nobody can reach.
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) {
    if (process.env.APP_ENV === 'production') {
      throw new Error('NEXT_PUBLIC_SITE_URL must be set for a production build (e.g. https://tupetshop.vn)');
    }
    return DEV_SITE_URL;
  }
  if (!/^https?:\/\//i.test(raw)) {
    throw new Error(`NEXT_PUBLIC_SITE_URL must start with http:// or https:// (got "${raw}")`);
  }
  return raw.replace(/\/+$/, '');
}

export function absoluteUrl(path: string): string {
  return `${siteUrl()}/${path.replace(/^\/+/, '')}`;
}
