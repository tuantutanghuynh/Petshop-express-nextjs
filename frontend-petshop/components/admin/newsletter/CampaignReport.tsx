'use client';

import { useState } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { campaignState } from '../../../lib/adminNewsletter';
import { renderMarkdown } from '../../../lib/markdown';
import type { Campaign } from '../../../lib/types';
import { formatVietnamDateTime } from '../../../lib/vnTime';
import { FormAlert } from '../../ui/FormAlert';

// A campaign that has started: what went out and how it went. Read-only; while it is sending it
// can be refreshed or stopped (the emails already handed to SMTP cannot be called back).
export function CampaignReport({ campaign, onChanged, onRefresh }: { campaign: Campaign; onChanged: (c: Campaign) => void; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const { label, when } = campaignState(campaign);
  const sending = campaign.status === 'SENDING';
  const done = campaign.sentCount + campaign.failedCount;
  const percent = campaign.recipientCount > 0 ? Math.round((done / campaign.recipientCount) * 100) : 100;

  async function stop() {
    if (!window.confirm('Dừng gửi? Những email đã gửi không thu hồi được; người chưa nhận sẽ không nhận nữa.')) return;
    setBusy(true);
    const res = await authFetch<Campaign>(`/newsletter/campaigns/${campaign.id}/cancel`, { method: 'POST', body: '{}' });
    setBusy(false);
    if (res.error || !res.data) return setAlert(res.error?.message || 'Chưa dừng được.');
    onChanged(res.data);
  }

  const tiles = [
    ['Người nhận', campaign.recipientCount],
    ['Đã gửi', campaign.sentCount],
    ['Lỗi', campaign.failedCount],
    ['Huỷ nhận tin', campaign.unsubscribeCount],
  ] as const;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <FormAlert message={alert} />
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className="rounded-full bg-mint px-2 py-0.5 text-xs font-bold text-brand-ink">{label}</span>
        {when && <span>{when}</span>}
        {campaign.startedAt && campaign.status !== 'SENDING' && <span>· Bắt đầu {formatVietnamDateTime(campaign.startedAt)}</span>}
      </p>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([name, n]) => (
          <div key={name} className="rounded-card border border-line bg-surface p-3">
            <dt className="text-xs text-muted">{name}</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
      {sending && (
        <div className="flex flex-col gap-2">
          <div role="progressbar" aria-label="Tiến độ gửi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-3 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-brand-ink" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-sm text-muted">Gửi dần mỗi phút theo giới hạn trong ngày. Danh sách nhận chốt lúc bắt đầu gửi.</p>
          <div className="flex flex-col gap-2 md:flex-row">
            <button type="button" onClick={onRefresh} className="min-h-12 w-full rounded-full border border-brand-ink px-6 font-bold text-brand-ink md:w-auto">Làm mới số liệu</button>
            <button type="button" disabled={busy} onClick={() => void stop()} className="min-h-12 w-full rounded-full border border-pink-ink px-6 font-bold text-pink-ink disabled:opacity-60 md:w-auto">
              {busy ? 'Đang dừng…' : 'Dừng gửi'}
            </button>
          </div>
        </div>
      )}
      {campaign.failedCount > 0 && <p className="text-sm text-muted">Email lỗi thường do địa chỉ không còn dùng hoặc hộp thư đầy; hệ thống đã thử lại lỗi tạm thời tối đa 3 lần.</p>}
      <section aria-labelledby="sent-content" className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
        <h2 id="sent-content" className="text-lg leading-[1.3] font-extrabold">{campaign.isAdvertising ? '[QC] ' : ''}{campaign.subject}</h2>
        {campaign.preheader && <p className="text-sm text-muted">{campaign.preheader}</p>}
        {/* Sanitised in renderMarkdown (lib/sanitize.ts). */}
        <div className="max-w-prose [&_a]:text-brand-ink [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-extrabold [&_img]:max-w-full [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(campaign.content) }} />
        {campaign.featuredItems.length > 0 && (
          <p className="text-sm text-muted">Kèm theo: {campaign.featuredItems.map((f) => f.title ?? 'đã bị xoá').join(', ')}</p>
        )}
      </section>
    </div>
  );
}
