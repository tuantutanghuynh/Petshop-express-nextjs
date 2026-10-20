import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = { label: string; value: ReactNode; foot?: ReactNode; action?: { href: string; text: string } | null; state: 'loading' | 'error' | 'ready' };

// One dashboard number (wireframe .stat). Each card loads on its own, so one failing API shows an
// error in its card only.
export function StatCard({ label, value, foot, action, state }: Props) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4">
      <small className="text-muted">{label}</small>
      <div aria-busy={state === 'loading'} className="text-2xl leading-[1.3] font-extrabold text-ink tabular-nums">
        {state === 'loading' ? <span className="block h-8 w-16 animate-pulse rounded bg-surface-alt" /> : state === 'error' ? <span className="text-base text-pink-ink">Chưa tải được</span> : value}
      </div>
      {foot && state === 'ready' && <small className="text-muted">{foot}</small>}
      {action && <Link href={action.href} className="mt-1 inline-flex min-h-11 items-center self-start font-bold text-brand-ink">{action.text}</Link>}
    </div>
  );
}
