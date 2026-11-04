import { afterEach, describe, expect, it, vi } from 'vitest';
import { siteUrl } from '../../config/env';
import { setMailTransportForTests, type MailMessage } from '../../services/email.service';
import { logger } from '../../utils/logger';
import { call } from './helpers/http';
import { createUser } from './helpers/factories';

// Forgot / reset password by email (spec 2026-11-04). The email goes out without the response
// waiting for it (so answers take the same time whether the address has an account), hence the
// test transport tells the test when a message has arrived.

const requestReset = (email: string) => call('post', '/api/v1/auth/request-password-reset', { brand: null }).send({ email });
const resetPassword = (body: { email: string; token: string; newPassword: string }) =>
  call('post', '/api/v1/auth/reset-password', { brand: null }).send(body);
const login = (email: string, password: string) => call('post', '/api/v1/auth/login', { brand: null }).send({ email, password });
const refresh = (refreshToken: string) => call('post', '/api/v1/auth/refresh', { brand: null }).send({ refreshToken });

function captureMail() {
  const sent: MailMessage[] = [];
  let arrived: () => void = () => undefined;
  setMailTransportForTests({
    sendMail: async (m) => {
      sent.push(m);
      arrived();
    },
  });
  const next = () => new Promise<MailMessage>((resolve) => {
    if (sent.length > 0) resolve(sent[sent.length - 1]);
    else arrived = () => resolve(sent[sent.length - 1]);
  });
  return { sent, next };
}

const tokenIn = (m: MailMessage) => new URL(/https?:\/\/\S+/.exec(m.text)?.[0] ?? '').searchParams.get('token') ?? '';
const settle = () => new Promise((r) => setTimeout(r, 100));

afterEach(() => {
  setMailTransportForTests(null);
  vi.restoreAllMocks();
});

describe('request-password-reset sends the link by email', () => {
  it('emails a working link to the account and the token resets the password', async () => {
    const u = await createUser({ email: 'mai@example.com' });
    const mail = captureMail();
    expect((await requestReset(u.email)).status).toBe(200);
    const m = await mail.next();
    expect(m.to).toBe(u.email);
    expect(m.text).toContain(`${siteUrl}/dat-lai-mat-khau?token=`);
    expect((await resetPassword({ email: u.email, token: tokenIn(m), newPassword: 'NewPass#456' })).status).toBe(200);
    expect((await login(u.email, 'NewPass#456')).status).toBe(200);
  });

  it('sends nothing for an unknown address and answers exactly the same', async () => {
    await createUser({ email: 'known@example.com' });
    const mail = captureMail();
    const known = await requestReset('known@example.com');
    await mail.next();
    const unknown = await requestReset('nobody@example.com');
    await settle();
    expect(mail.sent).toHaveLength(1);
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
  });

  it('still answers 200 when the email cannot be sent, without logging the link', async () => {
    const u = await createUser({ email: 'smtpdown@example.com' });
    const errors = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    let failed: () => void = () => undefined;
    const done = new Promise<void>((r) => { failed = r; });
    setMailTransportForTests({ sendMail: async () => { failed(); throw new Error('SMTP connection refused'); } });
    expect((await requestReset(u.email)).status).toBe(200);
    await done;
    await settle();
    expect(errors).toHaveBeenCalled();
    expect(errors.mock.calls.flat().map(String).join(' ')).not.toMatch(/token=|[0-9a-f]{64}/);
  });
});

describe('reset-password', () => {
  it('signs every other session out', async () => {
    const u = await createUser({ email: 'stolen@example.com' });
    const session = (await login(u.email, u.password)).body.data.refreshToken as string;
    const mail = captureMail();
    await requestReset(u.email);
    const m = await mail.next();
    expect((await resetPassword({ email: u.email, token: tokenIn(m), newPassword: 'NewPass#456' })).status).toBe(200);
    expect((await refresh(session)).status).toBe(401);
  });

  it('limits guessing to 10 tries per 15 minutes per visitor IP', async () => {
    const u = await createUser({ email: 'guess@example.com' });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await resetPassword({ email: u.email, token: `wrong-${i}`, newPassword: 'NewPass#456' }).set('X-Forwarded-For', '203.0.113.77');
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
