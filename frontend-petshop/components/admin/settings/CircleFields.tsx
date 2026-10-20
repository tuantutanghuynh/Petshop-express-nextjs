'use client';

import type { CircleForm } from '../../../lib/adminSettings';
import type { CategoryNode } from '../../../lib/categoryTree';
import type { FieldErrors } from '../../../lib/forms';
import { categoryPath } from '../../../lib/seo/structuredData';
import { TextField } from '../../ui/TextField';
import { ImageField } from './ImageField';

type Props = { rows: CircleForm[]; categories: CategoryNode[]; errors: FieldErrors; onChange: (rows: CircleForm[]) => void };

// "Mua theo bé cưng" circles: name, link and image per row. The link field suggests every category
// page (a <datalist>), but any shop path or https link is accepted. Input names mirror the error
// keys (circles.0.href → circles-0-href).
export function CircleFields({ rows, categories, errors, onChange }: Props) {
  const set = (i: number, patch: Partial<CircleForm>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <>
      <datalist id="category-links">
        {categories.map((c) => <option key={c.id} value={categoryPath(c.slug)}>{c.name}</option>)}
      </datalist>
      <ol className="grid gap-4 md:grid-cols-2">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-card bg-surface-alt p-3">
            <TextField name={`circles-${i}-label`} label={`Vòng ${i + 1} · tên`} maxLength={40} value={r.label} error={errors[`circles.${i}.label`]}
              onChange={(e) => set(i, { label: e.target.value })} />
            <TextField name={`circles-${i}-href`} label="Link" list="category-links" placeholder="/danh-muc/…" value={r.href} error={errors[`circles.${i}.href`]}
              onChange={(e) => set(i, { href: e.target.value })} />
            <ImageField id={`circles-${i}-image`} label="Ảnh tròn" value={r.image} error={errors[`circles.${i}.image`]} onChange={(v) => set(i, { image: v })} />
          </li>
        ))}
      </ol>
    </>
  );
}
