// Newsletter signup (spec 2026-11-07). The consent sentence is stored with each signup as proof of
// what the visitor agreed to; the footer shows the same words (frontend-petshop/lib/newsletter.ts).
// Change both together, and only for new signups: stored rows keep the sentence they agreed to.
export const NEWSLETTER_CONSENT_TEXT =
  'Bằng việc đăng ký, bạn đồng ý nhận email mẹo chăm sóc và ưu đãi từ Woofle & Meowcaron. Huỷ bất cứ lúc nào.';

// One answer for every address, so the form cannot be used to learn who is subscribed.
export const SUBSCRIBE_MESSAGE = 'Kiểm tra hộp thư để xác nhận đăng ký.';

export const CONFIRM_LINK_VALID_HOURS = 48;
export const RESEND_AFTER_MINUTES = 10; // a second signup inside this window sends nothing
export const PENDING_KEPT_DAYS = 7; // unconfirmed addresses are deleted after this

export const ADMIN_PAGE_SIZE = 20;
export const ADMIN_MAX_PAGE_SIZE = 100;

// Campaigns (spec 2026-11-10, ADR-025).
export const CAMPAIGN_LIMITS = { subject: 150, preheader: 150, content: 20_000, featured: 6 } as const;
export const CAMPAIGN_PAGE_SIZE = 20;
export const CAMPAIGN_MAX_PAGE_SIZE = 50;
export const SCHEDULE_MAX_DAYS = 90; // a send time further ahead is almost certainly a typo
export const DELIVERY_MAX_ATTEMPTS = 3; // transient SMTP failures are retried up to this
export const DELIVERY_STUCK_MINUTES = 10; // a SENDING claim older than this (crash mid-send) is released
export const DELIVERY_KEPT_DAYS = 90; // recipient rows of a finished campaign are deleted after this
export const SEND_TICK_SECONDS = 60;
// Nghị định 91/2020/NĐ-CP: advertising email is labelled in the subject. The owner confirms the rule.
export const ADVERTISING_PREFIX = '[QC] ';
export const TEST_SEND_PREFIX = '[Thử] ';
