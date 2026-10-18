'use client';

type Props = { value: number; min?: number; max: number; disabled?: boolean; label: string; onChange: (value: number) => void };

// − n + with 44px buttons. The number is an <output> rather than a free text input: it cannot hold
// "abc" or 1e9, and every value it can reach is one the backend accepts.
export function QuantityStepper({ value, min = 1, max, disabled, label, onChange }: Props) {
  const button = 'grid size-11 place-items-center text-xl font-bold text-ink disabled:text-muted disabled:opacity-50';
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-full border border-line">
      <button type="button" className={button} aria-label="Giảm số lượng" disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>−</button>
      <output aria-live="polite" className="min-w-8 text-center font-bold text-ink">{value}</output>
      <button type="button" className={button} aria-label="Tăng số lượng" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}
