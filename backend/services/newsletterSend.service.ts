import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { newsletterMail, siteUrl } from '../config/env';
import {
  DELIVERY_KEPT_DAYS,
  DELIVERY_MAX_ATTEMPTS,
  DELIVERY_STUCK_MINUTES,
} from '../constants/newsletter';
import { PRODUCT_STATUS } from '../constants/product';
import { logger } from '../utils/logger';
import { sendNewsletterMessage } from './email.service';
import { renderCampaignEmail, type CampaignCard, type ShopContact } from './newsletterEmail.service';
import prisma from './prisma';

// Sending newsletter campaigns (spec 2026-11-10, ADR-025), run by workers/sendNewsletters.ts every
// minute. Each tick: release deliveries stuck mid-send, claim the campaigns that are due, send one
// batch under the daily limit, close the campaigns with nothing left, forget old recipients.
//
// Every claim is a conditional UPDATE: a campaign moves SCHEDULED → SENDING, and a delivery
// PENDING → SENDING (only while its campaign is still SENDING), in one statement each. Two workers
// running at once therefore never send the same email twice, and a campaign cancelled mid-way stops
// at the next claim. A crash between "sent" and "marked SENT" can repeat one email after the stuck
// timeout (at-least-once); that is preferred to silently dropping it.

const MINUTE = 60_000;
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');
// Timestamps go into raw SQL as ISO text read in UTC, so the session time zone can never shift them
// (the columns are `timestamp` without zone, holding UTC like everything Prisma writes).
const utc = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

export type SendLimits = { dailyLimit: number; batchSize: number };
export type TickResult = { claimed: number; sent: number; failed: number; finished: number };

type FeaturedRef = { type: 'post' | 'product'; id: string };
type Context = { subject: string; preheader: string | null; content: string; isAdvertising: boolean; cards: CampaignCard[] };

function featuredRefs(value: Prisma.JsonValue): FeaturedRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) =>
    v && typeof v === 'object' && !Array.isArray(v) && (v.type === 'post' || v.type === 'product') && typeof v.id === 'string'
      ? [{ type: v.type, id: v.id }]
      : [],
  );
}

// Cards are looked up when the email goes out: a post unpublished or a product hidden since the
// campaign was written is left out, and prices are today's. Order is the one the admin chose.
export async function resolveCards(value: Prisma.JsonValue, now: Date): Promise<CampaignCard[]> {
  const refs = featuredRefs(value);
  const postIds = refs.filter((r) => r.type === 'post').map((r) => r.id);
  const productIds = refs.filter((r) => r.type === 'product').map((r) => r.id);
  const [posts, products] = await Promise.all([
    postIds.length
      ? prisma.blogPost.findMany({ where: { id: { in: postIds }, status: 'published', publishedAt: { lte: now } }, select: { id: true, title: true, slug: true, excerpt: true, coverImageUrl: true } })
      : [],
    productIds.length
      ? prisma.product.findMany({
          where: { id: { in: productIds }, status: PRODUCT_STATUS.ACTIVE },
          select: { id: true, name: true, slug: true, minPrice: true, images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } } },
        })
      : [],
  ]);
  const postById = new Map(posts.map((p) => [p.id, p]));
  const productById = new Map(products.map((p) => [p.id, p]));
  return refs.flatMap((r): CampaignCard[] => {
    if (r.type === 'post') {
      const p = postById.get(r.id);
      return p ? [{ kind: 'post', title: p.title, url: `${siteUrl}/blog/${p.slug}`, imageUrl: p.coverImageUrl, summary: p.excerpt }] : [];
    }
    const p = productById.get(r.id);
    return p ? [{ kind: 'product', title: p.name, url: `${siteUrl}/san-pham/${p.slug}`, imageUrl: p.images[0]?.url ?? null, price: p.minPrice }] : [];
  });
}

export async function shopContact(): Promise<ShopContact> {
  const rows = await prisma.siteSetting.findMany({ where: { key: { in: ['shop_address', 'shop_phone', 'shop_email'] } }, select: { key: true, value: true } });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { address: s.shop_address || undefined, phone: s.shop_phone || undefined, email: s.shop_email || undefined };
}

