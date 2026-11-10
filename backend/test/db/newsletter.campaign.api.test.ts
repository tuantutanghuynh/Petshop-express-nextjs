import { afterEach, describe, expect, it } from 'vitest';
import { NEWSLETTER_CONSENT_TEXT } from '../../constants/newsletter';
import { setMailTransportForTests, type MailMessage } from '../../services/email.service';
import { runNewsletterTick } from '../../services/newsletterSend.service';
import prisma from '../../services/prisma';
import { LEAK, call } from './helpers/http';
import { createAdmin, createBrand, createProduct, createUser } from './helpers/factories';

// Admin campaign API and unsubscribing from a campaign (spec 2026-11-10).

const BASE = '/api/v1/newsletter/campaigns';
const body = (extra: Record<string, unknown> = {}) => ({ subject: 'Mẹo tháng 11', preheader: 'Lịch tẩy giun', content: '## Chào\n\nNội dung.', ...extra });
const api = (token: string) => ({
  create: (b: Record<string, unknown> = body()) => call('post', BASE, { token, brand: null }).send(b),
  list: (q = '') => call('get', `${BASE}${q}`, { token, brand: null }),
  get: (id: string) => call('get', `${BASE}/${id}`, { token, brand: null }),
  patch: (id: string, b: Record<string, unknown>) => call('patch', `${BASE}/${id}`, { token, brand: null }).send(b),
  remove: (id: string) => call('delete', `${BASE}/${id}`, { token, brand: null }),
  schedule: (id: string, b: Record<string, unknown> = {}) => call('post', `${BASE}/${id}/schedule`, { token, brand: null }).send(b),
  cancel: (id: string) => call('post', `${BASE}/${id}/cancel`, { token, brand: null }).send({}),
  test: (id: string) => call('post', `${BASE}/${id}/test`, { token, brand: null }).send({}),
});
const setStatus = (id: string, status: 'SENDING' | 'SENT' | 'CANCELLED') => prisma.newsletterCampaign.update({ where: { id }, data: { status } });
const inMinutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

function captureMail(fail = false) {
  const sent: MailMessage[] = [];
  setMailTransportForTests({
    sendMail: async (m) => {
      if (fail) throw Object.assign(new Error('535 auth failed'), { responseCode: 535 });
      sent.push(m);
    },
  });
  return sent;
}
afterEach(() => setMailTransportForTests(null));

