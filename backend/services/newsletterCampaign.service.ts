import { Prisma, type NewsletterCampaignStatus } from '@prisma/client';
import { isProduction, siteUrl } from '../config/env';
import { PRODUCT_STATUS } from '../constants/product';
import ApiError from '../utils/ApiError';
import { logger } from '../utils/logger';
import { isNewsletterMailConfigured, sendNewsletterMessage } from './email.service';
import { renderCampaignEmail } from './newsletterEmail.service';
import { featuredRefs, resolveCards, shopContact, type FeaturedRef } from './newsletterSend.service';
import prisma from './prisma';

// Admin side of newsletter campaigns (spec 2026-11-10, ADR-025): write, edit, schedule, cancel,
// test. Sending itself is newsletterSend.service.ts. Every status change is a conditional UPDATE
// with the allowed statuses in the WHERE, so an edit cannot slip in after the worker has started a
// campaign: the loser updates nothing and gets 409.

export type CampaignInput = { subject: string; preheader?: string | null; content: string; isAdvertising?: boolean; featured?: FeaturedRef[] };
export type FeaturedItem = FeaturedRef & { title: string | null; available: boolean };

const EDITABLE: NewsletterCampaignStatus[] = ['DRAFT', 'SCHEDULED'];

const LIST_ROW = {
  id: true, subject: true, status: true, isAdvertising: true, scheduledAt: true, startedAt: true, finishedAt: true,
  recipientCount: true, sentCount: true, failedCount: true, unsubscribeCount: true, createdAt: true, updatedAt: true,
} as const;
const FULL_ROW = { ...LIST_ROW, preheader: true, content: true, featured: true } as const;
type FullRow = Prisma.NewsletterCampaignGetPayload<{ select: typeof FULL_ROW }>;

const notFound = () => new ApiError(404, 'NOT_FOUND', 'Không tìm thấy bản tin');
const locked = () => new ApiError(409, 'CAMPAIGN_LOCKED', 'Bản tin đã bắt đầu gửi hoặc đã xong, không đổi được nữa');

// A conditional write that matched nothing: either the campaign does not exist, or it is in a
// status that does not allow the change.
async function lockedOrMissing(id: string): Promise<never> {
  const exists = await prisma.newsletterCampaign.findUnique({ where: { id }, select: { id: true } });
  throw exists ? locked() : notFound();
}

// Production cannot schedule or test without Brevo: the email would have nowhere to go.
// Development and tests print / capture it instead (email.service.ts).
export function assertNewsletterReady(production = isProduction, configured = isNewsletterMailConfigured()): void {
  if (production && !configured) throw new ApiError(409, 'NEWSLETTER_NOT_CONFIGURED', 'Chưa cấu hình gửi bản tin (Brevo SMTP) trên server.');
}

// Featured items must exist when saved (any status: a draft post may be published before sending;
// the email leaves out whatever is not public by then).
async function assertFeaturedExist(featured: FeaturedRef[]): Promise<void> {
  const ids = (type: FeaturedRef['type']) => featured.filter((f) => f.type === type).map((f) => f.id);
  const [posts, products] = await Promise.all([
    prisma.blogPost.count({ where: { id: { in: ids('post') } } }),
    prisma.product.count({ where: { id: { in: ids('product') } } }),
  ]);
  if (posts !== ids('post').length || products !== ids('product').length) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [{ type: 'field', path: 'featured', location: 'body', msg: 'Có bài viết hoặc sản phẩm không còn tồn tại' }]);
  }
}

function toJson(featured: FeaturedRef[]): Prisma.InputJsonValue {
  return featured.map((f) => ({ type: f.type, id: f.id }));
}

// For the edit form: the name of each featured item and whether it would appear in the email now.
async function featuredItems(value: Prisma.JsonValue, now: Date): Promise<FeaturedItem[]> {
  const refs = featuredRefs(value);
  const ids = (type: FeaturedRef['type']) => refs.filter((r) => r.type === type).map((r) => r.id);
  const [posts, products] = await Promise.all([
    prisma.blogPost.findMany({ where: { id: { in: ids('post') } }, select: { id: true, title: true, status: true, publishedAt: true } }),
    prisma.product.findMany({ where: { id: { in: ids('product') } }, select: { id: true, name: true, status: true } }),
  ]);
  const postById = new Map(posts.map((p) => [p.id, p]));
  const productById = new Map(products.map((p) => [p.id, p]));
  return refs.map((r) => {
    if (r.type === 'post') {
      const p = postById.get(r.id);
      return { ...r, title: p?.title ?? null, available: Boolean(p && p.status === 'published' && p.publishedAt && p.publishedAt <= now) };
    }
    const p = productById.get(r.id);
    return { ...r, title: p?.name ?? null, available: p?.status === PRODUCT_STATUS.ACTIVE };
  });
}

