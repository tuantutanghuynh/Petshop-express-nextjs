import { proxy } from '../../../lib/bff/session';
import { requestContext, sessionJar, toResponse } from '../../../lib/server/bff';

export async function GET() {
  return toResponse(await proxy(await sessionJar(), { path: '/cart', method: 'GET' }, await requestContext()));
}
