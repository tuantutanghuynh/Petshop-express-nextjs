import type { FieldErrors } from './forms';
import type { Campaign, CampaignStatus, CampaignSummary, FeaturedRef } from './types';
import { formatVietnamDateTime, fromVietnamLocal, toVietnamLocal } from './vnTime';

// Rules of the admin newsletter screens (spec 2026-11-10, test/adminNewsletter.test.ts). The backend
// checks the same limits and the send-time window (routes/newsletter.route.ts).
export const CAMPAIGN_LIMITS = { subject: 150, preheader: 150, content: 20_000, featured: 6 } as const;
const SCHEDULE_MAX_DAYS = 90;
const PAST_GRACE_MS = 5 * 60 * 1000; // the form may have been open a few minutes

export type FeaturedPick = FeaturedRef & { title: string | null; available: boolean };
export type CampaignFormValues = {
  subject: string;
  preheader: string;
  content: string;
  isAdvertising: boolean;
  featured: FeaturedPick[];
  // "YYYY-MM-DDTHH:mm" in Vietnam time, or '' for "as soon as possible".
  sendAt: string;
};

export function emptyCampaign(): CampaignFormValues {
  return { subject: '', preheader: '', content: '', isAdvertising: true, featured: [], sendAt: '' };
}

export function campaignToForm(c: Campaign): CampaignFormValues {
  return {
    subject: c.subject,
    preheader: c.preheader ?? '',
    content: c.content,
    isAdvertising: c.isAdvertising,
    featured: c.featuredItems.map((f) => ({ type: f.type, id: f.id, title: f.title, available: f.available })),
    sendAt: c.status === 'SCHEDULED' && c.scheduledAt ? toVietnamLocal(c.scheduledAt) : '',
  };
}

export function campaignBody(v: CampaignFormValues) {
  return {
    subject: v.subject.trim(),
    preheader: v.preheader.trim() || null,
    content: v.content,
    isAdvertising: v.isAdvertising,
    featured: v.featured.map((f) => ({ type: f.type, id: f.id })),
  };
}

export function validateCampaignForm(v: CampaignFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const max = (n: number) => `Tối đa ${n.toLocaleString('vi-VN')} ký tự`;
  if (!v.subject.trim()) errors.subject = 'Nhập tiêu đề email';
  else if (v.subject.trim().length > CAMPAIGN_LIMITS.subject) errors.subject = max(CAMPAIGN_LIMITS.subject);
  if (v.preheader.trim().length > CAMPAIGN_LIMITS.preheader) errors.preheader = max(CAMPAIGN_LIMITS.preheader);
  if (!v.content.trim()) errors.content = 'Nhập nội dung';
  else if (v.content.length > CAMPAIGN_LIMITS.content) errors.content = max(CAMPAIGN_LIMITS.content);
  if (v.featured.length > CAMPAIGN_LIMITS.featured) errors.featured = `Chọn tối đa ${CAMPAIGN_LIMITS.featured} mục`;
  return errors;
}

// null = fine ('' means send now).
export function validateSendAt(local: string, now: Date = new Date()): string | null {
  if (!local) return null;
  const iso = fromVietnamLocal(local);
  if (!iso) return 'Ngày giờ không hợp lệ';
  const at = new Date(iso).getTime();
  if (at < now.getTime() - PAST_GRACE_MS) return 'Giờ gửi đã qua';
  if (at > now.getTime() + SCHEDULE_MAX_DAYS * 24 * 60 * 60 * 1000) return `Chỉ hẹn trong vòng ${SCHEDULE_MAX_DAYS} ngày`;
  return null;
}

export function scheduleBody(local: string): { scheduledAt?: string } {
  const iso = local ? fromVietnamLocal(local) : null;
  return iso ? { scheduledAt: iso } : {};
}

export const isEditable = (status: CampaignStatus) => status === 'DRAFT' || status === 'SCHEDULED';

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'Nháp', SCHEDULED: 'Đã hẹn', SENDING: 'Đang gửi', SENT: 'Đã gửi', CANCELLED: 'Đã dừng',
};

// The label and the one time that matters for each status, for cards and the report.
export function campaignState(c: Pick<CampaignSummary, 'status' | 'createdAt' | 'scheduledAt' | 'startedAt' | 'finishedAt'>): { label: string; when: string } {
  const label = CAMPAIGN_STATUS_LABELS[c.status];
  const at = (prefix: string, iso: string | null) => (iso ? `${prefix} ${formatVietnamDateTime(iso)}` : '');
  switch (c.status) {
    case 'SCHEDULED': return { label, when: at('Gửi lúc', c.scheduledAt) };
    case 'SENDING': return { label, when: at('Bắt đầu', c.startedAt) };
    case 'SENT': return { label, when: at('Xong', c.finishedAt) };
    case 'CANCELLED': return { label, when: at('Dừng', c.finishedAt) };
    default: return { label, when: at('Tạo', c.createdAt) };
  }
}

// The API names errors of list items "featured[0].type"; the form shows them on the picker.
export function normalizeCampaignErrors(errors: FieldErrors): FieldErrors {
  const out: FieldErrors = {};
  for (const [key, message] of Object.entries(errors)) out[key.startsWith('featured') ? 'featured' : key] ??= message;
  return out;
}

// /admin/ban-tin list state lives in the URL, like the other admin lists.
export const CAMPAIGN_TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'DRAFT', label: 'Nháp' },
  { key: 'SCHEDULED', label: 'Đã hẹn' },
  { key: 'SENDING', label: 'Đang gửi' },
  { key: 'SENT', label: 'Đã gửi' },
  { key: 'CANCELLED', label: 'Đã dừng' },
] as const;
export type CampaignTab = (typeof CAMPAIGN_TABS)[number]['key'];
export type CampaignsQuery = { tab: CampaignTab; page: number };
export const CAMPAIGNS_PAGE_SIZE = 20;
const BASE = '/admin/ban-tin';

export function parseCampaignsQuery(sp: URLSearchParams): CampaignsQuery {
  const page = Number(sp.get('page'));
  return {
    tab: CAMPAIGN_TABS.find((t) => t.key === sp.get('tab'))?.key ?? 'all',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function campaignsAdminHref(q: CampaignsQuery): string {
  const p = new URLSearchParams();
  if (q.tab !== 'all') p.set('tab', q.tab);
  if (q.page > 1) p.set('page', String(q.page));
  const qs = p.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

export function campaignsApiPath(q: CampaignsQuery): string {
  const p = new URLSearchParams({ page: String(q.page), pageSize: String(CAMPAIGNS_PAGE_SIZE) });
  if (q.tab !== 'all') p.set('status', q.tab);
  return `/newsletter/campaigns?${p}`;
}
