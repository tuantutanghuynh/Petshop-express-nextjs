import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Legacy uploads served by the Express server in development.
      { protocol: 'http', hostname: 'localhost', port: '4000', pathname: '/uploads/**' },
      // New uploads (multer → Cloudinary). Keep in sync with imageSrc() in lib/storefront.ts.
      { protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' },
    ],
  },
  // Anything that is not the production site (local, staging, Vercel previews) must stay out of
  // search results. A header covers every response, including pages that set their own `robots`
  // metadata (page metadata replaces the layout's, so a layout-level noindex can be undone).
  // APP_ENV must be set at build AND start time; production sets APP_ENV=production.
  async headers() {
    if (process.env.APP_ENV === 'production') return [];
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  },
};

export default nextConfig;
