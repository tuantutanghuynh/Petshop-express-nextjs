import { describe, expect, it } from 'vitest';
import { ADMIN_SETTING_KEYS, formToSettings, settingsToForm } from '../lib/adminSettings';

// The /admin/cau-hinh form: saved settings → form fields → settings again. The form must round-trip
// what is stored, refuse what the public pages would have to throw away (unsafe links, non-https
// images, an end date before the start date), and clear a promotion when all its fields are emptied.

const stored = {
  announcement_items: JSON.stringify(['Giảm 10% pate', 'Freeship nội thành']),
  homepage_hero_title: 'Lựa chọn tốt nhất',
  homepage_hero_cta_href: '/san-pham',
  homepage_promo_1: JSON.stringify({ title: 'Pate -20%', href: '/danh-muc/pate', big: '-20%', enabled: true, startsAt: '2026-10-20', endsAt: '2026-10-31' }),
  homepage_category_images: JSON.stringify({ pate: 'https://res.cloudinary.com/x/pate.jpg' }),
  shop_phone: '0901 234 567',
  shop_social_links: JSON.stringify(['https://facebook.com/shop']),
  bank_name: 'VCB',
};

describe('settingsToForm / formToSettings', () => {
  it('lists every key the form edits', () => {
    for (const key of ['announcement_items', 'homepage_hero_badge', 'homepage_promo_5', 'homepage_category_images', 'shop_hours', 'bank_holder']) {
      expect(ADMIN_SETTING_KEYS).toContain(key);
    }
  });

  it('round-trips stored settings', () => {
    const form = settingsToForm(stored);
    expect(form.announcements).toEqual(['Giảm 10% pate', 'Freeship nội thành', '']);
    expect(form.promos[0]).toMatchObject({ title: 'Pate -20%', enabled: true, startsAt: '2026-10-20' });
    expect(form.promos[1]).toMatchObject({ title: '', enabled: true });
    expect(form.shop.socialLinks).toBe('https://facebook.com/shop');

    const { settings, errors } = formToSettings(form);
    expect(errors).toEqual({});
    expect(JSON.parse(settings.announcement_items)).toEqual(['Giảm 10% pate', 'Freeship nội thành']);
    expect(JSON.parse(settings.homepage_promo_1)).toEqual({ title: 'Pate -20%', href: '/danh-muc/pate', big: '-20%', enabled: true, startsAt: '2026-10-20', endsAt: '2026-10-31' });
    expect(settings.homepage_promo_2).toBe(''); // empty slot is cleared, not saved as {}
    expect(JSON.parse(settings.homepage_category_images)).toEqual({ pate: 'https://res.cloudinary.com/x/pate.jpg' });
    expect(JSON.parse(settings.shop_social_links)).toEqual(['https://facebook.com/shop']);
    expect(settings.shop_phone).toBe('0901 234 567');
  });

  it('refuses links, images and dates the storefront would have to drop', () => {
    const form = settingsToForm({});
    form.hero.ctaHref = 'javascript:alert(1)';
    form.promos[0] = { ...form.promos[0], title: 'X', href: '//evil.example', image: 'http://x/y.jpg', startsAt: '2026-10-31', endsAt: '2026-10-01' };
    form.promos[1] = { ...form.promos[1], title: 'Y' }; // a promo needs a link too
    form.shop.socialLinks = 'https://facebook.com/a\nfacebook.com/b';
    const { errors } = formToSettings(form);
    expect(Object.keys(errors).sort()).toEqual([
      'hero.ctaHref', 'promos.0.endsAt', 'promos.0.href', 'promos.0.image', 'promos.1.href', 'shop.socialLinks',
    ]);
  });

  it('trims text and drops empty announcement lines', () => {
    const form = settingsToForm({});
    form.announcements = ['  Một  ', '', ' Hai'];
    form.hero.title = '  Tiêu đề ';
    const { settings } = formToSettings(form);
    expect(JSON.parse(settings.announcement_items)).toEqual(['Một', 'Hai']);
    expect(settings.homepage_hero_title).toBe('Tiêu đề');
  });
});
