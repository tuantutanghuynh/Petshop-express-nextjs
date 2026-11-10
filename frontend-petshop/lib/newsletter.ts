import { emailError, type FieldErrors } from './forms';

// Newsletter signup (spec 2026-11-07, test/newsletter.test.ts).

// Shown under the footer form. The backend keeps its own copy as proof of consent
// (backend/constants/newsletter.ts NEWSLETTER_CONSENT_TEXT): change both together.
export const NEWSLETTER_CONSENT_TEXT =
  'Bằng việc đăng ký, bạn đồng ý nhận email mẹo chăm sóc và ưu đãi từ Woofle & Meowcaron. Huỷ bất cứ lúc nào.';

export function validateNewsletter(v: { email: string }): FieldErrors {
  const email = emailError(v.email);
  return email ? { email } : {};
}

// What the BFF relays: nothing beyond the fields the backend reads. Consent is the act of
// submitting the form that shows the sentence, so the relay states it.
export const subscribeBody = (b: Record<string, unknown>) => ({ email: b.email, consent: true as const });
export const tokenBody = (b: Record<string, unknown>) => ({ token: b.token });

// /admin/dang-ky-nhan-tin URL state.
export const NEWSLETTER_TABS = [
  { key: 'confirmed', label: 'Đã xác nhận', status: 'CONFIRMED' },
  { key: 'pending', label: 'Chờ xác nhận', status: 'PENDING' },
  { key: 'unsubscribed', label: 'Đã huỷ', status: 'UNSUBSCRIBED' },
  { key: 'all', label: 'Tất cả', status: null },
] as const;
export type NewsletterTab = (typeof NEWSLETTER_TABS)[number]['key'];
export type NewsletterQuery = { tab: NewsletterTab; q: string; page: number };
export const NEWSLETTER_PAGE_SIZE = 20;
const BASE = '/admin/dang-ky-nhan-tin';

export function parseNewsletterQuery(sp: URLSearchParams): NewsletterQuery {
  const page = Number(sp.get('page'));
  return {
    tab: NEWSLETTER_TABS.find((t) => t.key === sp.get('tab'))?.key ?? 'confirmed',
    q: (sp.get('q') ?? '').trim().slice(0, 100),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function newsletterHref(s: Partial<NewsletterQuery>): string {
  const p = new URLSearchParams();
  if (s.tab && s.tab !== 'confirmed') p.set('tab', s.tab);
  if (s.q) p.set('q', s.q);
  if (s.page && s.page > 1) p.set('page', String(s.page));
  const qs = p.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

export function newsletterApiPath(s: NewsletterQuery): string {
  const p = new URLSearchParams({ page: String(s.page), pageSize: String(NEWSLETTER_PAGE_SIZE) });
  const status = NEWSLETTER_TABS.find((t) => t.key === s.tab)?.status;
  if (status) p.set('status', status);
  if (s.q.length >= 2) p.set('q', s.q);
  return `/newsletter/subscribers?${p}`;
}
