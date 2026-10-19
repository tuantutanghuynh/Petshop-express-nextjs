'use client';

import Image from 'next/image';
import { useState, type ChangeEvent } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { imageSrc } from '../../../lib/storefront';
import type { UploadResult } from '../../../lib/types';

type Props = { id: string; label: string; value: string; error?: string; onChange: (url: string) => void };

// Upload (multer → Cloudinary, returns an https URL) with a preview, or paste a URL, or clear it.
export function ImageField({ id, label, value, error, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const preview = imageSrc(value);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // the same file can be picked again
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const body = new FormData();
    body.append('image', file);
    const res = await authFetch<UploadResult>('/uploads/image', { method: 'POST', body });
    setUploading(false);
    if (res.error || !res.data?.url) setUploadError(res.error?.message ?? 'Tải ảnh lên không thành công');
    else onChange(res.data.url);
  }

  const message = error ?? uploadError ?? undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-bold text-ink">{label}</label>
      <div className="flex items-start gap-3">
        {/* imageSrc() only lets through hosts next/image serves (Cloudinary, legacy /uploads). */}
        {preview ? <Image src={preview} alt="" width={80} height={80} className="size-20 shrink-0 rounded-card object-cover" /> : <span aria-hidden="true" className="grid size-20 shrink-0 place-items-center rounded-card bg-surface-alt">🖼</span>}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            id={id}
            name={id}
            type="url"
            inputMode="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://…"
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? `${id}-error` : undefined}
            className="min-h-11 w-full rounded-[var(--radius-sm)] border border-line px-3 text-base"
          />
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line px-4 text-sm font-bold">
              {uploading ? 'Đang tải…' : 'Tải ảnh lên'}
              <input type="file" accept="image/*" onChange={onFile} disabled={uploading} className="sr-only" />
            </label>
            {value && <button type="button" onClick={() => onChange('')} className="min-h-11 px-3 text-sm font-bold text-pink-ink underline">Bỏ ảnh</button>}
          </div>
        </div>
      </div>
      {message && <p id={`${id}-error`} className="text-sm text-pink-ink">{message}</p>}
    </div>
  );
}
