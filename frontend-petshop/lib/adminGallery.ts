import type { FieldErrors } from './forms';
import type { GalleryItem } from './types';

// Rules of the gallery photo form (test/adminGallery.test.ts). The backend enforces the same limits
// (routes/gallery.route.ts); these catch mistakes before the round trip.
export const GALLERY_LIMITS = { title: 120, alt: 200 } as const;

export type GalleryFormValues = { imageUrl: string; title: string; altText: string };

export function galleryToForm(item: GalleryItem | null): GalleryFormValues {
  return { imageUrl: item?.imageUrl ?? '', title: item?.title ?? '', altText: item?.altText ?? '' };
}

export function validateGalleryForm(v: GalleryFormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!v.imageUrl.trim()) errors.imageUrl = 'Chọn ảnh';
  const alt = v.altText.trim();
  if (!alt) errors.altText = 'Nhập mô tả ảnh';
  else if (alt.length > GALLERY_LIMITS.alt) errors.altText = `Tối đa ${GALLERY_LIMITS.alt} ký tự`;
  if (v.title.trim().length > GALLERY_LIMITS.title) errors.title = `Tối đa ${GALLERY_LIMITS.title} ký tự`;
  return errors;
}

export function galleryBody(v: GalleryFormValues): { imageUrl: string; title: string | null; altText: string } {
  return { imageUrl: v.imageUrl.trim(), title: v.title.trim() || null, altText: v.altText.trim() };
}

// /admin/gallery keeps its page in the URL (back / forward and reload land on the same page).
export const GALLERY_PAGE_SIZE = 24;
const GALLERY_BASE = '/admin/gallery';

export function parseGalleryPage(sp: URLSearchParams): number {
  const page = Number(sp.get('page'));
  return Number.isInteger(page) && page > 1 ? page : 1;
}

export function galleryAdminHref(page: number): string {
  return page > 1 ? `${GALLERY_BASE}?page=${page}` : GALLERY_BASE;
}

export function galleryApiPath(page: number): string {
  return `/gallery?page=${page}&pageSize=${GALLERY_PAGE_SIZE}`;
}
