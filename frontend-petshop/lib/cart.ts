// Pure cart helpers (test/cart.test.ts). The backend is the source of truth for prices, stock and
// warnings; these only turn its answers into what the cart UI shows.

export const MAX_LINE_QUANTITY = 99; // backend cap per cart line (routes/cart.route.ts)

export function cartCount(cart: { items: { quantity: number }[] } | null): number {
  return cart ? cart.items.reduce((sum, i) => sum + i.quantity, 0) : 0;
}

export function lineIssue(line: { warnings: string[]; available: number; quantity: number }): string | null {
  if (line.warnings.includes('UNAVAILABLE')) return 'Sản phẩm này không còn bán — vui lòng xoá khỏi giỏ.';
  if (line.warnings.includes('OUT_OF_STOCK')) return 'Sản phẩm đã hết hàng — vui lòng xoá khỏi giỏ.';
  if (line.warnings.includes('INSUFFICIENT_STOCK')) return `Chỉ còn ${line.available} sản phẩm — giảm số lượng để đặt hàng.`;
  return null;
}

export function maxQuantity(available: number): number {
  return Math.max(1, Math.min(MAX_LINE_QUANTITY, available));
}

// Cart line ids are UUIDs; anything else is refused before it is put into a backend URL.
export function isCartItemId(id: string): boolean {
  return /^[A-Za-z0-9-]{1,64}$/.test(id);
}

export function variantLabel(variant: { sku: string; variantAttributes: Record<string, unknown> }): string {
  const label = variant.variantAttributes.label;
  return typeof label === 'string' && label.trim() ? label : variant.sku;
}
