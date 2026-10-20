'use client';

import type { HeroSlideForm } from '../../../lib/adminSettings';
import type { FieldErrors } from '../../../lib/forms';
import { HERO_LIMITS } from '../../../lib/heroSlides';
import { TextField } from '../../ui/TextField';
import { ImageField } from './ImageField';

type Props = {
  index: number;
  count: number;
  value: HeroSlideForm;
  errors: FieldErrors;
  onChange: (next: HeroSlideForm) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
};

const small = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line px-3 text-sm font-bold disabled:opacity-40';

// One hero slide: same fields as the old single hero plus on/off and dates. Names mirror the error
// keys (heroSlides.0.title → heroSlides-0-title).
export function HeroSlideFields({ index, count, value, errors, onChange, onMove, onRemove }: Props) {
  const set = <K extends keyof HeroSlideForm>(key: K, v: HeroSlideForm[K]) => onChange({ ...value, [key]: v });
  const p = `heroSlides-${index}`;
  const err = (k: string) => errors[`heroSlides.${index}.${k}`];
  const field = (key: Exclude<keyof HeroSlideForm, 'enabled' | 'image'>, label: string, extra: { placeholder?: string; maxLength?: number; type?: string } = {}) => (
    <TextField name={`${p}-${key}`} label={label} value={value[key]} error={err(key)} {...extra} onChange={(e) => set(key, e.target.value)} />
  );
  return (
    <fieldset className="flex flex-col gap-3 rounded-card border border-line p-4">
      <legend className="px-1 font-bold text-ink">Slide {index + 1}{index === 0 ? ' (hiện đầu tiên)' : ''}</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-11 items-center gap-3 font-bold text-ink">
          <input type="checkbox" checked={value.enabled} onChange={(e) => set('enabled', e.target.checked)} className="size-5 accent-[var(--brand-teal-ink)]" />
          Đang hiển thị
        </label>
        <div className="flex gap-2">
          <button type="button" className={small} disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Đưa slide ${index + 1} lên`}>↑</button>
          <button type="button" className={small} disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Đưa slide ${index + 1} xuống`}>↓</button>
          <button type="button" className={`${small} text-pink-ink`} onClick={onRemove} aria-label={`Xoá slide ${index + 1}`}>Xoá</button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {field('badge', 'Nhãn nhỏ', { placeholder: '♥ Yêu thương & chăm sóc', maxLength: HERO_LIMITS.badge })}
        {field('title', 'Tiêu đề dòng 1', { maxLength: HERO_LIMITS.title })}
        {field('accent', 'Tiêu đề dòng 2 (màu xanh)', { maxLength: HERO_LIMITS.accent })}
        {field('subtitle', 'Mô tả', { maxLength: HERO_LIMITS.subtitle })}
        {field('ctaLabel', 'Nút chính', { placeholder: 'Mua ngay', maxLength: HERO_LIMITS.label })}
        {field('ctaHref', 'Link nút chính', { placeholder: '/san-pham' })}
        {field('cta2Label', 'Nút phụ (tuỳ chọn)', { maxLength: HERO_LIMITS.label })}
        {field('cta2Href', 'Link nút phụ', { placeholder: '/tu-van-bao-gia' })}
        <div className="grid grid-cols-2 gap-3">
          {field('startsAt', 'Từ ngày', { type: 'date' })}
          {field('endsAt', 'Đến ngày', { type: 'date' })}
        </div>
      </div>
      <ImageField id={`${p}-image`} label="Ảnh" value={value.image} error={err('image')} onChange={(v) => set('image', v)} />
    </fieldset>
  );
}
