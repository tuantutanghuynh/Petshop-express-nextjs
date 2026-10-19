'use client';

import type { FieldErrors } from '../../../lib/forms';
import type { PromoForm } from '../../../lib/adminSettings';
import { TextField } from '../../ui/TextField';
import { ImageField } from './ImageField';

// Colours are fixed by slot (homepage PromoCards) so the owner cannot break the palette.
export const PROMO_SLOT_NAMES = ['Thẻ 1 · hồng', 'Thẻ 2 · vàng', 'Thẻ 3 · mint', 'Banner rộng 4 · cam nhạt', 'Banner rộng 5 · tím nhạt'];

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
        <TextField name={`${p}-title`} label="Tiêu đề" value={value.title} onChange={(e) => set('title', e.target.value)} error={err('title')} />
        <TextField name={`${p}-big`} label="Chữ lớn (vd -20%)" hint="Chỉ ghi % khi giá đang giảm thật." value={value.big} onChange={(e) => set('big', e.target.value)} />
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
