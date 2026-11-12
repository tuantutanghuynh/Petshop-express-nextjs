'use client';

import Image from 'next/image';
import { useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { bffFetch } from '../../lib/bffClient';
import { fieldErrors, focusFirstError, type FieldErrors } from '../../lib/forms';
import { REVIEW_IMAGE_TYPES, REVIEW_LIMITS, validateReviewForm, type ReviewFormValues } from '../../lib/reviews';
import { imageSrc } from '../../lib/storefront';
import type { OwnReview } from '../../lib/types';

const STAR_WORDS = ['Rất tệ', 'Tệ', 'Bình thường', 'Tốt', 'Rất tốt'];

// Write (no review yet) or edit one review. Photos upload one at a time through the BFF (the
// backend checks the bytes) before the review is sent. An edit goes back to the shop's queue.
export function ReviewForm({ productId, existing, onSaved }: { productId: string; existing: OwnReview | null; onSaved: (r: OwnReview) => void }) {
  const uid = useId();
  const [values, setValues] = useState<ReviewFormValues>({ rating: existing?.rating ?? 0, content: existing?.content ?? '', images: existing?.images ?? [] });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState<'upload' | 'save' | null>(null);
  const set = (patch: Partial<ReviewFormValues>) => setValues((v) => ({ ...v, ...patch }));

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!(REVIEW_IMAGE_TYPES as readonly string[]).includes(file.type)) return setErrors((x) => ({ ...x, images: 'Chỉ nhận ảnh JPG, PNG hoặc WebP' }));
    if (file.size > REVIEW_LIMITS.imageBytes) return setErrors((x) => ({ ...x, images: 'Ảnh quá lớn, tối đa 5MB' }));
    setBusy('upload');
    const form = new FormData();
    form.append('image', file);
    const res = await bffFetch<{ url: string }>('/api/reviews/images', { method: 'POST', body: form });
    setBusy(null);
    if (!res.ok) return setErrors((x) => ({ ...x, images: res.error.message || 'Chưa tải được ảnh lên.' }));
    setErrors(({ images: _drop, ...rest }) => rest);
    set({ images: [...values.images, res.data.url] });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const found = validateReviewForm(values);
    setErrors(found);
    setAlert(null);
    if (Object.keys(found).length > 0) return focusFirstError(form, found);
    setBusy('save');
    const payload = { rating: values.rating, content: values.content.trim(), images: values.images };
    const res = existing
      ? await bffFetch<OwnReview>(`/api/reviews/${existing.id}`, { method: 'PATCH', body: payload })
      : await bffFetch<OwnReview>('/api/reviews', { method: 'POST', body: { productId, ...payload } });
    setBusy(null);
    if (!res.ok) {
      const server = fieldErrors(res.error.details);
      setErrors(server);
      setAlert(Object.keys(server).length ? 'Có ô chưa hợp lệ, xem các dòng báo đỏ.' : res.error.message || 'Chưa gửi được đánh giá.');
      return requestAnimationFrame(() => focusFirstError(form, server));
    }
    onSaved(res.data);
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
      {alert && <p role="alert" className="rounded-card bg-pink-bg px-3 py-2 text-sm text-pink-ink">{alert}</p>}
      <fieldset aria-describedby={errors.rating ? `${uid}-rating-error` : undefined}>
        <legend className="mb-1 text-sm font-bold text-ink">Bạn chấm mấy sao? *</legend>
        <div className="flex flex-wrap items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="grid size-11 cursor-pointer place-items-center rounded-full has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-ink">
              <input type="radio" name="rating" value={n} checked={values.rating === n} onChange={() => set({ rating: n })} className="sr-only" aria-label={`${n} sao: ${STAR_WORDS[n - 1]}`} />
              <span aria-hidden="true" className={`text-3xl leading-none ${n <= values.rating ? 'text-yellow' : 'text-line'}`}>★</span>
            </label>
          ))}
          {values.rating > 0 && <span className="ml-2 text-sm font-bold text-ink">{STAR_WORDS[values.rating - 1]}</span>}
        </div>
        {errors.rating && <p id={`${uid}-rating-error`} className="text-sm text-pink-ink">{errors.rating}</p>}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-content`} className="text-sm font-bold text-ink">Cảm nhận của bạn *</label>
        <textarea id={`${uid}-content`} name="content" rows={5} value={values.content} maxLength={REVIEW_LIMITS.contentMax} onChange={(e) => set({ content: e.target.value })}
          placeholder="Bé nhà bạn có thích không? Hàng có đúng mô tả, đóng gói thế nào?"
          aria-invalid={errors.content ? true : undefined} aria-describedby={errors.content ? `${uid}-content-error` : `${uid}-content-hint`}
          className={`w-full rounded-[var(--radius-sm)] border bg-surface p-3 text-base text-ink ${errors.content ? 'border-pink-ink' : 'border-line'}`} />
        <p id={`${uid}-content-hint`} className="text-xs text-muted">{values.content.trim().length}/{REVIEW_LIMITS.contentMax}. Đừng ghi số điện thoại, địa chỉ.</p>
        {errors.content && <p id={`${uid}-content-error`} className="text-sm text-pink-ink">{errors.content}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold text-ink">Ảnh thực tế (tối đa {REVIEW_LIMITS.images})</span>
        {values.images.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {values.images.map((url, i) => (
              <li key={url} className="relative size-20 overflow-hidden rounded-[var(--radius-sm)] bg-surface-alt">
                {imageSrc(url) && <Image src={imageSrc(url) as string} alt={`Ảnh ${i + 1}`} fill sizes="80px" className="object-cover" />}
                <button type="button" aria-label={`Bỏ ảnh ${i + 1}`} onClick={() => set({ images: values.images.filter((x) => x !== url) })}
                  className="absolute top-0 right-0 grid size-11 place-items-start justify-end p-1"><span className="grid size-6 place-items-center rounded-full bg-ink text-xs text-white">✕</span></button>
              </li>
            ))}
          </ul>
        )}
        {values.images.length < REVIEW_LIMITS.images && (
          <label className={`inline-flex min-h-11 w-fit cursor-pointer items-center rounded-full border border-brand-ink px-4 text-sm font-bold text-brand-ink focus-within:outline-2 ${busy === 'upload' ? 'opacity-60' : ''}`}>
            {busy === 'upload' ? 'Đang tải ảnh…' : '+ Thêm ảnh'}
            <input type="file" name="images" accept={REVIEW_IMAGE_TYPES.join(',')} className="sr-only" disabled={busy !== null} onChange={(e) => void onFile(e)} />
          </label>
        )}
        <p className="text-xs text-muted">JPG, PNG hoặc WebP, tối đa 5MB mỗi ảnh.</p>
        {errors.images && <p role="alert" className="text-sm text-pink-ink">{errors.images}</p>}
      </div>
      <button type="submit" disabled={busy !== null} className="min-h-12 w-full rounded-full bg-brand-ink px-6 font-bold text-white disabled:opacity-60 md:w-auto md:self-start">
        {busy === 'save' ? 'Đang gửi…' : existing ? 'Gửi lại đánh giá' : 'Gửi đánh giá'}
      </button>
      <p className="text-xs text-muted">Đánh giá hiện lên sau khi shop duyệt (thường trong 1 ngày). Shop không ẩn đánh giá vì chê, chỉ ẩn nội dung vi phạm.</p>
    </form>
  );
}
