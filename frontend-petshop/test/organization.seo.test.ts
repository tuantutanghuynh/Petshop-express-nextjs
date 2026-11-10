import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND_LOGO } from '../lib/brand';
import { organizationJsonLd } from '../lib/seo/structuredData';

// Homepage Organization: the brand name and its real logo file (brand guide v1.0), contact and
// social links only when configured.
const BASE = 'https://example.vn';

describe('organizationJsonLd', () => {
  it('names the brand and points to the icon logo on the configured domain', () => {
    expect(organizationJsonLd(BASE, { socialLinks: [], phone: '' })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${BASE}/#organization`,
      name: 'Woofle & Meowcaron',
      alternateName: 'Siêu thị của chó mèo',
      url: BASE,
      logo: `${BASE}/brand/logo-icon-512.png`,
      description: expect.any(String),
    });
  });

  it('adds sameAs and a contact point only when they exist', () => {
    const ld = organizationJsonLd(BASE, { socialLinks: ['https://facebook.com/x'], phone: '0900000000' });
    expect(ld.sameAs).toEqual(['https://facebook.com/x']);
    expect(ld.contactPoint).toMatchObject({ telephone: '0900000000', contactType: 'customer service' });
  });
});

describe('brand files', () => {
  it.each(Object.entries(BRAND_LOGO))('%s exists in public/', (_name, path) => {
    expect(existsSync(join(__dirname, '..', 'public', path))).toBe(true);
  });
});
