import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_CIRCLES, MAX_CATEGORY_CIRCLES, parseCategoryCircles } from '../lib/categoryCircles';
import { isWithinDates, parseAnnouncements, parseCategoryImages, zaloHref } from '../lib/settings';
import { parsePromo } from '../lib/storefront';

// Shop owner–editable homepage content (/admin/cau-hinh). Whatever the admin saved, the public
// pages must never show a broken link, a non-https image, or a promotion outside its dates.

describe('parseAnnouncements', () => {
  it('reads up to three non-empty lines', () => {
    expect(parseAnnouncements(JSON.stringify(['Giảm 10% pate', ' ', 'Freeship nội thành', 'Thứ tư', 'Thứ năm']))).toEqual([
      'Giảm 10% pate', 'Freeship nội thành', 'Thứ tư',
    ]);
  });

  it('returns null (use the defaults) when nothing usable was saved', () => {
    expect(parseAnnouncements(undefined)).toBeNull();
    expect(parseAnnouncements('not json')).toBeNull();
    expect(parseAnnouncements('[]')).toBeNull();
    expect(parseAnnouncements('[1, 2]')).toBeNull();
  });
});

describe('isWithinDates (Vietnam time, whole days)', () => {
  const at = (iso: string) => new Date(iso);
  it('is active from 00:00 of the start day to 23:59 of the end day, Vietnam time', () => {
    const promo = { startsAt: '2026-10-20', endsAt: '2026-10-31' };
    expect(isWithinDates(promo, at('2026-10-19T16:59:00Z'))).toBe(false); // 23:59 on the 19th in VN
    expect(isWithinDates(promo, at('2026-10-19T17:00:00Z'))).toBe(true); // 00:00 on the 20th in VN
    expect(isWithinDates(promo, at('2026-10-31T16:59:00Z'))).toBe(true); // 23:59 on the 31st in VN
    expect(isWithinDates(promo, at('2026-10-31T17:00:00Z'))).toBe(false);
  });

  it('treats a missing date as open-ended and a malformed one as no date', () => {
    expect(isWithinDates({}, at('2030-01-01T00:00:00Z'))).toBe(true);
    expect(isWithinDates({ endsAt: '2026-10-31' }, at('2026-01-01T00:00:00Z'))).toBe(true);
    expect(isWithinDates({ startsAt: 'soon' }, at('2026-01-01T00:00:00Z'))).toBe(true);
  });
});

describe('parsePromo with on/off switch and dates', () => {
  const base = { title: 'Pate -20%', href: '/danh-muc/pate' };
  const now = new Date('2026-10-25T05:00:00Z');

  it('hides a switched-off promotion', () => {
    expect(parsePromo(JSON.stringify({ ...base, enabled: false }), now)).toBeNull();
    expect(parsePromo(JSON.stringify({ ...base, enabled: true }), now)).toMatchObject(base);
  });

  it('hides a promotion outside its dates', () => {
    expect(parsePromo(JSON.stringify({ ...base, startsAt: '2026-11-01' }), now)).toBeNull();
    expect(parsePromo(JSON.stringify({ ...base, endsAt: '2026-10-24' }), now)).toBeNull();
    expect(parsePromo(JSON.stringify({ ...base, startsAt: '2026-10-20', endsAt: '2026-10-31' }), now)).toMatchObject(base);
  });
});

describe('parseCategoryImages', () => {
  it('keeps https images keyed by category slug', () => {
    expect(parseCategoryImages(JSON.stringify({ pate: 'https://res.cloudinary.com/x/pate.jpg', meo: 'http://plain.example/x.jpg', 'Bad Slug': 'https://a/b.jpg' }))).toEqual({
      pate: 'https://res.cloudinary.com/x/pate.jpg',
    });
    expect(parseCategoryImages(undefined)).toEqual({});
    expect(parseCategoryImages('[1]')).toEqual({});
  });
});

// "Mua theo bé cưng" circles (wireframe: Mèo, Chó, Thức ăn, Pate, Phụ kiện, Sức khoẻ), edited in
// /admin/cau-hinh. Until the owner saves a list, the six wireframe circles show, keeping any Chó /
// Mèo image uploaded under the older per-category setting.
describe('parseCategoryCircles', () => {
  it('shows the six wireframe circles until a list is saved', () => {
    const circles = parseCategoryCircles(undefined, { cho: 'https://res.cloudinary.com/x/cho.jpg' });
    expect(circles.map((c) => c.label)).toEqual(['Mèo', 'Chó', 'Thức ăn', 'Pate', 'Phụ kiện', 'Sức khoẻ']);
    expect(circles.find((c) => c.label === 'Chó')).toEqual({ label: 'Chó', href: '/danh-muc/cho', image: 'https://res.cloudinary.com/x/cho.jpg' });
    expect(circles.find((c) => c.label === 'Mèo')?.image).toBeNull();
    expect(DEFAULT_CATEGORY_CIRCLES.every((c) => c.href.startsWith('/danh-muc/'))).toBe(true);
  });

  it('reads a saved list and drops unusable rows', () => {
    const raw = JSON.stringify([
      { label: ' Pate ', href: '/danh-muc/pate-cho-meo', image: 'https://res.cloudinary.com/x/p.jpg' },
      { label: 'No link' },
      { label: 'Bad', href: 'javascript:alert(1)' },
      { label: '', href: '/x' },
      { label: 'x'.repeat(41), href: '/x' },
      { label: 'Http image', href: '/x', image: 'http://a/b.jpg' },
    ]);
    expect(parseCategoryCircles(raw, {})).toEqual([
      { label: 'Pate', href: '/danh-muc/pate-cho-meo', image: 'https://res.cloudinary.com/x/p.jpg' },
      { label: 'Http image', href: '/x', image: null },
    ]);
  });

  it(`keeps at most ${MAX_CATEGORY_CIRCLES} and falls back to the defaults when nothing usable is saved`, () => {
    const many = JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ label: `C${i}`, href: `/c${i}` })));
    expect(parseCategoryCircles(many, {})).toHaveLength(MAX_CATEGORY_CIRCLES);
    expect(parseCategoryCircles('[]', {})).toHaveLength(6);
    expect(parseCategoryCircles('{oops', {})).toHaveLength(6);
  });
});

describe('zaloHref', () => {
  it('turns a phone number into a zalo.me link and keeps an https link', () => {
    expect(zaloHref('0901 234 567')).toBe('https://zalo.me/0901234567');
    expect(zaloHref('https://zalo.me/g/abcdef')).toBe('https://zalo.me/g/abcdef');
  });

  it('ignores anything else', () => {
    expect(zaloHref(undefined)).toBeNull();
    expect(zaloHref('zalo shop')).toBeNull();
    expect(zaloHref('http://zalo.me/1')).toBeNull();
  });
});
