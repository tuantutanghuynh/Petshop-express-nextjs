import Link from 'next/link';

type Props = { id: string; title: string; moreHref?: string; moreLabel?: string };

export function SectionHeading({ id, title, moreHref, moreLabel = 'Xem tất cả' }: Props) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 id={id} className="text-xl font-extrabold sm:text-2xl">{title}</h2>
      {moreHref && (
        <Link href={moreHref} className="flex min-h-11 shrink-0 items-center text-sm font-bold text-brand-ink hover:underline">
          {moreLabel} <span aria-hidden="true">›</span>
        </Link>
      )}
    </div>
  );
}
