import nodemailer from 'nodemailer';
import { isDevelopment, isProduction, smtp } from '../config/env';

// Outgoing email (spec 2026-11-04 password reset). Content is built by pure functions; sending goes
// through one transport: SMTP when SMTP_HOST is set; otherwise development prints the email to the
// console (the only way to try the flow locally) and any other environment drops it with a warning
// that carries no content — a reset link is password-equivalent and must not reach shared logs.
// Production never gets here without SMTP: it refuses to start (assertProductionConfig).

const SHOP_NAME = 'Siêu thị của chó mèo';
const RESET_LINK_VALID_MINUTES = 60; // matches the token lifetime in auth.controller.ts
const DEV_SENDER = `${SHOP_NAME} <no-reply@localhost>`;

export type MailMessage = { from: string; to: string; subject: string; text: string; html: string };
export type MailTransport = { sendMail: (message: MailMessage) => Promise<unknown> };

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function passwordResetEmail(link: string): { subject: string; text: string; html: string } {
  const subject = `Đặt lại mật khẩu — ${SHOP_NAME}`;
  const text = [
    'Xin chào,',
    '',
    'Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản này. Mở link sau để đặt mật khẩu mới:',
    link,
    '',
    `Link có hiệu lực trong ${RESET_LINK_VALID_MINUTES} phút và chỉ dùng được một lần.`,
    'Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn không thay đổi.',
    '',
    SHOP_NAME,
  ].join('\n');
  const href = escapeHtml(link);
  const html = `<p>Xin chào,</p>
<p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản này.</p>
<p><a href="${href}">Đặt mật khẩu mới</a></p>
<p>Nếu nút không mở được, chép link này vào trình duyệt:<br>${href}</p>
<p>Link có hiệu lực trong ${RESET_LINK_VALID_MINUTES} phút và chỉ dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn không thay đổi.</p>
<p>${SHOP_NAME}</p>`;
  return { subject, text, html };
}

let testTransport: MailTransport | null = null;
let smtpTransport: MailTransport | null = null;

// Tests swap the transport instead of mocking nodemailer; null restores the configured one.
export function setMailTransportForTests(transport: MailTransport | null): void {
  testTransport = transport;
}

const consoleTransport: MailTransport = {
  sendMail: async (m) => {
    console.info(`[email to ${m.to}] ${m.subject}\n${m.text}`);
  },
};

const droppingTransport: MailTransport = {
  sendMail: async (m) => {
    console.warn(`Email not sent (SMTP is not configured): ${m.subject}`);
  },
};

function transport(): MailTransport {
  if (testTransport) return testTransport;
  if (!smtp.host) {
    if (isProduction) throw new Error('SMTP is not configured');
    return isDevelopment ? consoleTransport : droppingTransport;
  }
  // Created once and reused (it keeps the SMTP settings; port 465 means TLS from the start).
  smtpTransport ??= nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  return smtpTransport;
}

export async function sendPasswordReset(to: string, link: string): Promise<void> {
  await transport().sendMail({ from: smtp.from ?? DEV_SENDER, to, ...passwordResetEmail(link) });
}