async function full(id: string, now = new Date()): Promise<Omit<FullRow, 'featured'> & { featured: FeaturedRef[]; featuredItems: FeaturedItem[] }> {
  const row = await prisma.newsletterCampaign.findUnique({ where: { id }, select: FULL_ROW });
  if (!row) throw notFound();
  return { ...row, featured: featuredRefs(row.featured), featuredItems: await featuredItems(row.featured, now) };
}

export async function createCampaign(input: CampaignInput) {
  const featured = input.featured ?? [];
  await assertFeaturedExist(featured);
  const row = await prisma.newsletterCampaign.create({
    data: { subject: input.subject, preheader: input.preheader ?? null, content: input.content, isAdvertising: input.isAdvertising ?? true, featured: toJson(featured) },
    select: { id: true },
  });
  return full(row.id);
}

export async function listCampaigns(q: { status?: NewsletterCampaignStatus; take: number; skip: number }) {
  const where: Prisma.NewsletterCampaignWhereInput = q.status ? { status: q.status } : {};
  const [items, total] = await Promise.all([
    prisma.newsletterCampaign.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: q.skip, take: q.take, select: LIST_ROW }),
    prisma.newsletterCampaign.count({ where }),
  ]);
  return { items, total };
}

export const getCampaign = (id: string) => full(id);

export async function updateCampaign(id: string, patch: Partial<CampaignInput>) {
  if (patch.featured) await assertFeaturedExist(patch.featured);
  const { count } = await prisma.newsletterCampaign.updateMany({
    where: { id, status: { in: EDITABLE } },
    data: {
      ...(patch.subject !== undefined && { subject: patch.subject }),
      ...(patch.preheader !== undefined && { preheader: patch.preheader }),
      ...(patch.content !== undefined && { content: patch.content }),
      ...(patch.isAdvertising !== undefined && { isAdvertising: patch.isAdvertising }),
      ...(patch.featured !== undefined && { featured: toJson(patch.featured) }),
    },
  });
  if (count === 0) await lockedOrMissing(id);
  return full(id);
}

// Only drafts: a campaign that was scheduled or sent keeps its record (and its report).
export async function deleteCampaign(id: string): Promise<void> {
  const { count } = await prisma.newsletterCampaign.deleteMany({ where: { id, status: 'DRAFT' } });
  if (count === 0) await lockedOrMissing(id);
}

// No time = as soon as the worker ticks. The route has already checked the time window.
export async function scheduleCampaign(id: string, scheduledAt: Date | undefined, now = new Date()) {
  assertNewsletterReady();
  const { count } = await prisma.newsletterCampaign.updateMany({
    where: { id, status: { in: EDITABLE } },
    data: { status: 'SCHEDULED', scheduledAt: scheduledAt ?? now },
  });
  if (count === 0) await lockedOrMissing(id);
  return full(id);
}

// Before it starts: back to draft (edit, schedule again). While sending: stop — the worker claims
// no further email for it. Both in one transaction so exactly one of the two can apply.
export async function cancelCampaign(id: string, now = new Date()) {
  const changed = await prisma.$transaction(async (tx) => {
    const unscheduled = await tx.newsletterCampaign.updateMany({ where: { id, status: 'SCHEDULED' }, data: { status: 'DRAFT', scheduledAt: null } });
    if (unscheduled.count === 1) return true;
    const stopped = await tx.newsletterCampaign.updateMany({ where: { id, status: 'SENDING' }, data: { status: 'CANCELLED', finishedAt: now } });
    return stopped.count === 1;
  });
  if (!changed) await lockedOrMissing(id);
  return full(id);
}

// The real email, to the signed-in admin only, labelled "[Thử]". Its unsubscribe link is the
// plain page (no token): a test must not be able to unsubscribe anybody.
export async function sendTestCampaign(id: string, adminUserId: string, now = new Date()): Promise<{ to: string }> {
  assertNewsletterReady();
  const [campaign, admin] = await Promise.all([
    prisma.newsletterCampaign.findUnique({ where: { id }, select: { subject: true, preheader: true, content: true, isAdvertising: true, featured: true } }),
    prisma.user.findUnique({ where: { id: adminUserId }, select: { email: true } }),
  ]);
  if (!campaign) throw notFound();
  if (!admin) throw new ApiError(401, 'UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ');
  const message = renderCampaignEmail({
    subject: campaign.subject, preheader: campaign.preheader, content: campaign.content, isAdvertising: campaign.isAdvertising,
    cards: await resolveCards(campaign.featured, now), shop: await shopContact(), siteUrl, unsubscribeUrl: `${siteUrl}/huy-dang-ky`, isTest: true,
  });
  try {
    await sendNewsletterMessage({ to: admin.email, ...message });
  } catch (err) {
    const e = err as { responseCode?: unknown; code?: unknown };
    logger.warn({ campaignId: id, responseCode: e?.responseCode, code: e?.code }, '[newsletter] Gửi thử thất bại');
    throw new ApiError(500, 'MAIL_FAILED', 'Chưa gửi được email thử. Kiểm tra cấu hình gửi bản tin (Brevo SMTP).');
  }
  return { to: admin.email };
}
