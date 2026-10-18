import { logout } from '../../../../lib/bff/session';
import { rejectCrossOrigin, requestContext, sessionJar, toResponse } from '../../../../lib/server/bff';

export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  return toResponse(await logout(await sessionJar(), await requestContext()));
}
