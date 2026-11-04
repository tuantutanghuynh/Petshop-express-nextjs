'use client';

import type { FieldErrors } from '../../../lib/forms';
import type { PromoForm } from '../../../lib/adminSettings';
import { TextField } from '../../ui/TextField';
import { ImageField } from './ImageField';

// Colours are fixed by slot (homepage PromoCards) so the owner cannot break the palette.
export const PROMO_SLOT_NAMES = ['Thẻ 1 · hồng', 'Thẻ 2 · vàng', 'Thẻ 3 · mint', 'Banner rộng 4 · cam nhạt', 'Banner rộng 5 · tím nhạt'];

type LinesProps = { name: string; label: string; hint: string; value: string; error?: string; onChange: (v: string) => void };

// Two-row textarea: the homepage shows what is typed on a second line as a second line (promoLines).
function LinesField({ name, label, hint, value, error, onChange }: LinesProps) {
  const id = `f-${name}`;
  const describedBy = [error && `${id}-error`, `${id}-hint`].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold text-ink">{label}</label>
      <textarea id={id} name={name} rows={2} value={value} onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined} aria-describedby={describedBy}
        className={`w-full min-w-0 rounded-[var(--radius-sm)] border bg-surface p-3 text-base text-ink ${error ? 'border-pink-ink' : 'border-line'}`} />
      <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>
      {error && <p id={`${id}-error`} className="text-sm text-pink-ink">{error}</p>}
    </div>
  );
}

type Props = { index: number; value: PromoForm; errors: FieldErrors; onChange: (next: PromoForm) => void };

export function PromoFields({ index, value, errors, onChange }: Props) {
  const set = <K extends keyof PromoForm>(key: K, v: PromoForm[K]) => onChange({ ...value, [key]: v });
  const err = (k: string) => errors[`promos.${index}.${k}`];
  const p = `promos-${index}`; // names mirror the error keys (promos.0.href → promos-0-href)
  return (
    <fieldset className="flex flex-col gap-3 rounded-card border border-line p-4">
      <legend className="px-1 font-bold text-ink">{PROMO_SLOT_NAMES[index]}</legend>
      <label className="flex min-h-11 items-center gap-3 font-bold text-ink">
        <input type="checkbox" checked={value.enabled} onChange={(e) => set('enabled', e.target.checked)} className="size-5 accent-[var(--brand-teal-ink)]" />
        Đang hiển thị
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <LinesField name={`${p}-title`} label="Tiêu đề" hint="Xuống dòng (Enter) để ngắt tiêu đề thành 2 dòng." value={value.title} onChange={(v) => set('title', v)} error={err('title')} />
        <LinesField
          name={`${p}-big`}
          label={index < 3 ? 'Chữ lớn (vd -20%)' : 'Nhãn nhỏ (vd Bộ sưu tập mới)'}
          hint={index < 3 ? 'Chỉ ghi % khi giá đang giảm thật. Dòng thứ 2 hiện nhỏ hơn (MUA 1 ↵ TẶNG 1).' : 'Chỉ ghi % khi giá đang giảm thật.'}
          value={value.big}
          onChange={(v) => set('big', v)}
        />
        <TextField name={`${p}-subtitle`} label="Mô tả ngắn" value={value.subtitle} onChange={(e) => set('subtitle', e.target.value)} />
        <TextField name={`${p}-cta`} label="Chữ trên nút" placeholder="Mua ngay" value={value.cta} onChange={(e) => set('cta', e.target.value)} />
        <TextField name={`${p}-href`} label="Link" placeholder="/danh-muc/pate" value={value.href} onChange={(e) => set('href', e.target.value)} error={err('href')} />
        <div className="grid grid-cols-2 gap-3">
          <TextField name={`${p}-startsAt`} type="date" label="Từ ngày" value={value.startsAt} onChange={(e) => set('startsAt', e.target.value)} error={err('startsAt')} />
          <TextField name={`${p}-endsAt`} type="date" label="Đến ngày" value={value.endsAt} onChange={(e) => set('endsAt', e.target.value)} error={err('endsAt')} />
        </div>
      </div>
      <ImageField id={`${p}-image`} label="Ảnh" value={value.image} error={err('image')} onChange={(v) => set('image', v)} />
    </fieldset>
  );
}
