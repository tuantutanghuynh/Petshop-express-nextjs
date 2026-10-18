import type { ReactNode } from 'react';

// Phone-only bar for the page's main action, kept in thumb reach just above the bottom tab bar
// (56px + the iPhone home-indicator inset). Pages that show it reserve space with `max-md:pb-24`
// so the bar never covers their last lines.
export function StickyActionBar({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="region"
      aria-label={label}
      className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 border-t border-line bg-surface/95 px-4 py-2 backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3">{children}</div>
    </div>
  );
}
