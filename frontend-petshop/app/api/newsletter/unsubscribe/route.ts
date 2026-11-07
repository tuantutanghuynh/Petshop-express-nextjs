import { relayPublic } from '../../../../lib/bff/session';
import { tokenBody } from '../../../../lib/newsletter';
import { badRequest, readJson, rejectCrossOrigin, requestContext, sessionJar, toResponse } from '../../../../lib/server/bff';

// Opened from the emailed link (/huy-dang-ky); only the token is relayed.
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const b = await readJson(request);
  if (b === null || typeof b !== 'object') return badRequest();
  const body = tokenBody(b as Record<string, unknown>);
  return toResponse(await relayPublic(await sessionJar(), { path: '/newsletter/unsubscribe', method: 'POST', body }, await requestContext()));
}
