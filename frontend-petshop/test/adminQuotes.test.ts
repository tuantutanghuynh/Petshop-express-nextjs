import { describe, expect, it } from 'vitest';
import { parseAmount, parseQuotesQuery, quoteActions, quotesApiPath, quotesHref, webTotal } from '../lib/adminQuotes';

// /admin/bao-gia (spec 2026-10-22): list state in the URL (default tab "Mới" left out), the moves
// each status offers, and the real closing amount the owner types.
describe('quotes URL state', () => {
  it('reads and writes tab + page with "new" as the default', () => {
    expect(parseQuotesQuery(new URLSearchParams(''))).toEqual({ tab: 'new', page: 1 });
    expect(parseQuotesQuery(new URLSearchParams('tab=closed&page=2'))).toEqual({ tab: 'closed', page: 2 });
    expect(parseQuotesQuery(new URLSearchParams('tab=x&page=0'))).toEqual({ tab: 'new', page: 1 });
    expect(quotesHref({ tab: 'new', page: 1 })).toBe('/admin/bao-gia');
    expect(quotesHref({ tab: 'all', page: 3 })).toBe('/admin/bao-gia?tab=all&page=3');
  });
  it('builds the API request', () => {
    expect(quotesApiPath({ tab: 'contacted', page: 2 })).toBe('/quote-requests/admin/list?page=2&pageSize=20&status=CONTACTED');
    expect(quotesApiPath({ tab: 'all', page: 1 })).toBe('/quote-requests/admin/list?page=1&pageSize=20');
  });
});

describe('quoteActions', () => {
  const kinds = (s: string) => quoteActions(s).map((a) => a.kind);
  it('offers the next steps of each status', () => {
    expect(kinds('NEW')).toEqual(['contacted', 'close', 'delete']);
    expect(kinds('CONTACTED')).toEqual(['close', 'reopen-new']);
    expect(kinds('CLOSED')).toEqual(['edit-amount', 'reopen']);
  });
  it('asks before deleting or wiping a closed amount', () => {
    expect(quoteActions('NEW').find((a) => a.kind === 'delete')?.ask).toBe(true);
    expect(quoteActions('CLOSED').find((a) => a.kind === 'reopen')?.ask).toBe(true);
  });
});

describe('parseAmount / webTotal', () => {
  it('accepts whole VND amounts typed with dots or spaces', () => {
    expect(parseAmount('350.000')).toBe(350000);
    expect(parseAmount(' 1 250 000 ')).toBe(1250000);
    expect(parseAmount('0')).toBe(0);
  });
  it('refuses empty, negative, decimal or huge amounts', () => {
    for (const v of ['', 'abc', '-5', '12,5', '2000000001']) expect(parseAmount(v), v).toBeNull();
  });
  it('adds the web prices of the requested items', () => {
    expect(webTotal([{ lineTotal: 54000 }, { lineTotal: 215000 }])).toBe(269000);
  });
});
