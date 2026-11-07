'use client';

import type { NewsletterSubscriber } from '../../../lib/types';

const STATUS = { PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', UNSUBSCRIBED: 'Đã huỷ' } as const;
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');

// One subscriber. The email is typed by the visitor: shown as text, broken anywhere so a long
// address never widens the page. Cards at every width, as the contacts inbox: the few fields fit a
// row from md, so there is no separate table.
export function SubscriberCard({ s, busy, onDelete }: { s: NewsletterSubscriber; busy: boolean; onDelete: (s: NewsletterSubscriber) => void }) {
  return (
    <article className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h2 className="text-base leading-[1.4] font-extrabold break-all">{s.email}</h2>
        <p className="text-sm text-muted">
          <b className="text-ink">{STATUS[s.status]}</b> · Đồng ý {date(s.consentAt)}
          {s.confirmedAt && ` · Xác nhận ${date(s.confirmedAt)}`}
          {s.unsubscribedAt && ` · Huỷ ${date(s.unsubscribedAt)}`}
        </p>
      </div>
      <button type="button" disabled={busy} onClick={() => onDelete(s)} className="inline-flex min-h-11 shrink-0 items-center self-start rounded-full border border-pink-ink px-4 text-sm font-bold text-pink-ink disabled:opacity-60 md:self-auto">Xoá</button>
    </article>
  );
}