describe('create, read, list', () => {
  it('creates a draft and reads it back with its featured items resolved', async () => {
    const admin = await createAdmin();
    const post = await prisma.blogPost.create({ data: { title: 'Tẩy giun', slug: 'tay-giun', content: 'x', authorId: admin.id, status: 'published', publishedAt: new Date() } });
    const { child } = await createBrand();
    const product = await createProduct(child.id, { name: 'Pate mèo 85g' });
    const res = await api(admin.token).create(body({ isAdvertising: false, featured: [{ type: 'product', id: product.id }, { type: 'post', id: post.id }] }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ subject: 'Mẹo tháng 11', status: 'DRAFT', isAdvertising: false, scheduledAt: null });
    const got = await api(admin.token).get(res.body.data.id);
    expect(got.status).toBe(200);
    expect(got.body.data.content).toBe('## Chào\n\nNội dung.');
    expect(got.body.data.featuredItems).toEqual([
      { type: 'product', id: product.id, title: 'Pate mèo 85g', available: true },
      { type: 'post', id: post.id, title: 'Tẩy giun', available: true },
    ]);
  });

  it('defaults to an advertising email ([QC] label)', async () => {
    const admin = await createAdmin();
    expect((await api(admin.token).create()).body.data.isAdvertising).toBe(true);
  });

  it('lists newest first, filters by status and paginates', async () => {
    const admin = await createAdmin();
    const a = (await api(admin.token).create(body({ subject: 'A' }))).body.data;
    const b = (await api(admin.token).create(body({ subject: 'B' }))).body.data;
    await setStatus(a.id, 'SENT');
    const all = await api(admin.token).list();
    expect(all.body.data.map((c: { subject: string }) => c.subject)).toEqual(['B', 'A']);
    expect(all.body.meta).toMatchObject({ page: 1, total: 2 });
    expect(all.body.data[0]).not.toHaveProperty('content'); // the list is light
    const sent = await api(admin.token).list('?status=SENT');
    expect(sent.body.data.map((c: { id: string }) => c.id)).toEqual([a.id]);
    const page2 = await api(admin.token).list('?pageSize=1&page=2');
    expect(page2.body.data.map((c: { id: string }) => c.id)).toEqual([a.id]);
    expect(b.id).toBeTruthy();
    expect((await api(admin.token).list('?status=WHATEVER')).status).toBe(422);
  });

  it.each([
    ['an empty subject', { subject: '  ' }, 'subject'],
    ['a subject over 150 characters', { subject: 'x'.repeat(151) }, 'subject'],
    ['a preheader over 150 characters', { preheader: 'x'.repeat(151) }, 'preheader'],
    ['empty content', { content: '' }, 'content'],
    ['content over 20 000 characters', { content: 'x'.repeat(20_001) }, 'content'],
    ['a non-boolean advertising flag', { isAdvertising: 'yes' }, 'isAdvertising'],
    ['more than 6 featured items', { featured: Array.from({ length: 7 }, (_, i) => ({ type: 'post', id: `p${i}` })) }, 'featured'],
    ['a featured item of an unknown type', { featured: [{ type: 'video', id: 'x' }] }, 'featured[0].type'],
    ['the same featured item twice', { featured: [{ type: 'post', id: 'x' }, { type: 'post', id: 'x' }] }, 'featured'],
    ['a featured item that does not exist', { featured: [{ type: 'post', id: 'missing' }] }, 'featured'],
  ])('refuses %s with 422 on that field', async (_name, extra, field) => {
    const admin = await createAdmin();
    const res = await api(admin.token).create(body(extra));
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(field);
    expect(JSON.stringify(res.body)).not.toMatch(LEAK);
  });

  it('is 401 without a token, 403 for a customer, 404 for an unknown id', async () => {
    const admin = await createAdmin();
    const customer = await createUser();
    const { id } = (await api(admin.token).create()).body.data;
    expect((await call('get', `${BASE}/${id}`, { brand: null })).status).toBe(401);
    expect((await api(customer.token).get(id)).status).toBe(403);
    expect((await api(customer.token).create()).status).toBe(403);
    expect((await api(admin.token).get('00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });
});

describe('edit and delete', () => {
  it('edits a draft and a scheduled campaign, keeping the send time', async () => {
    const admin = await createAdmin();
    const { id } = (await api(admin.token).create()).body.data;
    expect((await api(admin.token).patch(id, { subject: 'Mới' })).body.data.subject).toBe('Mới');
    const at = inMinutes(60);
    await api(admin.token).schedule(id, { scheduledAt: at });
    const res = await api(admin.token).patch(id, { content: 'Nội dung mới' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'SCHEDULED', scheduledAt: at, content: 'Nội dung mới' });
  });

  it.each(['SENDING', 'SENT', 'CANCELLED'] as const)('refuses to edit a %s campaign (409 CAMPAIGN_LOCKED)', async (status) => {
    const admin = await createAdmin();
    const { id } = (await api(admin.token).create()).body.data;
    await setStatus(id, status);
    const res = await api(admin.token).patch(id, { subject: 'Đổi' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CAMPAIGN_LOCKED');
    expect((await prisma.newsletterCampaign.findUniqueOrThrow({ where: { id } })).subject).toBe('Mẹo tháng 11');
  });

  it('deletes a draft only', async () => {
    const admin = await createAdmin();
    const draft = (await api(admin.token).create()).body.data;
    const scheduled = (await api(admin.token).create()).body.data;
    await api(admin.token).schedule(scheduled.id, { scheduledAt: inMinutes(60) });
    expect((await api(admin.token).remove(draft.id)).status).toBe(200);
    expect(await prisma.newsletterCampaign.findUnique({ where: { id: draft.id } })).toBeNull();
    const locked = await api(admin.token).remove(scheduled.id);
    expect(locked.status).toBe(409);
    expect((await api(admin.token).remove('00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });
});

describe('schedule and cancel', () => {
  it('schedules for a chosen time, reschedules, and "now" when no time is given', async () => {
    const admin = await createAdmin();
    const { id } = (await api(admin.token).create()).body.data;
    const at = inMinutes(30);
    expect((await api(admin.token).schedule(id, { scheduledAt: at })).body.data).toMatchObject({ status: 'SCHEDULED', scheduledAt: at });
    const later = inMinutes(120);
    expect((await api(admin.token).schedule(id, { scheduledAt: later })).body.data.scheduledAt).toBe(later);
    const before = Date.now();
    const now = await api(admin.token).schedule(id, {});
    expect(now.body.data.status).toBe('SCHEDULED');
    expect(new Date(now.body.data.scheduledAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(now.body.data.scheduledAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it.each([
    ['in the past', inMinutes(-10)],
    ['more than 90 days ahead', inMinutes(91 * 24 * 60)],
    ['not a date', '2026-02-30T10:00:00Z'],
  ])('refuses a send time %s (422)', async (_name, scheduledAt) => {
    const admin = await createAdmin();
    const { id } = (await api(admin.token).create()).body.data;
    const res = await api(admin.token).schedule(id, { scheduledAt });
    expect(res.status).toBe(422);
    expect((await prisma.newsletterCampaign.findUniqueOrThrow({ where: { id } })).status).toBe('DRAFT');
  });

  it('refuses to schedule a campaign that already started', async () => {
    const admin = await createAdmin();
    const { id } = (await api(admin.token).create()).body.data;
    await setStatus(id, 'SENT');
    expect((await api(admin.token).schedule(id, {})).body.error.code).toBe('CAMPAIGN_LOCKED');
  });

  it('cancelling a scheduled campaign takes it back to draft', async () => {
    const admin = await createAdmin();
    const { id } = (await api(admin.token).create()).body.data;
    await api(admin.token).schedule(id, { scheduledAt: inMinutes(30) });
    const res = await api(admin.token).cancel(id);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'DRAFT', scheduledAt: null });
  });

  it('cancelling a campaign that is sending stops it', async () => {
    const admin = await createAdmin();
    const { id } = (await api(admin.token).create()).body.data;
    await setStatus(id, 'SENDING');
    const res = await api(admin.token).cancel(id);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.finishedAt).not.toBeNull();
  });

  it.each(['DRAFT', 'SENT', 'CANCELLED'] as const)('cannot cancel a %s campaign (409)', async (status) => {
    const admin = await createAdmin();
    const { id } = (await api(admin.token).create()).body.data;
    if (status !== 'DRAFT') await setStatus(id, status);
    const res = await api(admin.token).cancel(id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CAMPAIGN_LOCKED');
  });
});

describe('test send', () => {
  it('sends the campaign to the signed-in admin only, labelled as a test', async () => {
    const admin = await createAdmin();
    const sent = captureMail();
    const { id } = (await api(admin.token).create()).body.data;
    const res = await api(admin.token).test(id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ to: admin.email });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: admin.email, subject: '[Thử] [QC] Mẹo tháng 11' });
    expect(await prisma.newsletterDelivery.count()).toBe(0);
    expect((await prisma.newsletterCampaign.findUniqueOrThrow({ where: { id } })).status).toBe('DRAFT');
  });

  it('reports an SMTP failure without details (500 MAIL_FAILED)', async () => {
    const admin = await createAdmin();
    captureMail(true);
    const { id } = (await api(admin.token).create()).body.data;
    const res = await api(admin.token).test(id);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('MAIL_FAILED');
    expect(JSON.stringify(res.body)).not.toContain('535');
  });
});

describe('unsubscribing from a campaign', () => {
  async function sentCampaign() {
    const sub = await prisma.newsletterSubscriber.create({ data: { email: 'an@example.com', status: 'CONFIRMED', consentText: NEWSLETTER_CONSENT_TEXT, consentAt: new Date(Date.now() - 3_600_000), confirmedAt: new Date(Date.now() - 3_600_000) } });
    const c = await prisma.newsletterCampaign.create({ data: { subject: 'S', content: 'x', status: 'SCHEDULED', scheduledAt: new Date(Date.now() - 60_000) } });
    const sent = captureMail();
    await runNewsletterTick(new Date(), { dailyLimit: 10, batchSize: 10 });
    const token = /huy-dang-ky\?token=([a-f0-9]{64})/.exec(sent[0].text)?.[1] ?? '';
    return { sub, campaignId: c.id, token };
  }
  const unsubscribe = (token: string) => call('post', '/api/v1/newsletter/unsubscribe', { brand: null }).send({ token });
  const counts = async (campaignId: string) => (await prisma.newsletterCampaign.findUniqueOrThrow({ where: { id: campaignId } })).unsubscribeCount;

  it('unsubscribes with the link of the campaign email and counts it once', async () => {
    const { sub, campaignId, token } = await sentCampaign();
    expect((await unsubscribe(token)).status).toBe(200);
    expect((await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('UNSUBSCRIBED');
    expect(await counts(campaignId)).toBe(1);
    expect((await unsubscribe(token)).status).toBe(200);
    expect(await counts(campaignId)).toBe(1);
  });

  it('an old campaign link does not undo a later re-subscription', async () => {
    const { sub, campaignId, token } = await sentCampaign();
    await unsubscribe(token);
    await prisma.newsletterSubscriber.update({ where: { id: sub.id }, data: { status: 'CONFIRMED', confirmedAt: new Date(Date.now() + 1000) } });
    expect((await unsubscribe(token)).status).toBe(200);
    expect((await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('CONFIRMED');
    expect(await counts(campaignId)).toBe(1);
  });

  it('one-click unsubscribe (RFC 8058) works with the form post a mail provider sends', async () => {
    const { sub, campaignId, token } = await sentCampaign();
    const res = await call('post', `/api/v1/newsletter/one-click?token=${token}`, { brand: null }).type('form').send('List-Unsubscribe=One-Click');
    expect(res.status).toBe(200);
    expect((await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('UNSUBSCRIBED');
    expect(await counts(campaignId)).toBe(1);
  });

  it('one-click refuses a missing or unknown token', async () => {
    expect((await call('post', '/api/v1/newsletter/one-click', { brand: null }).type('form').send('List-Unsubscribe=One-Click')).status).toBe(422);
    expect((await call('post', `/api/v1/newsletter/one-click?token=${'a'.repeat(64)}`, { brand: null }).type('form').send('List-Unsubscribe=One-Click')).status).toBe(400);
  });
});
