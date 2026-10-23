// Rules of /admin/lien-he (spec 2026-10-22, test/adminContacts.test.ts).
export const CONTACT_TABS = [
  { key: 'unread', label: 'Chưa đọc', isRead: 'false' },
  { key: 'read', label: 'Đã đọc', isRead: 'true' },
  { key: 'all', label: 'Tất cả', isRead: null },
] as const;
export type ContactTab = (typeof CONTACT_TABS)[number]['key'];
export type ContactsQuery = { tab: ContactTab; page: number };
export const CONTACTS_PAGE_SIZE = 20;
const BASE = '/admin/lien-he';

export function parseContactsQuery(sp: URLSearchParams): ContactsQuery {
  const page = Number(sp.get('page'));
  return { tab: CONTACT_TABS.find((t) => t.key === sp.get('tab'))?.key ?? 'unread', page: Number.isInteger(page) && page > 1 ? page : 1 };
}

export function contactsHref(s: Partial<ContactsQuery>): string {
  const p = new URLSearchParams();
  if (s.tab && s.tab !== 'unread') p.set('tab', s.tab);
  if (s.page && s.page > 1) p.set('page', String(s.page));
  const qs = p.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

export function contactsApiPath(s: ContactsQuery): string {
  const p = new URLSearchParams({ page: String(s.page), pageSize: String(CONTACTS_PAGE_SIZE) });
  const isRead = CONTACT_TABS.find((t) => t.key === s.tab)?.isRead;
  if (isRead) p.set('isRead', isRead);
  return `/contact/admin/list?${p}`;
}

// The owner replies from their own mail app (the site sends no email).
export function mailtoHref(email: string, subject: string | null): string {
  return `mailto:${email}?subject=${encodeURIComponent(`Re: ${subject?.trim() || 'Liên hệ từ website'}`)}`;
}
