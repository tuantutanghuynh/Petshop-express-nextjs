import type { MetadataRoute } from 'next';

// Private areas: useless in search results and full of per-user data. Disallow only stops
// crawling; each of these pages must also send `robots: { index: false }` (a disallowed URL that is
// linked from elsewhere can still be indexed without its content).
export const PRIVATE_PATHS = ['/admin', '/api', '/gio-hang', '/dat-hang', '/tai-khoan', '/dang-nhap', '/dang-ky', '/tim-kiem'];

// robots.txt rules. Every crawler is allowed, AI search and training bots included — a business
// decision recorded as ADR-001; changing it is a LARGE task with a new ADR. /_next/ is never
// blocked: it serves the CSS and JS search engines need to render the pages.
export function buildRobots(base: string): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVATE_PATHS }],
    sitemap: `${base}/sitemap.xml`,
  };
}
