import { relayPublic } from '../../../lib/bff/session';
import { badRequest, readJson, rejectCrossOrigin, requestContext, sessionJar, toResponse } from '../../../lib/server/bff';

// Quote request from a visitor (no account needed). Only the known fields are relayed; the backend
// validates them, re-prices the items and rate limits per visitor IP (10 / 15 min).
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const b = (await readJson(request)) as Record<string, unknown> | null;
  if (b === null || typeof b !== 'object') return badRequest();
  const items = Array.isArray(b.items)
    ? b.items.slice(0, 50).map((i) => ({ variantId: (i as { variantId?: unknown }).variantId, quantity: (i as { quantity?: unknown }).quantity }))
    : [];
  const body = { customerName: b.customerName, phone: b.phone, address: b.address, email: b.email, note: b.note, website_url: b.website_url, items };
  return toResponse(await relayPublic(await sessionJar(), { path: '/quote-requests', method: 'POST', body }, await requestContext()));
}
