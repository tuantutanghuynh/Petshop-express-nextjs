import { describe, expect, it } from 'vitest';
import { MAX_MENU_BRANDS, megaMenuKey, parseMegaMenu } from '../lib/megaMenu';

// Banner and featured brands of the Chó / Mèo mega menus come from /admin/cau-hinh. Whatever is
// stored, the menu never shows a non-https image or an unsafe link, and never breaks.
describe('parseMegaMenu', () => {
  it('reads a banner and brands', () => {
    const raw = JSON.stringify({
      banner: { image: 'https://res.cloudinary.com/x/b.jpg', title: 'Mua sắm cho cún', href: '/danh-muc/cho' },
      brands: [{ name: ' Royal Canin ', logo: 'https://res.cloudinary.com/x/rc.png' }, { name: 'Pedigree' }],
    });
    expect(parseMegaMenu(raw)).toEqual({
      banner: { image: 'https://res.cloudinary.com/x/b.jpg', title: 'Mua sắm cho cún', href: '/danh-muc/cho' },
      brands: [{ name: 'Royal Canin', logo: 'https://res.cloudinary.com/x/rc.png' }, { name: 'Pedigree', logo: null }],
    });
  });

  it('falls back to nothing for missing or malformed values', () => {
    expect(parseMegaMenu(undefined)).toEqual({ banner: null, brands: [] });
    expect(parseMegaMenu('{oops')).toEqual({ banner: null, brands: [] });
    expect(parseMegaMenu('[]')).toEqual({ banner: null, brands: [] });
  });

  it('drops unsafe parts but keeps the rest', () => {
    const raw = JSON.stringify({
      banner: { image: 'http://insecure/b.jpg', href: '/x' },
      brands: [{ name: '', logo: 'https://a/l.png' }, { name: 'A', logo: 'javascript:alert(1)' }, { name: 'x'.repeat(61) }],
    });
    expect(parseMegaMenu(raw)).toEqual({ banner: null, brands: [{ name: 'A', logo: null }] });
    const badHref = parseMegaMenu(JSON.stringify({ banner: { image: 'https://a/b.jpg', href: 'javascript:alert(1)' } }));
    expect(badHref.banner?.href).toBeNull();
  });

  it(`keeps at most ${MAX_MENU_BRANDS} brands`, () => {
    const raw = JSON.stringify({ brands: Array.from({ length: 12 }, (_, i) => ({ name: `B${i}` })) });
    expect(parseMegaMenu(raw).brands).toHaveLength(MAX_MENU_BRANDS);
  });

  it('names the setting after the species slug', () => {
    expect(megaMenuKey('cho')).toBe('mega_menu_cho');
  });
});
