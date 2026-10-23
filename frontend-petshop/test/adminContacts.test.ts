import { describe, expect, it } from 'vitest';
import { contactsApiPath, contactsHref, mailtoHref, parseContactsQuery } from '../lib/adminContacts';

// /admin/lien-he (spec 2026-10-22): unread first by default, and a reply link that opens the
// owner's mail app with the subject filled in.
describe('contacts URL state', () => {
  it('defaults to unread and maps tabs to isRead', () => {
    expect(parseContactsQuery(new URLSearchParams(''))).toEqual({ tab: 'unread', page: 1 });
    expect(contactsHref({ tab: 'unread', page: 1 })).toBe('/admin/lien-he');
    expect(contactsHref({ tab: 'read', page: 2 })).toBe('/admin/lien-he?tab=read&page=2');
    expect(contactsApiPath({ tab: 'unread', page: 1 })).toBe('/contact/admin/list?page=1&pageSize=20&isRead=false');
    expect(contactsApiPath({ tab: 'all', page: 1 })).toBe('/contact/admin/list?page=1&pageSize=20');
  });
});

describe('mailtoHref', () => {
  it('replies with "Re:" and encodes everything', () => {
    expect(mailtoHref('ha@example.com', 'Hỏi về pate')).toBe('mailto:ha@example.com?subject=Re%3A%20H%E1%BB%8Fi%20v%E1%BB%81%20pate');
    expect(mailtoHref('ha@example.com', null)).toBe('mailto:ha@example.com?subject=Re%3A%20Li%C3%AAn%20h%E1%BB%87%20t%E1%BB%AB%20website');
  });
});
