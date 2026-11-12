import { proxy } from '../../../../lib/bff/session';
import { requestContext, sessionJar, toResponse } from '../../../../lib/server/bff';

// The signed-in customer's reviews, with their status (shown next to the order lines).
export async function GET() {
  return toResponse(await proxy(await sessionJar(), { path: '/reviews/mine', method: 'GET' }, await requestContext()));
}
