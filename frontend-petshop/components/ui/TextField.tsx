import type { InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'name'> & {
  name: string;
  label: string;
  error?: string;
  hint?: string;
};

// Label above the input, error under it and announced with the field (aria-describedby).
// text-base (16px) keeps iOS Safari from zooming into the page when the field is focused.
export function TextField({ name, label, error, hint, className = '', ...input }: Props) {
  const id = `f-${name}`;
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-bold text-ink">{label}</label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-12 w-full min-w-0 rounded-[var(--radius-sm)] border bg-surface px-3 text-base text-ink ${error ? 'border-pink-ink' : 'border-line'}`}
        {...input}
      />
      {hint && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-sm text-pink-ink">{error}</p>}
    </div>
  );
}
