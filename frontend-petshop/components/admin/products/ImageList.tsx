'use client';

import Image from 'next/image';
import { useState, type ChangeEvent } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { imageSrc } from '../../../lib/storefront';
import type { UploadResult } from '../../../lib/types';

export type ImageItem = { id: string | null; url: string; altText: string };

// Edit mode: every change is saved at once through these; add resolves to the saved image or an
// error message, the others to an error message or null. The list on screen is updated here in
// both modes, so the rest of the form keeps what was typed. Create mode: the list is posted with
// the product.
export type ImageOps = {
  add: (url: string) => Promise<ImageItem | string>;
  setAlt: (id: string, altText: string) => Promise<string | null>;
  reorder: (next: ImageItem[]) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
};

type Props = { images: ImageItem[]; onChange: (next: ImageItem[]) => void; ops?: ImageOps };

const BUTTON = 'grid min-h-11 min-w-11 place-items-center rounded-full border border-line bg-surface text-sm font-bold text-ink disabled:opacity-40';

// "Hình ảnh" (wireframe): the first photo is the cover; ↑↓ change the order, each photo has its alt
// text (read by screen readers and image search).
export function ImageList({ images, onChange, ops }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(job: () => Promise<string | null>) {
    setBusy(true);
    setMessage(null);
    const failed = await job();
    setBusy(false);
    if (failed) setMessage(failed);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // the same file can be picked again
    if (!file) return;
    const body = new FormData();
    body.append('image', file);
    await run(async () => {
      const res = await authFetch<UploadResult>('/uploads/image', { method: 'POST', body });
      if (res.error || !res.data?.url) return res.error?.message ?? 'Tải ảnh lên không thành công';
      const saved = ops ? await ops.add(res.data.url) : { id: null, url: res.data.url, altText: '' };
      if (typeof saved === 'string') return saved;
      onChange([...images, saved]);
      return null;
    });
  }

  function move(i: number, dir: -1 | 1) {
    const next = [...images];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    if (!ops) return onChange(next);
    void run(async () => {
      const failed = await ops.reorder(next);
      if (!failed) onChange(next);
      return failed;
    });
  }

  function remove(i: number) {
    if (!window.confirm('Xoá ảnh này khỏi sản phẩm?')) return;
    const id = images[i].id;
    const next = images.filter((_, n) => n !== i);
    if (!ops || !id) return onChange(next);
    void run(async () => {
      const failed = await ops.remove(id);
      if (!failed) onChange(next);
      return failed;
    });
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <legend className="px-1 text-lg leading-[1.3] font-extrabold text-ink">Hình ảnh</legend>
      {message && <p role="alert" className="rounded-card bg-pink-bg px-3 py-2 text-sm text-pink-ink">{message}</p>}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((img, i) => {
          const src = imageSrc(img.url);
          return (
            <li key={img.id ?? img.url} className="flex flex-col gap-2 rounded-card border border-line p-2">
              <span className="relative aspect-square overflow-hidden rounded-[var(--radius-sm)] bg-surface-alt">
                {src && <Image src={src} alt={img.altText} fill sizes="(min-width: 1024px) 200px, 45vw" className="object-cover" />}
                {i === 0 && <span className="absolute top-2 left-2 rounded-full bg-brand-ink px-2 py-1 text-xs font-bold text-white">Ảnh bìa</span>}
              </span>
              <label className="flex flex-col gap-1 text-sm font-bold text-ink">
                Mô tả ảnh
                <input value={img.altText} maxLength={200} placeholder="VD: Gói hạt 1kg mặt trước"
                  onChange={(e) => onChange(images.map((x, n) => (n === i ? { ...x, altText: e.target.value } : x)))}
                  onBlur={(e) => { const id = img.id; if (ops && id) void run(() => ops.setAlt(id, e.target.value.trim())); }}
                  className="min-h-11 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base font-normal" />
              </label>
              <span className="flex gap-2">
                <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Đưa ảnh lên trước" className={BUTTON}>↑</button>
                <button type="button" disabled={busy || i === images.length - 1} onClick={() => move(i, 1)} aria-label="Đưa ảnh ra sau" className={BUTTON}>↓</button>
                <button type="button" disabled={busy} onClick={() => remove(i)} className={`${BUTTON} ml-auto px-4 text-pink-ink`}>Xoá</button>
              </span>
            </li>
          );
        })}
      </ul>
      <label className={`inline-flex min-h-11 cursor-pointer items-center self-start rounded-full border-2 border-dashed border-line px-4 font-bold text-ink ${busy ? 'opacity-60' : ''}`}>
        {busy ? 'Đang xử lý…' : '+ Tải ảnh lên'}
        <input type="file" accept="image/*" onChange={onFile} disabled={busy} className="sr-only" />
      </label>
    </fieldset>
  );
}
