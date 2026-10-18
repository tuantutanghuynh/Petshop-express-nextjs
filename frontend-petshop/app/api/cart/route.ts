import { optionalSession, proxy } from '../../../lib/bff/session';
import { requestContext, sessionJar, toResponse } from '../../../lib/server/bff';

// data: null for a visitor without a session (see optionalSession) — loaded on every page.
export async function GET() {
  return toResponse(optionalSession(await proxy(await sessionJar(), { path: '/cart', method: 'GET' }, await requestContext())));
}
