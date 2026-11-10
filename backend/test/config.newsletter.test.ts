import { describe, expect, it } from 'vitest';
import { parseNewsletterMail } from '../config/env';

// Newsletter mail has its own SMTP (Brevo), separate from order / password emails (ADR-025). It is
// optional: without a host the feature refuses to schedule in production and prints to the console
// in development. Limits default to Brevo's free plan and are clamped to sane ranges.
describe('parseNewsletterMail', () => {
  it('is unconfigured with no host, with free-plan defaults', () => {
    expect(parseNewsletterMail({})).toEqual({
      host: undefined, port: 587, user: undefined, pass: undefined, from: undefined,
      replyTo: undefined, dailyLimit: 300, batchSize: 20, publicApiUrl: undefined,
    });
  });

  it('reads every setting', () => {
    expect(
      parseNewsletterMail({
        NEWSLETTER_SMTP_HOST: 'smtp-relay.brevo.com', NEWSLETTER_SMTP_PORT: '2525', NEWSLETTER_SMTP_USER: 'u@x.test',
        NEWSLETTER_SMTP_PASS: 'p', NEWSLETTER_MAIL_FROM: 'Woofle & Meowcaron <news@x.test>', NEWSLETTER_REPLY_TO: 'shop@x.test',
        NEWSLETTER_DAILY_LIMIT: '1000', NEWSLETTER_BATCH_SIZE: '50', PUBLIC_API_URL: 'https://api.x.test/',
      }),
    ).toEqual({
      host: 'smtp-relay.brevo.com', port: 2525, user: 'u@x.test', pass: 'p', from: 'Woofle & Meowcaron <news@x.test>',
      replyTo: 'shop@x.test', dailyLimit: 1000, batchSize: 50, publicApiUrl: 'https://api.x.test',
    });
  });

  it.each([
    [{ NEWSLETTER_DAILY_LIMIT: '0' }, 300, 20],
    [{ NEWSLETTER_DAILY_LIMIT: 'abc', NEWSLETTER_BATCH_SIZE: '-5' }, 300, 20],
    [{ NEWSLETTER_DAILY_LIMIT: '999999', NEWSLETTER_BATCH_SIZE: '1000' }, 100000, 200],
    [{ NEWSLETTER_DAILY_LIMIT: '12.7', NEWSLETTER_BATCH_SIZE: '3' }, 12, 3],
  ])('clamps limits %j', (env, daily, batch) => {
    const cfg = parseNewsletterMail(env);
    expect(cfg.dailyLimit).toBe(daily);
    expect(cfg.batchSize).toBe(batch);
  });
});
