'use client';

import { TextField } from '../../ui/TextField';

export type AttributeDef = { attributeKey: string; attributeLabel: string; attributeType: string };

type Props = { defs: AttributeDef[] | null; values: Record<string, string>; onChange: (next: Record<string, string>) => void };

// Spec fields of the chosen category (set up in /admin/danh-muc). Values are kept by key, so
// switching category and back does not lose what was typed for a shared key.
export function AttributeFields({ defs, values, onChange }: Props) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <legend className="px-1 text-lg leading-[1.3] font-extrabold text-ink">Thông số</legend>
      {defs === null ? (
        <p className="text-sm text-muted">Chọn danh mục để nhập thông số.</p>
      ) : defs.length === 0 ? (
        <p className="text-sm text-muted">Danh mục này chưa có thông số.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {defs.map((d) => (
            <TextField key={d.attributeKey} name={`attr-${d.attributeKey}`} label={d.attributeLabel}
              inputMode={d.attributeType === 'number' ? 'decimal' : undefined}
              value={values[d.attributeKey] ?? ''} onChange={(e) => onChange({ ...values, [d.attributeKey]: e.target.value })} />
          ))}
        </div>
      )}
    </fieldset>
  );
}
