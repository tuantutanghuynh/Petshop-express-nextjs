'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { GALLERY_LIMITS, galleryBody, galleryToForm, validateGalleryForm, type GalleryFormValues } from '../../../lib/adminGallery';
import { revalidateStorefront } from '../../../lib/adminRevalidate';
import { fieldErrors, focusFirstError, type FieldErrors } from '../../../lib/forms';
import type { GalleryItem } from '../../../lib/types';
import { FormAlert } from '../../ui/FormAlert';
import { TextField } from '../../ui/TextField';
import { ImageUploadField } from '../ImageUploadField';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; values: GalleryFormValues };

// Add (no id) or edit one gallery photo (spec 2026-11-10). The image is uploaded first; the photo
// row is only written on "Lưu". Saving refreshes the public /gallery cache and goes back to the list.
export function GalleryForm({ id }: { id?: string }) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>(id ? { state: 'loading' } : { state: 'ready', values: galleryToForm(null) });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    authFetch<GalleryItem>(`/gallery/${id}`)
      .then((res) => active && setLoad(res.data ? { state: 'ready', values: galleryToForm(res.data) } : { state: 'error' }))
      .catch(() => active && setLoad({ state: 'error' }));
    return () => {
      active = false;
    };
  }, [id]);

  if (load.state === 'loading') return <div aria-busy="true" aria-label="Đang tải ảnh" className="h-96 max-w-xl animate-pulse rounded-card bg-line" />;
  if (load.state === 'error') return <FormAlert message="Không tìm thấy ảnh này, hoặc chưa tải được. Tải lại trang để thử lại." />;

  const values = load.values;
  const set = (patch: Partial<GalleryFormValues>) => setLoad({ state: 'ready', values: { ...values, ...patch } });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const found = validateGalleryForm(values);
    setErrors(found);
    setAlert(null);
    if (Object.keys(found).length > 0) return focusFirstError(form, found);
    setSaving(true);
    try {
      const res = await authFetch<GalleryItem>(id ? `/gallery/${id}` : '/gallery', { method: id ? 'PUT' : 'POST', body: JSON.stringify(galleryBody(values)) });
      if (res.error) {
        const server = fieldErrors(res.error.details);
        setErrors(server);
        setAlert(Object.keys(server).length > 0 ? 'Có ô chưa hợp lệ, xem các dòng báo đỏ.' : res.error.message || 'Chưa lưu được ảnh.');
        setSaving(false);
        return;
      }
      await revalidateStorefront(['gallery']);
      router.push('/admin/gallery');
    } catch {
      setAlert('Chưa lưu được ảnh. Kiểm tra mạng rồi thử lại.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex max-w-xl flex-col gap-4">
      <FormAlert message={alert} />
      <ImageUploadField name="imageUrl" label="Ảnh *" value={values.imageUrl} error={errors.imageUrl} hint="JPG, PNG hoặc WebP, tối đa 15MB."
        onChange={(imageUrl) => set({ imageUrl })} onUploading={setUploading} />
      <TextField name="altText" label="Mô tả ảnh (alt) *" value={values.altText} error={errors.altText} maxLength={GALLERY_LIMITS.alt}
        hint={`Tả ảnh có gì, ví dụ "Mèo Anh lông ngắn nằm trên nệm". ${values.altText.trim().length}/${GALLERY_LIMITS.alt}`}
        onChange={(e) => set({ altText: e.target.value })} />
      <TextField name="title" label="Tiêu đề (không bắt buộc)" value={values.title} error={errors.title} maxLength={GALLERY_LIMITS.title}
        onChange={(e) => set({ title: e.target.value })} />
      <div className="flex flex-col gap-2 md:flex-row">
        <button type="submit" disabled={saving || uploading} className="min-h-12 w-full rounded-full bg-brand-ink px-6 font-bold text-white disabled:opacity-60 md:w-auto">
          {saving ? 'Đang lưu…' : 'Lưu ảnh'}
        </button>
        <button type="button" onClick={() => router.push('/admin/gallery')} className="min-h-12 w-full rounded-full border border-line px-6 font-bold text-ink md:w-auto">Huỷ</button>
      </div>
    </form>
  );
}
