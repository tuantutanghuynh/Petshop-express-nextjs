import crypto from 'crypto';
import { Prisma, type NewsletterStatus } from '@prisma/client';
import prisma from './prisma';
import ApiError from '../utils/ApiError';
import { toCsv } from '../utils/csv';
import { CONFIRM_LINK_VALID_HOURS, NEWSLETTER_CONSENT_TEXT, PENDING_KEPT_DAYS, RESEND_AFTER_MINUTES } from '../constants/newsletter';

// Newsletter signups (spec 2026-11-07). Tokens are random and only their SHA-256 hash is stored, so a
// database leak does not hand out working links. Every state change is a conditional UPDATE (the
// expected state is in the WHERE), never read-then-write: two signups or two clicks at the same
// moment cannot both win, and the loser simply finds nothing to change.

const MINUTE = 60 * 1000;
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');
const invalidToken = () => new ApiError(400, 'INVALID_TOKEN', 'Link không hợp lệ hoặc đã hết hạn');

export type SubscribeOutcome = { send: false } | { send: true; confirmToken: string };

// New address → PENDING row; UNSUBSCRIBED, or PENDING whose last email is older than the resend
// window → back to PENDING with a fresh token and consent; CONFIRMED, or PENDING inside the window →
// nothing. The caller answers the same in every case.
export async function subscribe(email: string, now = new Date()): Promise<SubscribeOutcome> {
  const confirmToken = newToken();
  const fresh = {
    status: 'PENDING' as const,
    confirmTokenHash: hash(confirmToken),
    confirmExpiresAt: new Date(now.getTime() + CONFIRM_LINK_VALID_HOURS * 60 * MINUTE),
    confirmSentAt: now,
    consentText: NEWSLETTER_CONSENT_TEXT,
    consentAt: now,
  };
  const { count } = await prisma.newsletterSubscriber.updateMany({
    where: {
      email,
      OR: [{ status: 'UNSUBSCRIBED' }, { status: 'PENDING', confirmSentAt: { lt: new Date(now.getTime() - RESEND_AFTER_MINUTES * MINUTE) } }],
    },
    data: { ...fresh, unsubscribedAt: null },
  });
  if (count === 1) return { send: true, confirmToken };
  try {
    await prisma.newsletterSubscriber.create({ data: { email, ...fresh } });
    return { send: true, confirmToken };
  } catch (err) {
    // The row exists: CONFIRMED, inside the resend window, or created a moment ago by a concurrent
    // signup for the same address (which sends the email). Nothing to do.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { send: false };
    throw err;
  }
}

// Single use: the token is cleared by the same UPDATE that confirms, and a new unsubscribe token is
// issued — its raw value exists only in the welcome email the caller sends.
export async function confirm(token: string, now = new Date()): Promise<{ email: string; unsubscribeToken: string }> {
  const confirmTokenHash = hash(token);
  const row = await prisma.newsletterSubscriber.findUnique({ where: { confirmTokenHash }, select: { id: true, email: true } });
  if (!row) throw invalidToken();
  const unsubscribeToken = newToken();
  const { count } = await prisma.newsletterSubscriber.updateMany({
    where: { id: row.id, confirmTokenHash, status: 'PENDING', confirmExpiresAt: { gt: now } },
    data: { status: 'CONFIRMED', confirmedAt: now, confirmTokenHash: null, confirmExpiresAt: null, unsubscribeTokenHash: hash(unsubscribeToken) },
  });
  if (count !== 1) throw invalidToken();
  return { email: row.email, unsubscribeToken };
}

// Repeating it is fine (200 again): the token stays valid for an already unsubscribed row.
export async function unsubscribe(token: string, now = new Date()): Promise<void> {
  const row = await prisma.newsletterSubscriber.findUnique({ where: { unsubscribeTokenHash: hash(token) }, select: { id: true } });
  if (!row) throw invalidToken();
  await prisma.newsletterSubscriber.updateMany({
    where: { id: row.id, status: 'CONFIRMED' },
    data: { status: 'UNSUBSCRIBED', unsubscribedAt: now },
  });
}

// consentAt, not createdAt: a re-subscription keeps the original createdAt and must get its 7 days.
export async function purgePending(now = new Date()): Promise<number> {
  const { count } = await prisma.newsletterSubscriber.deleteMany({
    where: { status: 'PENDING', consentAt: { lt: new Date(now.getTime() - PENDING_KEPT_DAYS * 24 * 60 * MINUTE) } },
  });
  return count;
}

const ROW = { id: true, email: true, status: true, consentAt: true, confirmedAt: true, unsubscribedAt: true, createdAt: true } as const;
export type SubscriberRow = Prisma.NewsletterSubscriberGetPayload<{ select: typeof ROW }>;

export async function listSubscribers(q: { status?: NewsletterStatus; q?: string; take: number; skip: number }): Promise<{ items: SubscriberRow[]; total: number }> {
  const where: Prisma.NewsletterSubscriberWhereInput = {
    ...(q.status && { status: q.status }),
    ...(q.q && { email: { contains: q.q.toLowerCase() } }), // emails are stored lower-cased
  };
  const [items, total] = await Promise.all([
    prisma.newsletterSubscriber.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: q.skip, take: q.take, select: ROW }),
    prisma.newsletterSubscriber.count({ where }),
  ]);
  return { items, total };
}

// Only people who confirmed: the file is what gets imported into the sending service.
export async function exportConfirmed(now = new Date()): Promise<{ filename: string; csv: string }> {
  const rows = await prisma.newsletterSubscriber.findMany({
    where: { status: 'CONFIRMED' },
    orderBy: [{ confirmedAt: 'asc' }, { id: 'asc' }],
    select: { email: true, confirmedAt: true, consentAt: true },
  });
  const csv = toCsv(['email', 'confirmedAt', 'consentAt'], rows.map((r) => [r.email, r.confirmedAt?.toISOString() ?? '', r.consentAt.toISOString()]));
  return { filename: `newsletter-${now.toISOString().slice(0, 10)}.csv`, csv };
}

// A customer's erasure request: the row is gone, not just marked.
export async function deleteSubscriber(id: string): Promise<void> {
  const { count } = await prisma.newsletterSubscriber.deleteMany({ where: { id } });
  if (count === 0) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy người đăng ký');
}
