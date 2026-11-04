import { relayPublic } from '../../../../lib/bff/session';
import { badRequest, readJson, rejectCrossOrigin, requestContext, sessionJar, toResponse } from '../../../../lib/server/bff';

// Sets a new password with the token from the emailed link. Only the three fields are relayed; the
// backend checks the token (single use, 60 minutes), signs every session out and rate limits per IP.
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const b = (await readJson(request)) as Record<string, unknown> | null;
  if (b === null || typeof b !== 'object') return badRequest();
  const body = { email: b.email, token: b.token, newPassword: b.newPassword };
  return toResponse(await relayPublic(await sessionJar(), { path: '/auth/reset-password', method: 'POST', body }, await requestContext()));
}
