import { afterEach, describe, expect, it } from 'vitest';
import { siteUrl } from '../../config/env';
import { NEWSLETTER_CONSENT_TEXT } from '../../constants/newsletter';
import { setMailTransportForTests, type MailMessage } from '../../services/email.service';
import { purgePending } from '../../services/newsletter.service';
import prisma from '../../services/prisma';
import { call } from './helpers/http';
import { createAdmin } from './helpers/factories';

// Newsletter signup end to end (spec 2026-11-07). Emails go out without the answer waiting, so the
// test transport tells each test when one has arrived.

const subscribe = (email: string, ip?: string) => {
  const req = call('post', '/api/v1/newsletter/subscribe', { brand: null });
  return (ip ? req.set('X-Forwarded-For', ip) : req).send({ email, consent: true });
};
const confirmToken = (token: string) => call('post', '/api/v1/newsletter/confirm', { brand: null }).send({ token });
const unsubscribeToken = (token: string) => call('post', '/api/v1/newsletter/unsubscribe', { brand: null }).send({ token });
const row = (email: string) => prisma.newsletterSubscriber.findUnique({ where: { email } });
const settle = () => new Promise((r) => setTimeout(r, 100));
const tokenIn = (m: MailMessage) => new URL(/https?:\/\/\S+/.exec(m.text)?.[0] ?? '').searchParams.get('token') ?? '';

function captureMail() {
  const sent: MailMessage[] = [];
  const waiters: (() => void)[] = [];
  setMailTransportForTests({
    sendMail: async (m) => {
      sent.push(m);
      waiters.splice(0).forEach((w) => w());
    },
  });
  const nth = (n: number) =>
    new Promise<MailMessage>((resolve) => {
      const check = () => (sent.length >= n ? resolve(sent[n - 1]) : waiters.push(check));
      check();
    });
  return { sent, nth };
}

afterEach(() => setMailTransportForTests(null));

describe('double opt-in', () => {
  it('subscribe → confirm → unsubscribe', async () => {
    const mail = captureMail();
    expect((await subscribe('An@Example.com ')).status).toBe(200);
    const confirmMail = await mail.nth(1);
    expect(confirmMail.to).toBe('an@example.com');
    expect(confirmMail.text).toContain(`${siteUrl}/xac-nhan-dang-ky?token=`);
    const pending = await row('an@example.com');
    expect(pending?.status).toBe('PENDING');
    expect(pending?.consentText).toBe(NEWSLETTER_CONSENT_TEXT);

    expect((await confirmToken(tokenIn(confirmMail))).status).toBe(200);
    const welcome = await mail.nth(2);
    expect(welcome.text).toContain(`${siteUrl}/huy-dang-ky?token=`);
    expect((await row('an@example.com'))?.status).toBe('CONFIRMED');

    expect((await unsubscribeToken(tokenIn(welcome))).status).toBe(200);
    expect((await unsubscribeToken(tokenIn(welcome))).status).toBe(200);
    expect((await row('an@example.com'))?.status).toBe('UNSUBSCRIBED');
  });

  it('answers the same for a new, a pending and a confirmed address', async () => {
    const mail = captureMail();
    const first = await subscribe('b@example.com');
    await confirmToken(tokenIn(await mail.nth(1)));
    await mail.nth(2);
    const confirmed = await subscribe('b@example.com');
    const fresh = await subscribe('c@example.com');
    await mail.nth(3);
    const pending = await subscribe('c@example.com');
    await settle();
    expect([confirmed.body, fresh.body, pending.body]).toEqual([first.body, first.body, first.body]);
    expect(mail.sent).toHaveLength(3); // nothing for the confirmed one, nothing for the quick repeat
  });

  it('resends after 10 minutes with a new link; the old one stops working', async () => {
    const mail = captureMail();
    await subscribe('d@example.com');
    const old = await mail.nth(1);
    await prisma.newsletterSubscriber.update({ where: { email: 'd@example.com' }, data: { confirmSentAt: new Date(Date.now() - 11 * 60 * 1000) } });
    await subscribe('d@example.com');
    const fresh = await mail.nth(2);
    expect((await confirmToken(tokenIn(old))).body.error.code).toBe('INVALID_TOKEN');
    expect((await confirmToken(tokenIn(fresh))).status).toBe(200);
  });

  it('refuses an expired link, a used one and an unknown unsubscribe token', async () => {
    const mail = captureMail();
    await subscribe('e@example.com');
    const expired = await mail.nth(1);
    await prisma.newsletterSubscriber.update({ where: { email: 'e@example.com' }, data: { confirmExpiresAt: new Date(Date.now() - 1000) } });
    expect((await confirmToken(tokenIn(expired))).body.error.code).toBe('INVALID_TOKEN');

    await subscribe('f@example.com');
    const ok = await mail.nth(2);
    expect((await confirmToken(tokenIn(ok))).status).toBe(200);
    expect((await confirmToken(tokenIn(ok))).body.error.code).toBe('INVALID_TOKEN');
    expect((await unsubscribeToken('not-a-real-token')).body.error.code).toBe('INVALID_TOKEN');
  });

  it('lets someone who unsubscribed subscribe again', async () => {
    const mail = captureMail();
    await subscribe('g@example.com');
    await confirmToken(tokenIn(await mail.nth(1)));
    await unsubscribeToken(tokenIn(await mail.nth(2)));
    await subscribe('g@example.com');
    expect((await confirmToken(tokenIn(await mail.nth(3)))).status).toBe(200);
    expect((await row('g@example.com'))?.status).toBe('CONFIRMED');
  });

  it('creates one row and sends one email for two signups at the same moment', async () => {
    const mail = captureMail();
    const answers = await Promise.all([subscribe('h@example.com'), subscribe('h@example.com')]);
    await settle();
    expect(answers.map((r) => r.status)).toEqual([200, 200]);
    expect(await prisma.newsletterSubscriber.count({ where: { email: 'h@example.com' } })).toBe(1);
    expect(mail.sent).toHaveLength(1);
  });

  it('limits signups to 5 per 15 minutes per visitor IP', async () => {
    captureMail();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await subscribe(`r${i}@example.com`, '203.0.113.90')).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});

describe('purge', () => {
  it('deletes unconfirmed signups older than 7 days and nothing else', async () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const base = { consentText: NEWSLETTER_CONSENT_TEXT };
    await prisma.newsletterSubscriber.createMany({
      data: [
        { ...base, email: 'old-pending@example.com', status: 'PENDING', consentAt: old },
        { ...base, email: 'new-pending@example.com', status: 'PENDING', consentAt: new Date() },
        { ...base, email: 'old-confirmed@example.com', status: 'CONFIRMED', consentAt: old },
      ],
    });
    expect(await purgePending()).toBe(1);
    const left = await prisma.newsletterSubscriber.findMany({ select: { email: true }, orderBy: { email: 'asc' } });
    expect(left.map((r) => r.email)).toEqual(['new-pending@example.com', 'old-confirmed@example.com']);
  });
});

