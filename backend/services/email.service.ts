import nodemailer from 'nodemailer';
import { isDevelopment, isProduction, smtp } from '../config/env';
import { CONFIRM_LINK_VALID_HOURS } from '../constants/newsletter';
import { logger } from '../utils/logger';

// Outgoing email (specs 2026-11-04 password reset, 2026-11-07 newsletter). Content is built by
// pure functions; sending goes through one transport: SMTP when SMTP_HOST is set; otherwise
// development prints the email to the console (the only way to try the flows locally) and any other
// environment drops it with a warning that carries no content — the links act on accounts and
// subscriptions (a reset link is password-equivalent) and must not reach shared logs.
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
    logger.info({ to: m.to }, `${m.subject}\n${m.text}`);
  },
};

const droppingTransport: MailTransport = {
  sendMail: async (m) => {
    logger.warn({ subject: m.subject }, 'Email not sent (SMTP is not configured)');
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

// Newsletter (spec 2026-11-07): the double opt-in link, then a welcome with the unsubscribe link.
export function newsletterConfirmEmail(link: string): { subject: string; text: string; html: string } {
  const subject = `Xác nhận đăng ký nhận tin — ${SHOP_NAME}`;
  const text = [
    'Xin chào,',
    '',
    'Bạn (hoặc ai đó) vừa đăng ký nhận email mẹo chăm sóc và ưu đãi bằng địa chỉ này. Mở link sau để xác nhận:',
    link,
    '',
    `Link có hiệu lực trong ${CONFIRM_LINK_VALID_HOURS} giờ. Nếu bạn không đăng ký, hãy bỏ qua email này — bạn sẽ không nhận thêm thư nào.`,
    '',
    SHOP_NAME,
  ].join('\n');
  const href = escapeHtml(link);
  const html = `<p>Xin chào,</p>
<p>Bạn (hoặc ai đó) vừa đăng ký nhận email mẹo chăm sóc và ưu đãi bằng địa chỉ này.</p>
<p><a href="${href}">Xác nhận đăng ký</a></p>
<p>Nếu nút không mở được, chép link này vào trình duyệt:<br>${href}</p>
<p>Link có hiệu lực trong ${CONFIRM_LINK_VALID_HOURS} giờ. Nếu bạn không đăng ký, hãy bỏ qua email này — bạn sẽ không nhận thêm thư nào.</p>
<p>${SHOP_NAME}</p>`;
  return { subject, text, html };
}

export function newsletterWelcomeEmail(unsubscribeLink: string): { subject: string; text: string; html: string } {
  const subject = `Đăng ký nhận tin thành công — ${SHOP_NAME}`;
  const text = [
    'Cảm ơn bạn đã đăng ký!',
    '',
    'Bạn sẽ nhận mẹo chăm sóc thú cưng và ưu đãi mới từ chúng tôi.',
    'Muốn ngừng nhận thư, mở link sau:',
    unsubscribeLink,
    '',
    SHOP_NAME,
  ].join('\n');
  const href = escapeHtml(unsubscribeLink);
  const html = `<p>Cảm ơn bạn đã đăng ký!</p>
<p>Bạn sẽ nhận mẹo chăm sóc thú cưng và ưu đãi mới từ chúng tôi.</p>
<p>Muốn ngừng nhận thư: <a href="${href}">huỷ đăng ký</a>.</p>
<p>${SHOP_NAME}</p>`;
  return { subject, text, html };
}

export async function sendNewsletterConfirm(to: string, link: string): Promise<void> {
  await transport().sendMail({ from: smtp.from ?? DEV_SENDER, to, ...newsletterConfirmEmail(link) });
}

export async function sendNewsletterWelcome(to: string, unsubscribeLink: string): Promise<void> {
  await transport().sendMail({ from: smtp.from ?? DEV_SENDER, to, ...newsletterWelcomeEmail(unsubscribeLink) });
}
