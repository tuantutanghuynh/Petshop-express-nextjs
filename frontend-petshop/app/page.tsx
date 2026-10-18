import type { Metadata } from 'next';
import { CategoryRow } from '../components/home/CategoryRow';
import { FeatureStrip } from '../components/home/FeatureStrip';
import { FeaturedProducts } from '../components/home/FeaturedProducts';
import { Hero, type HeroContent } from '../components/home/Hero';
import { LatestPosts } from '../components/home/LatestPosts';
import { PromoCards } from '../components/home/PromoCards';
import { TrustStrip } from '../components/home/TrustStrip';
import { JsonLd } from '../components/seo/JsonLd';
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from '../lib/site';
import { imageSrc, isSafeHref, parsePromo } from '../lib/storefront';
import type { SiteSettings } from '../lib/types';
import { getNewestProducts, getShopCategories } from '../services/catalog';
import { getLatestPosts, getSettings, getShopInfo } from '../services/content';

// Search intent: navigational. Title comes from the root layout's default.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: '/', title: `${SITE_NAME} – Thức ăn, pate, phụ kiện chó mèo`, description: SITE_DESCRIPTION },
};

const PROMO_KEYS = [1, 2, 3, 4, 5].map((n) => `homepage_promo_${n}`);
const HERO_KEYS = ['title', 'accent', 'subtitle', 'cta_label', 'cta_href', 'image'].map((k) => `homepage_hero_${k}`);

// Copy used until the admin fills the homepage_hero_* settings. The default button goes to the
// care articles because the shop pages are not built yet.
function heroFrom(s: SiteSettings): HeroContent {
  const href = s.homepage_hero_cta_href;
  return {
    title: s.homepage_hero_title || 'Lựa chọn tốt nhất',
    accent: s.homepage_hero_accent || 'cho bé cưng nhà bạn',
    subtitle: s.homepage_hero_subtitle || 'Thức ăn dinh dưỡng, pate, phụ kiện chất lượng và kiến thức chăm sóc chó mèo từ người nuôi thật.',
    ctaLabel: s.homepage_hero_cta_label || 'Đọc kiến thức chăm sóc',
    ctaHref: href && isSafeHref(href) ? href : '/blog',
    image: imageSrc(s.homepage_hero_image),
  };
}

// A failed section must not take the page down: it is logged and shown as an error state, and
// the rest of the homepage still renders.
function settled<T>(result: PromiseSettledResult<T>, label: string): T | null {
  if (result.status === 'fulfilled') return result.value;
  console.error(`homepage: could not load ${label}`, result.reason);
  return null;
}

export default async function HomePage() {
  const [[settingsRes, categoriesRes, productsRes, postsRes], shop] = await Promise.all([
    Promise.allSettled([getSettings([...HERO_KEYS, ...PROMO_KEYS]), getShopCategories(), getNewestProducts(5), getLatestPosts(3)]),
    getShopInfo(), // never throws (falls back to no contact details)
  ]);
  const settings = settled(settingsRes, 'settings') ?? {};
  const base = siteUrl();

  // Schema describes only what the page shows: no logo until a real logo file exists, sameAs
  // only from configured social links, no SearchAction because there is no public search yet.
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${base}/#organization`,
    name: SITE_NAME,
    url: base,
    description: SITE_DESCRIPTION,
    ...(shop.socialLinks.length > 0 && { sameAs: shop.socialLinks }),
    ...(shop.phone && { contactPoint: { '@type': 'ContactPoint', telephone: shop.phone, contactType: 'customer service', availableLanguage: 'vi' } }),
  };
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${base}/#website`,
    name: SITE_NAME,
    url: base,
    inLanguage: 'vi',
    publisher: { '@id': `${base}/#organization` },
  };

  return (
    <main id="main">
      <JsonLd data={organization} />
      <JsonLd data={website} />
      <Hero content={heroFrom(settings)} />
      <FeatureStrip />
      <CategoryRow categories={settled(categoriesRes, 'categories') ?? []} />
      <PromoCards promos={PROMO_KEYS.map((k) => parsePromo(settings[k]))} />
      <FeaturedProducts products={settled(productsRes, 'products')} />
      <TrustStrip />
      <LatestPosts posts={settled(postsRes, 'posts')} />
    </main>
  );
}
