// Down arrow for menus that open. An SVG, not the "▾" character: Be Vietnam Pro has no glyph for it,
// so the fallback font drew a dot.
export function Chevron({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" className={`size-3 shrink-0 transition-transform ${className}`}>
      <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
