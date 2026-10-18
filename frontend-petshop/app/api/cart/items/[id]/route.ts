import { isCartItemId } from '../../../../../lib/cart';
import { proxy } from '../../../../../lib/bff/session';
import { badRequest, readJson, rejectCrossOrigin, requestContext, sessionJar, toResponse } from '../../../../../lib/server/bff';

type Context = { params: Promise<{ id: string }> };

// The id goes into the backend URL, so anything but a plain id is refused here.
async function itemPath(context: Context): Promise<string | null> {
  const { id } = await context.params;
  return isCartItemId(id) ? `/cart/items/${id}` : null;
}

export async function PATCH(request: Request, context: Context) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const path = await itemPath(context);
  const body = (await readJson(request)) as { quantity?: unknown } | null;
  if (!path || body === null || typeof body !== 'object') return badRequest();
  return toResponse(await proxy(await sessionJar(), { path, method: 'PATCH', body: { quantity: body.quantity } }, await requestContext()));
}

export async function DELETE(request: Request, context: Context) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const path = await itemPath(context);
  if (!path) return badRequest();
  return toResponse(await proxy(await sessionJar(), { path, method: 'DELETE' }, await requestContext()));
}
