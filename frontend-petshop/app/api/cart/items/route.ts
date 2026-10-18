import { proxy } from '../../../../lib/bff/session';
import { badRequest, readJson, rejectCrossOrigin, requestContext, sessionJar, toResponse } from '../../../../lib/server/bff';

// Add a variant to the cart. Only the two known fields are relayed; the backend validates them.
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const body = (await readJson(request)) as { variantId?: unknown; quantity?: unknown } | null;
  if (body === null || typeof body !== 'object') return badRequest();
  return toResponse(
    await proxy(
      await sessionJar(),
      { path: '/cart/items', method: 'POST', body: { variantId: body.variantId, quantity: body.quantity } },
      await requestContext(),
    ),
  );
}
