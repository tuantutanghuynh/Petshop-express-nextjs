'use client';

import Image from 'next/image';
import { useState, type ChangeEvent } from 'react';
import { authFetch } from '../../lib/adminAuth';
import { imageSrc } from '../../lib/storefront';
import type { UploadResult } from '../../lib/types';

type Props = { name: string; label: string; value: string; error?: string; hint?: string; onChange: (url: string) => void; onUploading?: (busy: boolean) => void };

// One image for a form (gallery photo, post cover): uploads to POST /uploads/image (Cloudinary) and
// hands back the URL; the form saves it with the rest. A preview shows what is set. The file input
// carries `name` so focusFirstError can land on this field.
export function ImageUploadField({ name, label, value, error, hint, onChange, onUploading }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const id = `f-${name}`;
  const src = imageSrc(value);
  const message = uploadError ?? error;

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // picking the same file again still fires onChange
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    onUploading?.(true);
    const body = new FormData();
    body.append('image', file);
    try {
      const res = await authFetch<UploadResult>('/uploads/image', { method: 'POST', body });
      if (res.error || !res.data) setUploadError(res.error?.message || 'Chưa tải được ảnh lên.');
      else onChange(res.data.url);
    } catch {
      setUploadError('Chưa tải được ảnh lên. Kiểm tra mạng rồi thử lại.');
    } finally {
      setUploading(false);
      onUploading?.(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold text-ink">{label}</span>
      {src ? (
        <div className="relative aspect-[4/3] w-full max-w-sm overflow-hidden rounded-card border border-line bg-surface-alt">
          <Image src={src} alt="" fill sizes="(min-width: 768px) 384px, 100vw" className="object-contain" />
        </div>
      ) : (
        <p className="grid aspect-[4/3] w-full max-w-sm place-items-center rounded-card border border-dashed border-line text-sm text-muted">Chưa có ảnh</p>
      )}
      <label htmlFor={id} className={`inline-flex min-h-11 w-fit cursor-pointer items-center rounded-full border border-brand-ink px-5 font-bold text-brand-ink focus-within:outline-2 ${uploading ? 'opacity-60' : ''}`}>
        {uploading ? 'Đang tải ảnh lên…' : src ? 'Đổi ảnh' : 'Chọn ảnh'}
        <input id={id} name={name} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(e) => void onFile(e)}
          aria-invalid={message ? true : undefined} aria-describedby={message ? `${id}-error` : hint ? `${id}-hint` : undefined} />
      </label>
      {hint && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {message && <p id={`${id}-error`} className="text-sm text-pink-ink">{message}</p>}
    </div>
  );
}
