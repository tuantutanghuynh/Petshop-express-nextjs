import Link from 'next/link';
import { SITE_NAME, SITE_TAGLINE } from '../../lib/site';

export function Logo() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-2 text-ink" aria-label={`${SITE_NAME} — Trang chủ`}>
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-xl">🐾</span>
      <span className="flex flex-col leading-[1.3]">
        <span className="text-base font-extrabold max-[359px]:text-sm sm:text-lg">{SITE_NAME}</span>
        {/* Hidden on the narrowest phones so the header keeps one line next to the search and cart icons. */}
        <small className="text-xs text-muted max-[399px]:hidden">{SITE_TAGLINE}</small>
      </span>
    </Link>
  );
}
