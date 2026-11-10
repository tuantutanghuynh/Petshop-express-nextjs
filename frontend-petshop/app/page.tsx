import type { Metadata } from 'next';
import { CategoryRow } from '../components/home/CategoryRow';
import { FeatureStrip } from '../components/home/FeatureStrip';
import { FeaturedProducts } from '../components/home/FeaturedProducts';
import { Hero } from '../components/home/Hero';
import { HeroSlider } from '../components/home/HeroSlider';
import { LatestPosts } from '../components/home/LatestPosts';
import { PromoCards } from '../components/home/PromoCards';
import { TrustStrip } from '../components/home/TrustStrip';
import { JsonLd } from '../components/seo/JsonLd';
import { organizationJsonLd } from '../lib/seo/structuredData';
import { HOME_TITLE, SITE_DESCRIPTION, SITE_NAME, siteUrl } from '../lib/site';
import { HERO_SLIDES_KEY, LEGACY_HERO_KEYS, parseHeroSlides } from '../lib/heroSlides';
import { CATEGORY_CIRCLES_KEY, parseCategoryCircles } from '../lib/categoryCircles';
import { SETTING_KEYS, parseCategoryImages } from '../lib/settings';
import { parsePromo } from '../lib/storefront';
import { getNewestProducts } from '../services/catalog';
import { getLatestPosts, getSettings, getShopInfo } from '../services/content';

// Search intent: navigational. Title comes from the root layout's default.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: '/', title: HOME_TITLE, description: SITE_DESCRIPTION },
};

const PROMO_KEYS = [1, 2, 3, 4, 5].map((n) => `homepage_promo_${n}`);
// A failed section must not take the page down: it is logged and shown as an error state, and
// the rest of the homepage still renders.
function settled<T>(result: PromiseSettledResult<T>, label: string): T | null {
  if (result.status === 'fulfilled') return result.value;
  console.error(`homepage: could not load ${label}`, result.reason);
  return null;
}

export default async function HomePage() {
  const [[settingsRes, productsRes, postsRes], shop] = await Promise.all([
    Promise.allSettled([getSettings([...LEGACY_HERO_KEYS, HERO_SLIDES_KEY, ...PROMO_KEYS, SETTING_KEYS.categoryImages, CATEGORY_CIRCLES_KEY]), getNewestProducts(5), getLatestPosts(3)]),
    getShopInfo(), // never throws (falls back to no contact details)
  ]);
  const settings = settled(settingsRes, 'settings') ?? {};
  const heroSlides = parseHeroSlides(settings);
  const base = siteUrl();

  // Schema describes only what the page shows: sameAs only from configured social links, no
  // SearchAction because there is no public search yet.
  const organization = organizationJsonLd(base, shop);
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
      {heroSlides.length > 1 ? <HeroSlider slides={heroSlides} /> : <Hero content={heroSlides[0]} />}
      <FeatureStrip />
      <CategoryRow circles={parseCategoryCircles(settings[CATEGORY_CIRCLES_KEY], parseCategoryImages(settings[SETTING_KEYS.categoryImages]))} />
      <PromoCards promos={PROMO_KEYS.map((k) => parsePromo(settings[k]))} />
      <FeaturedProducts products={settled(productsRes, 'products')} />
      <TrustStrip />
      <LatestPosts posts={settled(postsRes, 'posts')} />
    </main>
  );
}
