import { relayPublic } from '../../../../lib/bff/session';
import { subscribeBody } from '../../../../lib/newsletter';
import { badRequest, readJson, rejectCrossOrigin, requestContext, sessionJar, toResponse } from '../../../../lib/server/bff';

// Footer newsletter form. The backend answers the same for every address and limits signups per
// visitor IP (5 / 15 min), which reaches it through relayPublic's X-Client-IP.
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const b = await readJson(request);
  if (b === null || typeof b !== 'object') return badRequest();
  const body = subscribeBody(b as Record<string, unknown>);
  return toResponse(await relayPublic(await sessionJar(), { path: '/newsletter/subscribe', method: 'POST', body }, await requestContext()));
}
