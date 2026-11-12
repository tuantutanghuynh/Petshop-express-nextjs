import { proxy } from '../../../lib/bff/session';
import { badRequest, readJson, rejectCrossOrigin, requestContext, sessionJar, toResponse } from '../../../lib/server/bff';

// Write a review of a product the customer bought (ADR-027). Only the known fields are relayed; the
// backend checks the purchase and every value.
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const body = (await readJson(request)) as { productId?: unknown; rating?: unknown; content?: unknown; images?: unknown } | null;
  if (body === null || typeof body !== 'object') return badRequest();
  const payload = { productId: body.productId, rating: body.rating, content: body.content, images: body.images };
  return toResponse(await proxy(await sessionJar(), { path: '/reviews', method: 'POST', body: payload }, await requestContext()));
}
