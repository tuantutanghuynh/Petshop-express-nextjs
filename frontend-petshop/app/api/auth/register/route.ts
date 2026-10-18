import { register } from '../../../../lib/bff/session';
import { badRequest, readJson, rejectCrossOrigin, requestContext, sessionJar, toResponse } from '../../../../lib/server/bff';

export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const body = await readJson(request);
  if (body === null) return badRequest();
  return toResponse(await register(await sessionJar(), body, await requestContext()));
}
