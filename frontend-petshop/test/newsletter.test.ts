import { describe, expect, it } from 'vitest';
import { newsletterApiPath, newsletterHref, parseNewsletterQuery, subscribeBody, tokenBody, validateNewsletter } from '../lib/newsletter';

// Newsletter signup (spec 2026-11-07): the footer form's check, what the BFF relays, and the URL
// state of /admin/dang-ky-nhan-tin.
describe('validateNewsletter', () => {
  it('needs a plausible email', () => {
    expect(validateNewsletter({ email: '' })).toEqual({ email: 'Nhập email' });
    expect(validateNewsletter({ email: 'an@' })).toEqual({ email: 'Email không hợp lệ' });
    expect(validateNewsletter({ email: ' an@example.com ' })).toEqual({});
  });
});

describe('BFF bodies', () => {
  it('relays only the email and always sends consent: the form shows the sentence', () => {
    expect(subscribeBody({ email: 'an@example.com', role: 'admin' })).toEqual({ email: 'an@example.com', consent: true });
  });

  it('relays only the token', () => {
    expect(tokenBody({ token: 'abc', email: 'x' })).toEqual({ token: 'abc' });
  });
});

describe('admin URL state', () => {
  it('defaults to confirmed, page 1, no search', () => {
    expect(parseNewsletterQuery(new URLSearchParams())).toEqual({ tab: 'confirmed', q: '', page: 1 });
    expect(newsletterHref({ tab: 'confirmed', page: 1 })).toBe('/admin/dang-ky-nhan-tin');
  });

  it('round-trips tab, search and page', () => {
    const q = parseNewsletterQuery(new URLSearchParams('tab=pending&q=gmail&page=3'));
    expect(q).toEqual({ tab: 'pending', q: 'gmail', page: 3 });
    expect(newsletterHref(q)).toBe('/admin/dang-ky-nhan-tin?tab=pending&q=gmail&page=3');
    expect(newsletterApiPath(q)).toBe('/newsletter/subscribers?page=3&pageSize=20&status=PENDING&q=gmail');
  });

  it('drops a one-letter search (the backend wants 2+) and unknown tabs', () => {
    const q = parseNewsletterQuery(new URLSearchParams('tab=x&q=a'));
    expect(newsletterApiPath(q)).toBe('/newsletter/subscribers?page=1&pageSize=20&status=CONFIRMED');
    expect(newsletterApiPath({ tab: 'all', q: '', page: 1 })).toBe('/newsletter/subscribers?page=1&pageSize=20');
  });
});
