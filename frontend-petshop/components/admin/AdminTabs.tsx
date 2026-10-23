'use client';

type Tab = { key: string; label: string };

// Status tabs of an admin list (quotes, contact messages): one row that scrolls sideways on phones,
// each tab ≥ 44px, the current one filled.
export function AdminTabs({ tabs, current, onSelect, label }: { tabs: Tab[]; current: string; onSelect: (key: string) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      {tabs.map((t) => {
        const on = t.key === current;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => onSelect(t.key)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-bold whitespace-nowrap ${on ? 'bg-brand-ink text-white' : 'border border-line bg-surface text-ink'}`}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
