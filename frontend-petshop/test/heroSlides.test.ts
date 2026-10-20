import { describe, expect, it } from 'vitest';
import { HERO_SLIDES_KEY, MAX_HERO_SLIDES, legacyHero, nextIndex, parseHeroSlides } from '../lib/heroSlides';

// Homepage hero slides (spec 2026-10-21): edited in /admin/cau-hinh, stored as JSON. Whatever is
// stored, the homepage shows at least one safe slide, and the old single hero keeps working until
// the owner saves a slide list.
const now = new Date('2026-10-21T05:00:00Z');
const slides = (list: unknown[]) => ({ [HERO_SLIDES_KEY]: JSON.stringify(list) });

describe('parseHeroSlides', () => {
  it('uses the old single hero until a slide list is saved', () => {
    const out = parseHeroSlides({ homepage_hero_title: 'Cũ' }, now);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: 'Cũ', ctaLabel: 'Mua ngay', ctaHref: '/san-pham' });
    expect(parseHeroSlides({ [HERO_SLIDES_KEY]: '' }, now)[0].title).toBe(legacyHero({}).title);
  });

  it('reads saved slides in order, with safe defaults for the main button', () => {
    const out = parseHeroSlides(slides([
      { title: 'Một', accent: 'nhấn', ctaLabel: 'Xem', ctaHref: '/danh-muc/cho', cta2Label: 'Tư vấn', cta2Href: '/tu-van-bao-gia', image: 'https://res.cloudinary.com/x/a.jpg' },
      { title: 'Hai', ctaLabel: 'Xem', ctaHref: 'javascript:alert(1)', cta2Label: 'Thiếu link' },
    ]), now);
    expect(out.map((s) => s.title)).toEqual(['Một', 'Hai']);
    expect(out[0]).toMatchObject({ ctaLabel: 'Xem', ctaHref: '/danh-muc/cho', cta2: { label: 'Tư vấn', href: '/tu-van-bao-gia' }, image: 'https://res.cloudinary.com/x/a.jpg' });
    expect(out[1]).toMatchObject({ ctaLabel: 'Mua ngay', ctaHref: '/san-pham', cta2: null, image: null, badge: '' });
  });

  it('hides disabled, untitled and out-of-date slides', () => {
    const out = parseHeroSlides(slides([
      { title: 'Tắt', enabled: false },
      { title: '' },
      { title: 'Chưa tới', startsAt: '2026-11-01' },
      { title: 'Hết hạn', endsAt: '2026-10-20' },
      { title: 'Đang chạy', startsAt: '2026-10-21', endsAt: '2026-10-21' },
    ]), now);
    expect(out.map((s) => s.title)).toEqual(['Đang chạy']);
  });

  it('falls back to the default hero when nothing saved is visible', () => {
    expect(parseHeroSlides(slides([{ title: 'Tắt', enabled: false }]), now)).toEqual([legacyHero({})]);
    expect(parseHeroSlides({ [HERO_SLIDES_KEY]: '{oops' }, now)).toEqual([legacyHero({})]);
  });

  it(`keeps at most ${MAX_HERO_SLIDES} slides and cuts over-long text`, () => {
    const out = parseHeroSlides(slides(Array.from({ length: 9 }, (_, i) => ({ title: `S${i}`, subtitle: 'x'.repeat(300) }))), now);
    expect(out).toHaveLength(MAX_HERO_SLIDES);
    expect(out[0].subtitle).toHaveLength(240);
  });

  it('drops images from hosts next/image cannot load', () => {
    expect(parseHeroSlides(slides([{ title: 'A', image: 'https://evil.example/a.jpg' }]), now)[0].image).toBeNull();
  });
});

describe('nextIndex', () => {
  it('wraps around both ways', () => {
    expect(nextIndex(0, 3, 1)).toBe(1);
    expect(nextIndex(2, 3, 1)).toBe(0);
    expect(nextIndex(0, 3, -1)).toBe(2);
  });
});
