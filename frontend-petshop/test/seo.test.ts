import { afterEach, describe, expect, it, vi } from 'vitest';
import { SITE_NAME, absoluteUrl, siteUrl } from '../lib/site';
import { buildRobots } from '../lib/seo/robots';
import { buildSitemap } from '../lib/seo/sitemap';

// Site-wide SEO building blocks (.claude/rules/seo.md):
//   - every absolute URL comes from NEXT_PUBLIC_SITE_URL — the project has no domain yet, and the
//     legacy "miniecom-blog.vercel.app" must never appear again;
//   - a production build without that variable must fail loudly instead of publishing canonical
//     URLs that point at localhost;
//   - robots allows every crawler (ADR-001), hides private areas, never blocks /_next/;
//   - the sitemap lists only real public URLs, with lastModified taken from real updatedAt values
//     (never "now"), and leaves lastModified out where no real date exists.

afterEach(() => vi.unstubAllEnvs());

describe('site', () => {
  it('uses the exact brand name', () => {
    expect(SITE_NAME).toBe('Siêu thị của chó mèo');
  });

  it('reads the site URL from NEXT_PUBLIC_SITE_URL and drops a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.vn/');
    expect(siteUrl()).toBe('https://example.vn');
    expect(absoluteUrl('/kien-thuc')).toBe('https://example.vn/kien-thuc');
    expect(absoluteUrl('kien-thuc')).toBe('https://example.vn/kien-thuc');
  });

  it('falls back to localhost outside production', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('APP_ENV', 'development');
    expect(siteUrl()).toBe('http://localhost:3000');
  });

  it('refuses to build production URLs without NEXT_PUBLIC_SITE_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('APP_ENV', 'production');
    expect(() => siteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it('rejects a site URL that is not http(s)', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'example.vn');
    expect(() => siteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});

describe('robots', () => {
  const robots = buildRobots('https://example.vn');
  const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];

  it('allows every crawler, including AI search and training bots (ADR-001)', () => {
    expect(rules).toHaveLength(1);
    expect(rules[0].userAgent).toBe('*');
    expect(rules[0].allow).toBe('/');
  });

  it('hides private areas but never /_next/ (pages need it to render)', () => {
    const disallow = ([] as string[]).concat(rules[0].disallow ?? []);
    for (const path of ['/admin', '/gio-hang', '/dat-hang', '/tai-khoan']) expect(disallow).toContain(path);
    expect(disallow.some((p) => p.startsWith('/_next'))).toBe(false);
  });

  it('points to the sitemap on the configured domain', () => {
    expect(robots.sitemap).toBe('https://example.vn/sitemap.xml');
  });
});

describe('sitemap', () => {
  const posts = [
    { slug: 'tay-giun-cho-meo', updatedAt: '2026-10-12T08:00:00.000Z' },
    { slug: 've-ran-o-cho', updatedAt: '2026-10-02T08:00:00.000Z' },
  ];
  const entries = buildSitemap('https://example.vn', posts);
  const urls = entries.map((e) => e.url);

  it('lists the public pages and every published post on the configured domain', () => {
    expect(urls).toEqual([
      'https://example.vn',
      'https://example.vn/blog',
      'https://example.vn/gallery',
      'https://example.vn/blog/tay-giun-cho-meo',
      'https://example.vn/blog/ve-ran-o-cho',
    ]);
    expect(urls.join(' ')).not.toMatch(/miniecom|localhost/);
  });

  it('uses the real updatedAt for posts and no invented date for static pages', () => {
    const byUrl = Object.fromEntries(entries.map((e) => [e.url, e.lastModified]));
    expect(byUrl['https://example.vn/blog/tay-giun-cho-meo']).toBe('2026-10-12T08:00:00.000Z');
    expect(byUrl['https://example.vn']).toBeUndefined();
    expect(byUrl['https://example.vn/blog']).toBeUndefined();
  });

  it('never lists private areas', () => {
    expect(urls.some((u) => /\/(admin|gio-hang|dat-hang|tai-khoan)/.test(u))).toBe(false);
  });

  it('encodes slugs safely', () => {
    const [entry] = buildSitemap('https://example.vn', [{ slug: 'cho mèo & bạn', updatedAt: '2026-10-01T00:00:00.000Z' }]).slice(-1);
    expect(entry.url).toBe('https://example.vn/blog/cho%20m%C3%A8o%20%26%20b%E1%BA%A1n');
  });
});
