import { relayPublic } from '../../../../lib/bff/session';
import { badRequest, readJson, rejectCrossOrigin, requestContext, sessionJar, toResponse } from '../../../../lib/server/bff';

// "Quên mật khẩu": asks the backend to email a reset link. Only the email is relayed; the backend
// answers the same for every address and rate limits per visitor IP (10 / 15 min).
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const b = (await readJson(request)) as Record<string, unknown> | null;
  if (b === null || typeof b !== 'object') return badRequest();
  const body = { email: b.email };
  return toResponse(await relayPublic(await sessionJar(), { path: '/auth/request-password-reset', method: 'POST', body }, await requestContext()));
}
