'use client';

import type { MegaMenuForm } from '../../../lib/adminSettings';
import type { FieldErrors } from '../../../lib/forms';
import { TextField } from '../../ui/TextField';
import { ImageField } from './ImageField';

type Props = { slug: string; label: string; value: MegaMenuForm; errors: FieldErrors; onChange: (next: MegaMenuForm) => void };

// One species menu: banner on the right of the panel and up to 8 featured brands. Input names
// mirror the error keys (megaMenus.cho.brands.0.name → megaMenus-cho-brands-0-name).
export function MegaMenuFields({ slug, label, value, errors, onChange }: Props) {
  const p = `megaMenus-${slug}`;
  const err = (k: string) => errors[`megaMenus.${slug}.${k}`];
  const setBrand = (i: number, patch: Partial<MegaMenuForm['brands'][number]>) =>
    onChange({ ...value, brands: value.brands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  return (
    <fieldset className="flex flex-col gap-3 rounded-card border border-line p-4">
      <legend className="px-1 font-bold text-ink">Menu {label}</legend>
      <div className="grid gap-3 md:grid-cols-2">
        <TextField name={`${p}-bannerTitle`} label="Tiêu đề banner" maxLength={80} value={value.bannerTitle}
          onChange={(e) => onChange({ ...value, bannerTitle: e.target.value })} />
        <TextField name={`${p}-bannerHref`} label="Link banner" placeholder={`/danh-muc/${slug}`} value={value.bannerHref} error={err('bannerHref')}
          onChange={(e) => onChange({ ...value, bannerHref: e.target.value })} />
      </div>
      <ImageField id={`${p}-bannerImage`} label="Ảnh banner (ảnh dọc, khoảng 2:3)" value={value.bannerImage} error={err('bannerImage')}
        onChange={(v) => onChange({ ...value, bannerImage: v })} />
      <p className="mt-2 text-sm font-bold text-ink">Thương hiệu nổi bật</p>
      <ol className="grid gap-4 md:grid-cols-2">
        {value.brands.map((b, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-card bg-surface-alt p-3">
            <TextField name={`${p}-brands-${i}-name`} label={`Thương hiệu ${i + 1}`} maxLength={60} value={b.name} error={err(`brands.${i}.name`)}
              onChange={(e) => setBrand(i, { name: e.target.value })} />
            <ImageField id={`${p}-brands-${i}-logo`} label="Logo" value={b.logo} error={err(`brands.${i}.logo`)} onChange={(v) => setBrand(i, { logo: v })} />
          </li>
        ))}
      </ol>
    </fieldset>
  );
}
