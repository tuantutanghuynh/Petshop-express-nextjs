import { formatRating } from '../../lib/reviews';

// Read-only stars: the filled part is clipped to the value (4,7 fills 94%). Screen readers hear the
// number, never five separate "star" glyphs.
export function Stars({ value, className = 'text-base' }: { value: number; className?: string }) {
  const percent = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span role="img" aria-label={`${formatRating(value)} trên 5 sao`} className={`relative inline-block leading-none tracking-[0.1em] whitespace-nowrap ${className}`}>
      <span aria-hidden="true" className="text-line">★★★★★</span>
      <span aria-hidden="true" className="absolute inset-0 overflow-hidden text-yellow" style={{ width: `${percent}%` }}>★★★★★</span>
    </span>
  );
}
