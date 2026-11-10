import { afterEach, describe, expect, it } from 'vitest';
import { newsletterConfirmEmail, newsletterWelcomeEmail, passwordResetEmail, sendNewsletterConfirm, sendPasswordReset, setMailTransportForTests, type MailMessage } from '../services/email.service';

// Password reset email (spec 2026-11-04): what the customer receives, and that it goes to the
// right person through whatever transport is configured. A test transport replaces SMTP here.
afterEach(() => setMailTransportForTests(null));

const LINK = 'https://shop.example/dat-lai-mat-khau?token=abc123&email=an%40example.com';

describe('shop name in the HTML part', () => {
  // "Woofle & Meowcaron" carries an ampersand: in HTML it must be written &amp;.
  it.each([
    ['password reset', () => passwordResetEmail(LINK)],
    ['newsletter confirm', () => newsletterConfirmEmail(LINK)],
    ['newsletter welcome', () => newsletterWelcomeEmail(LINK)],
  ])('is escaped in the %s email', (_name, build) => {
    const { html } = build();
    expect(html).toContain('Woofle &amp; Meowcaron');
    expect(html).not.toContain('Woofle & Meowcaron');
  });
});

describe('passwordResetEmail', () => {
  it('carries the link, how long it lasts and who sent it', () => {
    const mail = passwordResetEmail(LINK);
    expect(mail.subject).toMatch(/đặt lại mật khẩu/i);
    expect(mail.text).toContain(LINK);
    expect(mail.text).toContain('60 phút');
    expect(mail.text).toContain('Woofle & Meowcaron');
  });

  it('escapes the link inside the HTML version', () => {
    const { html } = passwordResetEmail(LINK);
    expect(html).toContain('href="https://shop.example/dat-lai-mat-khau?token=abc123&amp;email=an%40example.com"');
    expect(html).not.toContain('token=abc123&email');
  });
});

describe('sendPasswordReset', () => {
  it('hands the email to the transport for the right recipient', async () => {
    const sent: MailMessage[] = [];
    setMailTransportForTests({ sendMail: async (m) => { sent.push(m); } });
    await sendPasswordReset('an@example.com', LINK);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'an@example.com', subject: passwordResetEmail(LINK).subject });
    expect(sent[0].text).toContain(LINK);
  });
});

const CONFIRM = 'https://shop.example/xac-nhan-dang-ky?token=abc&x=1';
const UNSUB = 'https://shop.example/huy-dang-ky?token=def&x=1';

describe('newsletter emails', () => {
  it('confirmation carries the link, its lifetime and the shop name', () => {
    const mail = newsletterConfirmEmail(CONFIRM);
    expect(mail.subject).toMatch(/xác nhận/i);
    expect(mail.text).toContain(CONFIRM);
    expect(mail.text).toContain('48 giờ');
    expect(mail.text).toContain('Woofle & Meowcaron');
    expect(mail.html).toContain('href="https://shop.example/xac-nhan-dang-ky?token=abc&amp;x=1"');
  });

  it('welcome carries the unsubscribe link', () => {
    const mail = newsletterWelcomeEmail(UNSUB);
    expect(mail.text).toContain(UNSUB);
    expect(mail.html).toContain('href="https://shop.example/huy-dang-ky?token=def&amp;x=1"');
  });

  it('sends the confirmation to the subscriber', async () => {
    const sent: MailMessage[] = [];
    setMailTransportForTests({ sendMail: async (m) => { sent.push(m); } });
    await sendNewsletterConfirm('an@example.com', CONFIRM);
    expect(sent.map((m) => m.to)).toEqual(['an@example.com']);
  });
});
