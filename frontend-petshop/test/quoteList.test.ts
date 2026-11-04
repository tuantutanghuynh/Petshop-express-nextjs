import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_QUOTE_ITEMS, addToQuote, clearQuote, quotePrefill, readQuote, removeFromQuote, setQuoteQuantity, type QuoteItem } from '../lib/quoteList';

// "Nhờ tư vấn" list (wireframe quote.html): kept in sessionStorage while the visitor browses, sent with
// the quote request. The backend clamps and re-prices everything; the client keeps it tidy.

const item = (variantId: string, over: Partial<QuoteItem> = {}): QuoteItem => ({
  variantId, productName: 'Pate mèo', label: 'Lon 170g', price: 28000, slug: 'pate-meo', quantity: 1, ...over,
});

beforeEach(() => sessionStorage.clear());

describe('quote list', () => {
  it('adds an item, and adds to the quantity when the same variant comes again', () => {
    addToQuote(item('v1'));
    addToQuote(item('v1', { quantity: 2 }));
    addToQuote(item('v2'));
    expect(readQuote().map((i) => [i.variantId, i.quantity])).toEqual([['v1', 3], ['v2', 1]]);
  });

  it('clamps quantities to 1–99', () => {
    addToQuote(item('v1', { quantity: 500 }));
    expect(readQuote()[0].quantity).toBe(99);
    setQuoteQuantity('v1', 0);
    expect(readQuote()[0].quantity).toBe(1);
  });

  it('keeps at most the backend limit of items', () => {
    for (let i = 0; i < MAX_QUOTE_ITEMS + 5; i += 1) addToQuote(item(`v${i}`));
    expect(readQuote()).toHaveLength(MAX_QUOTE_ITEMS);
  });

  it('removes and clears', () => {
    addToQuote(item('v1'));
    addToQuote(item('v2'));
    removeFromQuote('v1');
    expect(readQuote().map((i) => i.variantId)).toEqual(['v2']);
    clearQuote();
    expect(readQuote()).toEqual([]);
  });

  it('survives garbage in storage', () => {
    sessionStorage.setItem('quote-list', '{not json');
    expect(readQuote()).toEqual([]);
    sessionStorage.setItem('quote-list', JSON.stringify([{ variantId: 1 }, item('ok')]));
    expect(readQuote().map((i) => i.variantId)).toEqual(['ok']);
  });
});

describe('quotePrefill', () => {
  const me = { id: 'u1', email: 'an@example.com', fullName: 'Nguyễn An', role: 'customer' };
  const address = { fullName: 'An giao hàng', phone: '0901234567', addressLine: '12 Lê Lợi', city: 'Đà Nẵng' };

  it('fills name and email from the account, phone and address from the last order', () => {
    expect(quotePrefill(me, address)).toEqual({ customerName: 'Nguyễn An', email: 'an@example.com', phone: '0901234567', address: '12 Lê Lợi, Đà Nẵng' });
  });

  it('leaves phone and address empty for a customer without orders', () => {
    expect(quotePrefill(me, null)).toEqual({ customerName: 'Nguyễn An', email: 'an@example.com', phone: '', address: '' });
  });

  it('falls back to the name on the last order when the account has none', () => {
    expect(quotePrefill({ ...me, fullName: null }, address).customerName).toBe('An giao hàng');
    expect(quotePrefill({ ...me, fullName: '  ' }, null).customerName).toBe('');
  });

  it('does not add a comma when the order has no city', () => {
    expect(quotePrefill(me, { ...address, city: '' }).address).toBe('12 Lê Lợi');
  });
});
