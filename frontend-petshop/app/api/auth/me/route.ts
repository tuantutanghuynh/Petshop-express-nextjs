import { proxy } from '../../../../lib/bff/session';
import { requestContext, sessionJar, toResponse } from '../../../../lib/server/bff';

// The signed-in customer ({ id, email, fullName, role }), or 401 for a visitor.
export async function GET() {
  return toResponse(await proxy(await sessionJar(), { path: '/auth/me', method: 'GET' }, await requestContext()));
}
