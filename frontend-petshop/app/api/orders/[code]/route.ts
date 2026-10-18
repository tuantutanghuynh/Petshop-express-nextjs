import { proxy } from '../../../../lib/bff/session';
import { isOrderCode } from '../../../../lib/orders';
import { badRequest, requestContext, sessionJar, toResponse } from '../../../../lib/server/bff';

// One of the customer's own orders (the backend matches code AND user, so a guessed code is 404).
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isOrderCode(code)) return badRequest();
  return toResponse(await proxy(await sessionJar(), { path: `/orders/${code}`, method: 'GET' }, await requestContext()));
}
