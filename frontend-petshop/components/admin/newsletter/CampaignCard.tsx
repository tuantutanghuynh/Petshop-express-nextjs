import Link from 'next/link';
import { campaignState, isEditable } from '../../../lib/adminNewsletter';
import type { CampaignStatus, CampaignSummary } from '../../../lib/types';

const STATUS_STYLE: Record<CampaignStatus, string> = {
  DRAFT: 'bg-line text-ink',
  SCHEDULED: 'bg-yellow-hero/40 text-ink',
  SENDING: 'bg-mint text-brand-ink',
  SENT: 'bg-mint text-brand-ink',
  CANCELLED: 'bg-pink-bg text-pink-ink',
};

// One campaign in the admin list: subject, status, the time that matters, and once it started the
// send counts. Drafts and scheduled ones open the editor; the rest open the report.
export function CampaignCard({ campaign, busy, onDelete }: { campaign: CampaignSummary; busy: boolean; onDelete: (c: CampaignSummary) => void }) {
  const { label, when } = campaignState(campaign);
  const started = campaign.status === 'SENDING' || campaign.status === 'SENT' || campaign.status === 'CANCELLED';
  const action = 'inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold';
  return (
    <article className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
      <h2 className="text-base leading-[1.4] font-extrabold break-words">{campaign.subject}</h2>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[campaign.status]}`}>{label}</span>
        {when && <span>{when}</span>}
      </p>
      {started && (
        <p className="text-sm text-ink tabular-nums">
          Đã gửi <b>{campaign.sentCount}</b>/{campaign.recipientCount} · Lỗi <b>{campaign.failedCount}</b> · Huỷ nhận tin <b>{campaign.unsubscribeCount}</b>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link href={`/admin/ban-tin/${campaign.id}`} className={`${action} border border-brand-ink text-brand-ink hover:bg-mint`}>
          {isEditable(campaign.status) ? 'Sửa' : 'Xem báo cáo'}
        </Link>
        {campaign.status === 'DRAFT' && (
          <button type="button" disabled={busy} onClick={() => onDelete(campaign)} className={`${action} border border-pink-ink text-pink-ink disabled:opacity-60`}>Xoá</button>
        )}
      </div>
    </article>
  );
}
