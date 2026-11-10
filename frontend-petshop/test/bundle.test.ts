import { describe, expect, it } from 'vitest';
import { bundleSelection, defaultVariantId, type BundleLine } from '../lib/bundle';
import type { ProductVariant } from '../lib/types';

// "Thường mua kèm" block (ADR-026): each line starts on its cheapest variant in stock; the total and
// the button count only ticked lines that can really be bought.

const variant = (id: string, price: number, stock = 5, reserved = 0): ProductVariant => ({
  id, sku: id, price, compareAtPrice: null, stockQuantity: stock, reservedQuantity: reserved, variantAttributes: { label: id }, imageUrl: null,
});
const line = (over: Partial<BundleLine>): BundleLine => ({ key: 'p', name: 'Pate', variants: [variant('a', 10_000)], variantId: 'a', checked: true, ...over });

describe('defaultVariantId', () => {
  it('picks the cheapest variant in stock, whatever the order', () => {
    expect(defaultVariantId([variant('big', 30_000), variant('small', 10_000, 0), variant('mid', 20_000)])).toBe('mid');
  });
  it('counts reservations, and is null when nothing can be sold', () => {
    expect(defaultVariantId([variant('a', 10_000, 2, 2)])).toBeNull();
    expect(defaultVariantId([])).toBeNull();
  });
});

describe('bundleSelection', () => {
  it('adds up the ticked lines at the chosen variant price', () => {
    const lines = [
      line({ key: 'main', variants: [variant('m1', 119_000), variant('m2', 140_000)], variantId: 'm2' }),
      line({ key: 'pate', variants: [variant('p1', 10_000)], variantId: 'p1' }),
      line({ key: 'cat', variants: [variant('c1', 70_000)], variantId: 'c1', checked: false }),
    ];
    expect(bundleSelection(lines)).toEqual({ count: 2, total: 150_000, variantIds: ['m2', 'p1'] });
  });
  it('leaves out a ticked line whose variant is sold out or unknown', () => {
    const lines = [
      line({ key: 'a', variants: [variant('x', 10_000, 0)], variantId: 'x' }),
      line({ key: 'b', variantId: null }),
      line({ key: 'c', variants: [variant('y', 5_000)], variantId: 'gone' }),
    ];
    expect(bundleSelection(lines)).toEqual({ count: 0, total: 0, variantIds: [] });
  });
});
