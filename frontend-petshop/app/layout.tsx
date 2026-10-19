import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import type { ReactNode } from 'react';
import { BottomNav } from '../components/layout/BottomNav';
import { SiteFooter } from '../components/layout/SiteFooter';
import { SiteHeader } from '../components/layout/SiteHeader';
import { StoreChrome } from '../components/layout/StoreChrome';
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from '../lib/site';
import { getShopCategories } from '../services/catalog';
import { getContentPages, getShopInfo } from '../services/content';
import './globals.css';

// Rounded geometric sans like the mock-up. The "vietnamese" subset is required: without it the
// browser falls back to another font for every accented letter (ư, ơ, ế…), mid-word.
const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  // Three weights only: each one is another font file on the critical path of the hero text (LCP).
  weight: ['400', '700', '800'],
  display: 'swap',
  variable: '--font-be-vietnam',
});

export const metadata: Metadata = {
  // Every relative canonical / Open Graph URL below is resolved against this — from
  // NEXT_PUBLIC_SITE_URL, never a hardcoded domain (lib/site.ts).
  metadataBase: new URL(siteUrl()),
  title: { default: `${SITE_NAME} – Thức ăn, pate, phụ kiện chó mèo`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { siteName: SITE_NAME, locale: 'vi_VN', type: 'website' },
  twitter: { card: 'summary_large_image' },
  // No `robots` here on purpose: page-level robots would override it anyway. Staging and
  // previews are kept out of the index by the X-Robots-Tag header in next.config.ts.
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the layout use env(safe-area-inset-*) on notched phones (bottom tab bar).
  viewportFit: 'cover',
  // The on-screen keyboard shrinks the layout instead of covering focused inputs.
  interactiveWidget: 'resizes-content',
  themeColor: '#087878',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Header and footer data for every page; each read is cached (ISR) and fails soft.
  const [shop, categories, pages] = await Promise.all([
    getShopInfo(),
    getShopCategories().catch((err: unknown) => {
      console.error('layout: could not load categories', err);
      return [];
    }),
    getContentPages(),
  ]);
  return (
    <html lang="vi" className={beVietnam.variable}>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-full focus:bg-surface focus:px-4 focus:py-2">
          Bỏ qua tới nội dung chính
        </a>
        <StoreChrome header={<SiteHeader phone={shop.phone} announcements={shop.announcements} categories={categories} />}
          footer={<SiteFooter shop={shop} categories={categories} pages={pages} />} bottomNav={<BottomNav />}>
          {children}
        </StoreChrome>
      </body>
    </html>
  );
}
