import { afterEach, describe, expect, it } from 'vitest';
import { passwordResetEmail, sendPasswordReset, setMailTransportForTests, type MailMessage } from '../services/email.service';

// Password reset email (spec 2026-11-04): what the customer receives, and that it goes to the
// right person through whatever transport is configured. A test transport replaces SMTP here.
afterEach(() => setMailTransportForTests(null));

const LINK = 'https://shop.example/dat-lai-mat-khau?token=abc123&email=an%40example.com';

describe('passwordResetEmail', () => {
  it('carries the link, how long it lasts and who sent it', () => {
    const mail = passwordResetEmail(LINK);
    expect(mail.subject).toMatch(/đặt lại mật khẩu/i);
    expect(mail.text).toContain(LINK);
    expect(mail.text).toContain('60 phút');
    expect(mail.text).toContain('Siêu thị của chó mèo');
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
