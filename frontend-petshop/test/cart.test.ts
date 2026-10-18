import { describe, expect, it } from 'vitest';
import { cartCount, isCartItemId, lineIssue, maxQuantity, variantLabel } from '../lib/cart';

describe('cartCount', () => {
  it('counts units, not lines (the badge shows how many things are in the cart)', () => {
    expect(cartCount(null)).toBe(0);
    expect(cartCount({ items: [{ quantity: 2 }, { quantity: 3 }] })).toBe(5);
  });
});

describe('lineIssue', () => {
  it('explains each backend warning in words the customer can act on', () => {
    expect(lineIssue({ warnings: [], available: 5, quantity: 1 })).toBeNull();
    expect(lineIssue({ warnings: ['UNAVAILABLE'], available: 5, quantity: 1 })).toMatch(/không còn bán/);
    expect(lineIssue({ warnings: ['OUT_OF_STOCK'], available: 0, quantity: 1 })).toMatch(/hết hàng/);
    expect(lineIssue({ warnings: ['INSUFFICIENT_STOCK'], available: 2, quantity: 5 })).toBe('Chỉ còn 2 sản phẩm — giảm số lượng để đặt hàng.');
  });
});

describe('maxQuantity', () => {
  it('caps at the backend line limit of 99 and at what is in stock, never below 1', () => {
    expect(maxQuantity(500)).toBe(99);
    expect(maxQuantity(3)).toBe(3);
    expect(maxQuantity(0)).toBe(1);
  });
});

describe('isCartItemId', () => {
  it('accepts ids the backend issues and nothing that could change the backend path', () => {
    expect(isCartItemId('0b5f8e5e-1c1d-4a2b-9c3d-123456789abc')).toBe(true);
    for (const bad of ['', '../orders', 'a/b', 'a?x=1', 'x'.repeat(65)]) expect(isCartItemId(bad)).toBe(false);
  });
});

describe('variantLabel', () => {
  it('uses the label attribute, else the SKU', () => {
    expect(variantLabel({ sku: 'S1', variantAttributes: { label: 'Gói 85g' } })).toBe('Gói 85g');
    expect(variantLabel({ sku: 'S1', variantAttributes: {} })).toBe('S1');
  });
});
