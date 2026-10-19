// The "Nhờ tư vấn" list: products a visitor wants advice / a price for, kept in sessionStorage while
// they browse and sent with the quote request (test/quoteList.test.ts). The backend re-reads names
// and prices and clamps quantities; this only keeps the list tidy. Browser-only.

export type QuoteItem = { variantId: string; productName: string; label: string; price: number; slug: string; quantity: number };

export const MAX_QUOTE_ITEMS = 50; // backend limit per request
const KEY = 'quote-list';
const clamp = (n: number) => Math.min(99, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)));

function isItem(v: unknown): v is QuoteItem {
  const i = v as QuoteItem;
  return typeof i === 'object' && i !== null && typeof i.variantId === 'string' && typeof i.productName === 'string'
    && typeof i.slug === 'string' && typeof i.price === 'number';
}

export function readQuote(): QuoteItem[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isItem).map((i) => ({ ...i, label: i.label ?? '', quantity: clamp(i.quantity) })) : [];
  } catch {
    return []; // unreadable storage (private mode, garbage) = empty list
  }
}

function write(items: QuoteItem[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_QUOTE_ITEMS)));
  } catch {
    // storage unavailable: the list just does not persist between pages
  }
}

export function addToQuote(item: QuoteItem): void {
  const items = readQuote();
  const existing = items.find((i) => i.variantId === item.variantId);
  if (existing) existing.quantity = clamp(existing.quantity + item.quantity);
  else if (items.length < MAX_QUOTE_ITEMS) items.push({ ...item, quantity: clamp(item.quantity) });
  write(items);
}

export function setQuoteQuantity(variantId: string, quantity: number): void {
  write(readQuote().map((i) => (i.variantId === variantId ? { ...i, quantity: clamp(quantity) } : i)));
}

export function removeFromQuote(variantId: string): void {
  write(readQuote().filter((i) => i.variantId !== variantId));
}

export function clearQuote(): void {
  write([]);
}
