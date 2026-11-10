import crypto from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { siteUrl } from '../../config/env';
import { NEWSLETTER_CONSENT_TEXT } from '../../constants/newsletter';
import { setMailTransportForTests, type MailMessage } from '../../services/email.service';
import { runNewsletterTick } from '../../services/newsletterSend.service';
import prisma from '../../services/prisma';
import { createAdmin, createBrand, createProduct } from './helpers/factories';

// The sending worker (spec 2026-11-10): claim due campaigns, snapshot confirmed subscribers, send in
// batches under the daily limit, retry transient failures, finish, and forget recipients later.

const NOW = new Date('2026-11-10T01:00:00.000Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);
const LIMITS = { dailyLimit: 300, batchSize: 20 };
const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

function captureMail(fail?: (m: MailMessage, n: number) => Error | null) {
  const sent: MailMessage[] = [];
  let calls = 0;
  setMailTransportForTests({
    sendMail: async (m) => {
      calls += 1;
      const err = fail?.(m, calls);
      if (err) throw err;
      sent.push(m);
    },
  });
  return sent;
}
afterEach(() => setMailTransportForTests(null));

async function subscribers(n: number, status: 'CONFIRMED' | 'PENDING' | 'UNSUBSCRIBED' = 'CONFIRMED', prefix = 's') {
  const rows = Array.from({ length: n }, (_, i) => ({
    email: `${prefix}${i}@example.com`, status, consentText: NEWSLETTER_CONSENT_TEXT, consentAt: NOW,
    confirmedAt: status === 'CONFIRMED' ? NOW : null,
  }));
  await prisma.newsletterSubscriber.createMany({ data: rows });
}

const campaign = (data: Partial<{ status: 'DRAFT' | 'SCHEDULED' | 'SENDING'; scheduledAt: Date; featured: object[]; isAdvertising: boolean }> = {}) =>
  prisma.newsletterCampaign.create({
    data: { subject: 'Mẹo tháng 11', preheader: 'Xem trước', content: '## Chào\n\nNội dung.', status: 'SCHEDULED', scheduledAt: minutes(-1), ...data },
  });
const reload = (id: string) => prisma.newsletterCampaign.findUniqueOrThrow({ where: { id } });
const deliveries = (campaignId: string) => prisma.newsletterDelivery.findMany({ where: { campaignId }, orderBy: { email: 'asc' } });

describe('claiming a campaign', () => {
  it('sends a due campaign only to confirmed subscribers, then marks it SENT', async () => {
    await subscribers(3);
    await subscribers(2, 'PENDING', 'p');
    await subscribers(1, 'UNSUBSCRIBED', 'u');
    const sent = captureMail();
    const c = await campaign();
    await runNewsletterTick(NOW, LIMITS);
    expect(sent.map((m) => m.to).sort()).toEqual(['s0@example.com', 's1@example.com', 's2@example.com']);
    const after = await reload(c.id);
    expect(after).toMatchObject({ status: 'SENT', recipientCount: 3, sentCount: 3, failedCount: 0 });
    expect(after.startedAt).toEqual(NOW);
    expect(after.finishedAt).toEqual(NOW);
    expect((await deliveries(c.id)).every((d) => d.status === 'SENT' && d.unsubscribeTokenHash)).toBe(true);
  });

  it('leaves drafts and campaigns scheduled later alone', async () => {
    await subscribers(1);
    const sent = captureMail();
    const draft = await campaign({ status: 'DRAFT', scheduledAt: minutes(-5) });
    const later = await campaign({ scheduledAt: minutes(5) });
    await runNewsletterTick(NOW, LIMITS);
    expect(sent).toHaveLength(0);
    expect((await reload(draft.id)).status).toBe('DRAFT');
    expect((await reload(later.id)).status).toBe('SCHEDULED');
  });

  it('finishes a campaign with nobody to send to', async () => {
    captureMail();
    const c = await campaign();
    await runNewsletterTick(NOW, LIMITS);
    expect(await reload(c.id)).toMatchObject({ status: 'SENT', recipientCount: 0 });
  });

  it('does not send to someone who subscribes after the campaign started', async () => {
    await subscribers(2);
    const sent = captureMail();
    const c = await campaign();
    await runNewsletterTick(NOW, { dailyLimit: 300, batchSize: 1 });
    await subscribers(1, 'CONFIRMED', 'late');
    await runNewsletterTick(minutes(1), LIMITS);
    expect(sent.map((m) => m.to)).not.toContain('late0@example.com');
    expect((await reload(c.id)).status).toBe('SENT');
  });
});

describe('the email', () => {
  it('carries a personal unsubscribe link whose token matches the stored hash, and one-click headers', async () => {
    await subscribers(1);
    const sent = captureMail();
    const c = await campaign();
    await runNewsletterTick(NOW, LIMITS);
    const [m] = sent;
    expect(m.subject).toBe('[QC] Mẹo tháng 11');
    const link = new RegExp(`${siteUrl}/huy-dang-ky\\?token=([a-f0-9]{64})`).exec(m.text);
    expect(link).not.toBeNull();
    const [d] = await deliveries(c.id);
    expect(d.unsubscribeTokenHash).toBe(hash(link?.[1] ?? ''));
    expect(m.headers?.['List-Unsubscribe']).toContain(`${siteUrl}/huy-dang-ky?token=${link?.[1]}`);
  });

  it('shows featured posts and active products, and skips hidden ones', async () => {
    await subscribers(1);
    const admin = await createAdmin();
    const post = await prisma.blogPost.create({ data: { title: 'Bao lâu tẩy giun cho mèo?', slug: 'tay-giun-meo', content: 'x', excerpt: 'Lịch theo tuổi.', authorId: admin.id, status: 'published', publishedAt: minutes(-60) } });
    const draftPost = await prisma.blogPost.create({ data: { title: 'Bài nháp', slug: 'bai-nhap', content: 'x', authorId: admin.id, status: 'draft' } });
    const { child } = await createBrand();
    const product = await createProduct(child.id, { variants: [{ price: 25_000 }] });
    const sent = captureMail();
    await campaign({ featured: [{ type: 'post', id: post.id }, { type: 'post', id: draftPost.id }, { type: 'product', id: product.id }, { type: 'product', id: 'missing' }] });
    await runNewsletterTick(NOW, LIMITS);
    const [m] = sent;
    expect(m.html).toContain(`${siteUrl}/blog/tay-giun-meo`);
    expect(m.html).toContain(`${siteUrl}/san-pham/${product.slug}`);
    expect(m.html).not.toContain('Bài nháp');
    expect(m.text).toMatch(/25\.000\s₫/);
  });
});

describe('limits and failures', () => {
  it('sends at most one batch per tick and resumes on the next', async () => {
    await subscribers(5);
    const sent = captureMail();
    const c = await campaign();
    await runNewsletterTick(NOW, { dailyLimit: 300, batchSize: 2 });
    expect(sent).toHaveLength(2);
    expect((await reload(c.id)).status).toBe('SENDING');
    await runNewsletterTick(minutes(1), { dailyLimit: 300, batchSize: 2 });
    await runNewsletterTick(minutes(2), { dailyLimit: 300, batchSize: 2 });
    expect(sent).toHaveLength(5);
    expect(new Set(sent.map((m) => m.to)).size).toBe(5);
    expect(await reload(c.id)).toMatchObject({ status: 'SENT', sentCount: 5 });
  });

  it('stops at the daily limit counted over the last 24 hours, across campaigns', async () => {
    await subscribers(4);
    const sent = captureMail();
    await campaign();
    await runNewsletterTick(NOW, { dailyLimit: 3, batchSize: 20 });
    expect(sent).toHaveLength(3);
    await runNewsletterTick(minutes(60), { dailyLimit: 3, batchSize: 20 });
    expect(sent).toHaveLength(3);
    await runNewsletterTick(minutes(24 * 60 + 1), { dailyLimit: 3, batchSize: 20 });
    expect(sent).toHaveLength(4);
  });

  it('retries a transient failure and gives up on a permanent one', async () => {
    await subscribers(2);
    const smtp = (code: number) => Object.assign(new Error(`SMTP ${code} for s@example.com`), { responseCode: code });
    const sent = captureMail((m, n) => (m.to === 's0@example.com' && n <= 2 ? smtp(421) : m.to === 's1@example.com' ? smtp(550) : null));
    const c = await campaign();
    await runNewsletterTick(NOW, LIMITS);
    let rows = await deliveries(c.id);
    expect(rows.map((d) => [d.email, d.status, d.attempts, d.error])).toEqual([
      ['s0@example.com', 'PENDING', 1, 'SMTP 421'],
      ['s1@example.com', 'FAILED', 1, 'SMTP 550'],
    ]);
    await runNewsletterTick(minutes(1), LIMITS);
    await runNewsletterTick(minutes(2), LIMITS);
    rows = await deliveries(c.id);
    expect(rows[0]).toMatchObject({ status: 'SENT', attempts: 2 });
    expect(sent.map((m) => m.to)).toEqual(['s0@example.com']);
    expect(await reload(c.id)).toMatchObject({ status: 'SENT', sentCount: 1, failedCount: 1 });
  });

  it('marks a delivery FAILED after the last transient attempt', async () => {
    await subscribers(1);
    captureMail(() => Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    const c = await campaign();
    for (let i = 0; i < 4; i++) await runNewsletterTick(minutes(i), LIMITS);
    const [d] = await deliveries(c.id);
    expect(d).toMatchObject({ status: 'FAILED', attempts: 3, error: 'ETIMEDOUT' });
    expect(await reload(c.id)).toMatchObject({ status: 'SENT', sentCount: 0, failedCount: 1 });
  });

  it('never stores the SMTP message, which can contain the address', async () => {
    await subscribers(1);
    captureMail(() => Object.assign(new Error('550 s0@example.com does not exist'), { responseCode: 550 }));
    const c = await campaign();
    await runNewsletterTick(NOW, LIMITS);
    expect((await deliveries(c.id))[0].error).toBe('SMTP 550');
  });

  it('releases a delivery stuck in SENDING (crash mid-send) after 10 minutes', async () => {
    await subscribers(1);
    const sent = captureMail();
    const c = await campaign({ status: 'SENDING' });
    const sub = await prisma.newsletterSubscriber.findFirstOrThrow();
    await prisma.newsletterDelivery.create({ data: { campaignId: c.id, subscriberId: sub.id, email: sub.email, status: 'SENDING', claimedAt: minutes(-5) } });
    await runNewsletterTick(NOW, LIMITS);
    expect(sent).toHaveLength(0);
    await runNewsletterTick(minutes(6), LIMITS);
    expect(sent).toHaveLength(1);
    expect(await reload(c.id)).toMatchObject({ status: 'SENT', sentCount: 1 });
  });

  it('sends nothing more for a campaign cancelled while sending', async () => {
    await subscribers(4);
    const sent = captureMail();
    const c = await campaign();
    await runNewsletterTick(NOW, { dailyLimit: 300, batchSize: 1 });
    await prisma.newsletterCampaign.update({ where: { id: c.id }, data: { status: 'CANCELLED', finishedAt: NOW } });
    await runNewsletterTick(minutes(1), LIMITS);
    expect(sent).toHaveLength(1);
    expect((await reload(c.id)).status).toBe('CANCELLED');
  });
});

describe('keeping recipient data short', () => {
  it('deletes the recipients of a finished campaign after 90 days and keeps its counters', async () => {
    await subscribers(2);
    captureMail();
    const c = await campaign();
    await runNewsletterTick(NOW, LIMITS);
    await runNewsletterTick(minutes(89 * 24 * 60), LIMITS);
    expect(await deliveries(c.id)).toHaveLength(2);
    await runNewsletterTick(minutes(90 * 24 * 60 + 1), LIMITS);
    expect(await deliveries(c.id)).toHaveLength(0);
    expect(await reload(c.id)).toMatchObject({ status: 'SENT', recipientCount: 2, sentCount: 2 });
  });
});
