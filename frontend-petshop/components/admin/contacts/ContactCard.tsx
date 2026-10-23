'use client';

import { mailtoHref } from '../../../lib/adminContacts';
import { timeAgo } from '../../../lib/adminDashboard';
import type { AdminContactMessage } from '../../../lib/types';

type Props = { message: AdminContactMessage; now: Date; busy: boolean; onRead: (m: AdminContactMessage) => void; onDelete: (m: AdminContactMessage) => void };

const btn = 'inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold disabled:opacity-60';

// One contact message (wireframe admin-contacts.html). The text is the visitor's own, shown as plain
// text with its line breaks — never as HTML. Replies go out from the owner's own mail app.
export function ContactCard({ message: m, now, busy, onRead, onDelete }: Props) {
  return (
    <article className={`flex flex-col gap-2 rounded-card bg-surface p-4 ${m.isRead ? 'border border-line' : 'border-2 border-brand-ink'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="min-w-0 text-base leading-[1.4] font-extrabold break-words">
          {m.name}{m.email && <span className="font-normal break-all text-muted"> · {m.email}</span>}
        </h2>
        <span className="text-sm text-muted">{!m.isRead && <b className="mr-2 text-brand-ink">Chưa đọc</b>}{timeAgo(m.createdAt, now)}</span>
      </div>
      {(m.phone || m.subject) && (
        <p className="text-sm">{m.phone && <span className="text-muted">{m.phone}</span>}{m.phone && m.subject && ' · '}{m.subject && <b className="text-ink">{m.subject}</b>}</p>
      )}
      <p className="text-sm whitespace-pre-line break-words">“{m.message}”</p>
      <div className="flex flex-wrap gap-2">
        {m.email && <a href={mailtoHref(m.email, m.subject)} className={`${btn} bg-brand-ink text-white`}>Trả lời qua email</a>}
        {m.phone && <a href={`tel:${m.phone.replace(/[^\d+]/g, '')}`} className={`${btn} border border-brand-ink text-brand-ink`}>☎ Gọi</a>}
        {!m.isRead && <button type="button" disabled={busy} onClick={() => onRead(m)} className={`${btn} border border-line text-ink`}>Đánh dấu đã đọc</button>}
        <button type="button" disabled={busy} onClick={() => onDelete(m)} className={`${btn} border border-pink-ink text-pink-ink`}>Xoá</button>
      </div>
    </article>
  );
}
