// Newsletter signup (spec 2026-11-07). The consent sentence is stored with each signup as proof of
// what the visitor agreed to; the footer shows the same words (frontend-petshop/lib/newsletter.ts).
// Change both together, and only for new signups: stored rows keep the sentence they agreed to.
export const NEWSLETTER_CONSENT_TEXT =
  'Bằng việc đăng ký, bạn đồng ý nhận email mẹo chăm sóc và ưu đãi từ Siêu thị của chó mèo. Huỷ bất cứ lúc nào.';

// One answer for every address, so the form cannot be used to learn who is subscribed.
export const SUBSCRIBE_MESSAGE = 'Kiểm tra hộp thư để xác nhận đăng ký.';

export const CONFIRM_LINK_VALID_HOURS = 48;
export const RESEND_AFTER_MINUTES = 10; // a second signup inside this window sends nothing
export const PENDING_KEPT_DAYS = 7; // unconfirmed addresses are deleted after this

export const ADMIN_PAGE_SIZE = 20;
export const ADMIN_MAX_PAGE_SIZE = 100;