describe('admin', () => {
  async function seed() {
    const base = { consentText: NEWSLETTER_CONSENT_TEXT, consentAt: new Date() };
    await prisma.newsletterSubscriber.createMany({
      data: [
        { ...base, email: 'p1@example.com', status: 'PENDING' },
        { ...base, email: 'c1@example.com', status: 'CONFIRMED', confirmedAt: new Date() },
        { ...base, email: '=cmd@example.com', status: 'CONFIRMED', confirmedAt: new Date() },
        { ...base, email: 'u1@example.com', status: 'UNSUBSCRIBED' },
      ],
    });
    return (await createAdmin()).token;
  }
  const emails = (body: { data: { email: string }[] }) => body.data.map((r) => r.email).sort();

  it('lists with a status filter, search and pagination, without token hashes', async () => {
    const token = await seed();
    const confirmed = await call('get', '/api/v1/newsletter/subscribers?status=CONFIRMED', { token, brand: null });
    expect(emails(confirmed.body)).toEqual(['=cmd@example.com', 'c1@example.com']);
    expect(confirmed.body.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
    expect(JSON.stringify(confirmed.body)).not.toMatch(/TokenHash/);
    const search = await call('get', '/api/v1/newsletter/subscribers?q=P1', { token, brand: null });
    expect(emails(search.body)).toEqual(['p1@example.com']);
    const paged = await call('get', '/api/v1/newsletter/subscribers?pageSize=1&page=2', { token, brand: null });
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.total).toBe(4);
  });

  it('exports only confirmed people, formula-safe', async () => {
    const token = await seed();
    const res = await call('get', '/api/v1/newsletter/subscribers/export', { token, brand: null });
    expect(res.body.data.filename).toMatch(/^newsletter-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = (res.body.data.csv as string).replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('"email","confirmedAt","consentAt"');
    expect(lines.slice(1).map((l) => l.split(',')[0]).sort()).toEqual(['"\'=cmd@example.com"', '"c1@example.com"']);
  });

  it('deletes one subscriber, 404 for an unknown id', async () => {
    const token = await seed();
    const target = await row('u1@example.com');
    expect((await call('delete', `/api/v1/newsletter/subscribers/${target?.id}`, { token, brand: null })).status).toBe(200);
    expect(await row('u1@example.com')).toBeNull();
    expect((await call('delete', `/api/v1/newsletter/subscribers/${target?.id}`, { token, brand: null })).status).toBe(404);
  });
});
