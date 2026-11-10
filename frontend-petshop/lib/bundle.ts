import { variantOffer } from './storefront';
import type { ProductVariant } from './types';

// "Thường mua kèm" block on the product page (ADR-026, test/bundle.test.ts). Prices are each
// item's own price: there is no combo discount, so the total is just their sum.

export type BundleLine = { key: string; name: string; variants: ProductVariant[]; variantId: string | null; checked: boolean };

// The cheapest variant that can be sold now (stock minus reservations), or null when none can.
export function defaultVariantId(variants: ProductVariant[]): string | null {
  const sellable = variants.filter((v) => variantOffer(v).inStock).sort((a, b) => a.price - b.price);
  return sellable[0]?.id ?? null;
}

// What the button would put in the cart: ticked lines whose chosen variant exists and is in stock.
export function bundleSelection(lines: BundleLine[]): { count: number; total: number; variantIds: string[] } {
  const chosen = lines.flatMap((l) => {
    if (!l.checked || !l.variantId) return [];
    const v = l.variants.find((x) => x.id === l.variantId);
    return v && variantOffer(v).inStock ? [v] : [];
  });
  return { count: chosen.length, total: chosen.reduce((sum, v) => sum + v.price, 0), variantIds: chosen.map((v) => v.id) };
}
