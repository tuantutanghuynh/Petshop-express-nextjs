import { describe, expect, it } from 'vitest';
import { GALLERY_LIMITS, GALLERY_PAGE_SIZE, galleryAdminHref, galleryApiPath, galleryBody, galleryToForm, parseGalleryPage, validateGalleryForm } from '../lib/adminGallery';
import type { GalleryItem } from '../lib/types';

// Gallery photo form (spec 2026-11-10). The backend enforces the same limits (routes/gallery.route.ts).
const ok = { imageUrl: 'https://res.cloudinary.com/demo/meo.jpg', title: '', altText: 'Mèo con nằm ngủ' };

describe('validateGalleryForm', () => {
  it('accepts a photo with alt text and no title', () => {
    expect(validateGalleryForm(ok)).toEqual({});
  });

  it('needs an image and alt text', () => {
    expect(validateGalleryForm({ ...ok, imageUrl: '' })).toEqual({ imageUrl: 'Chọn ảnh' });
    expect(validateGalleryForm({ ...ok, altText: '   ' })).toEqual({ altText: 'Nhập mô tả ảnh' });
  });

  it('allows the limits and refuses one character more', () => {
    expect(validateGalleryForm({ ...ok, altText: 'a'.repeat(GALLERY_LIMITS.alt), title: 'a'.repeat(GALLERY_LIMITS.title) })).toEqual({});
    expect(validateGalleryForm({ ...ok, altText: 'a'.repeat(201) })).toEqual({ altText: 'Tối đa 200 ký tự' });
    expect(validateGalleryForm({ ...ok, title: 'a'.repeat(121) })).toEqual({ title: 'Tối đa 120 ký tự' });
  });
});

describe('galleryBody / galleryToForm', () => {
  it('trims and sends an empty title as null', () => {
    expect(galleryBody({ imageUrl: ' u ', title: '  ', altText: ' Mèo ' })).toEqual({ imageUrl: 'u', title: null, altText: 'Mèo' });
    expect(galleryBody({ ...ok, title: ' Bé Miu ' }).title).toBe('Bé Miu');
  });

  it('fills the form from a stored photo', () => {
    const item: GalleryItem = { id: '1', title: null, imageUrl: 'u', altText: 'a' };
    expect(galleryToForm(item)).toEqual({ imageUrl: 'u', title: '', altText: 'a' });
    expect(galleryToForm(null)).toEqual({ imageUrl: '', title: '', altText: '' });
  });
});

describe('gallery list URLs', () => {
  it('reads the page from the URL and builds one address per page', () => {
    expect(parseGalleryPage(new URLSearchParams('page=3'))).toBe(3);
    for (const bad of ['', 'page=0', 'page=-2', 'page=1.5', 'page=abc']) expect(parseGalleryPage(new URLSearchParams(bad)), bad).toBe(1);
    expect(galleryAdminHref(1)).toBe('/admin/gallery');
    expect(galleryAdminHref(2)).toBe('/admin/gallery?page=2');
    expect(galleryApiPath(2)).toBe(`/gallery?page=2&pageSize=${GALLERY_PAGE_SIZE}`);
  });
});