// RFC 8058 one-click (Gmail / Yahoo bulk-sender rules) needs a POST endpoint on this API, so it is
// only offered when PUBLIC_API_URL is known; the storefront page link always works.
export function listUnsubscribeHeaders(token: string, unsubscribeUrl: string): Record<string, string> {
  const api = newsletterMail.publicApiUrl;
  const urls = [api ? `<${api}/api/v1/newsletter/one-click?token=${token}>` : null, `<${unsubscribeUrl}>`].filter(Boolean);
  return { 'List-Unsubscribe': urls.join(', '), ...(api && { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }) };
}

// The SMTP code or the network error code, never the message: servers echo the address in it.
function failureOf(err: unknown): { reason: string; permanent: boolean } {
  const e = err as { responseCode?: unknown; code?: unknown };
  if (typeof e?.responseCode === 'number') return { reason: `SMTP ${e.responseCode}`, permanent: e.responseCode >= 500 };
  return { reason: typeof e?.code === 'string' ? e.code.slice(0, 40) : 'SEND_FAILED', permanent: false };
}

async function releaseStuck(now: Date): Promise<void> {
  const stuck = await prisma.newsletterDelivery.findMany({
    where: { status: 'SENDING', claimedAt: { lt: new Date(now.getTime() - DELIVERY_STUCK_MINUTES * MINUTE) } },
    select: { id: true, campaignId: true, attempts: true },
  });
  for (const d of stuck) {
    if (d.attempts < DELIVERY_MAX_ATTEMPTS) {
      await prisma.newsletterDelivery.updateMany({ where: { id: d.id, status: 'SENDING' }, data: { status: 'PENDING', claimedAt: null, error: 'INTERRUPTED' } });
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.newsletterDelivery.updateMany({ where: { id: d.id, status: 'SENDING' }, data: { status: 'FAILED', claimedAt: null, error: 'INTERRUPTED' } });
      if (count === 1) await tx.newsletterCampaign.update({ where: { id: d.campaignId }, data: { failedCount: { increment: 1 } } });
    });
  }
}

// SCHEDULED → SENDING and the recipient snapshot in one transaction: whoever is CONFIRMED at that
// moment gets it; later signups do not, unsubscribes after that moment still stop at the claim.
async function claimDueCampaigns(now: Date): Promise<number> {
  const due = await prisma.newsletterCampaign.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
    orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  let claimed = 0;
  for (const { id } of due) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.newsletterCampaign.updateMany({
        where: { id, status: 'SCHEDULED', scheduledAt: { lte: now } },
        data: { status: 'SENDING', startedAt: now },
      });
      if (count !== 1) return; // another worker, or a cancel, got there first
      const recipients = await tx.newsletterSubscriber.findMany({ where: { status: 'CONFIRMED' }, select: { id: true, email: true } });
      await tx.newsletterDelivery.createMany({ data: recipients.map((s) => ({ campaignId: id, subscriberId: s.id, email: s.email, createdAt: now })) });
      await tx.newsletterCampaign.update({ where: { id }, data: { recipientCount: recipients.length } });
      claimed += 1;
    });
  }
  return claimed;
}

async function remainingToday(now: Date, dailyLimit: number): Promise<number> {
  const sentToday = await prisma.newsletterDelivery.count({ where: { status: 'SENT', sentAt: { gt: new Date(now.getTime() - 24 * 60 * MINUTE) } } });
  return Math.max(0, dailyLimit - sentToday);
}

async function loadContext(campaignId: string, now: Date): Promise<Context | null> {
  const c = await prisma.newsletterCampaign.findUnique({ where: { id: campaignId }, select: { subject: true, preheader: true, content: true, isAdvertising: true, featured: true } });
  if (!c) return null;
  return { subject: c.subject, preheader: c.preheader, content: c.content, isAdvertising: c.isAdvertising, cards: await resolveCards(c.featured, now) };
}

async function sendBatch(now: Date, limits: SendLimits): Promise<{ sent: number; failed: number }> {
  const budget = Math.min(limits.batchSize, await remainingToday(now, limits.dailyLimit));
  if (budget === 0) return { sent: 0, failed: 0 };
  const batch = await prisma.newsletterDelivery.findMany({
    where: { status: 'PENDING', campaign: { status: 'SENDING' } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: budget,
    select: { id: true, campaignId: true, email: true },
  });
  if (batch.length === 0) return { sent: 0, failed: 0 };

  const shop = await shopContact();
  const contexts = new Map<string, Context | null>();
  let sent = 0;
  let failed = 0;
  for (const d of batch) {
    const token = newToken();
    // Claimed only while the campaign is still SENDING (a stop takes effect here).
    const [claim] = await prisma.$queryRaw<{ attempts: number }[]>`
      UPDATE "NewsletterDelivery" AS d
      SET "status" = 'SENDING', "claimedAt" = ${utc(now)}, "attempts" = d."attempts" + 1, "unsubscribeTokenHash" = ${hash(token)}
      FROM "NewsletterCampaign" AS c
      WHERE d."id" = ${d.id} AND d."status" = 'PENDING' AND c."id" = d."campaignId" AND c."status" = 'SENDING'
      RETURNING d."attempts"`;
    if (!claim) continue;

    if (!contexts.has(d.campaignId)) contexts.set(d.campaignId, await loadContext(d.campaignId, now));
    const ctx = contexts.get(d.campaignId);
    if (!ctx) continue;
    const unsubscribeUrl = `${siteUrl}/huy-dang-ky?token=${token}`;
    const message = renderCampaignEmail({ ...ctx, shop, siteUrl, unsubscribeUrl });
    try {
      await sendNewsletterMessage({ to: d.email, ...message, headers: listUnsubscribeHeaders(token, unsubscribeUrl) });
    } catch (err) {
      const { reason, permanent } = failureOf(err);
      const giveUp = permanent || claim.attempts >= DELIVERY_MAX_ATTEMPTS;
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.newsletterDelivery.updateMany({
          where: { id: d.id, status: 'SENDING' },
          data: { status: giveUp ? 'FAILED' : 'PENDING', claimedAt: null, error: reason },
        });
        if (count === 1 && giveUp) await tx.newsletterCampaign.update({ where: { id: d.campaignId }, data: { failedCount: { increment: 1 } } });
      });
      if (giveUp) failed += 1;
      logger.warn({ campaignId: d.campaignId, deliveryId: d.id, reason, giveUp }, '[newsletter] Gửi thất bại');
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.newsletterDelivery.updateMany({ where: { id: d.id, status: 'SENDING' }, data: { status: 'SENT', sentAt: now, claimedAt: null, error: null } });
      if (count === 1) await tx.newsletterCampaign.update({ where: { id: d.campaignId }, data: { sentCount: { increment: 1 } } });
    });
    sent += 1;
  }
  return { sent, failed };
}

async function finishCampaigns(now: Date): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "NewsletterCampaign" AS c
    SET "status" = 'SENT', "finishedAt" = ${utc(now)}, "updatedAt" = ${utc(now)}
    WHERE c."status" = 'SENDING'
      AND NOT EXISTS (SELECT 1 FROM "NewsletterDelivery" AS d WHERE d."campaignId" = c."id" AND d."status" IN ('PENDING', 'SENDING'))`;
}

// Recipient addresses are only needed while sending and for a while after (complaints, bounces);
// the counters on the campaign keep the report.
async function purgeOldDeliveries(now: Date): Promise<void> {
  await prisma.newsletterDelivery.deleteMany({ where: { campaign: { finishedAt: { lt: new Date(now.getTime() - DELIVERY_KEPT_DAYS * 24 * 60 * MINUTE) } } } });
}

export async function runNewsletterTick(now = new Date(), limits: SendLimits = newsletterMail): Promise<TickResult> {
  await releaseStuck(now);
  const claimed = await claimDueCampaigns(now);
  const { sent, failed } = await sendBatch(now, limits);
  const finished = await finishCampaigns(now);
  await purgeOldDeliveries(now);
  return { claimed, sent, failed, finished };
}
