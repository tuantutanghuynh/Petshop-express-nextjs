import { relayPublic } from '../../../lib/bff/session';
import { badRequest, readJson, rejectCrossOrigin, requestContext, sessionJar, toResponse } from '../../../lib/server/bff';

// Contact message from a visitor. Backend: required name, email, message; honeypot website_url;
// 5 messages / 15 min per visitor IP.
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const b = (await readJson(request)) as Record<string, unknown> | null;
  if (b === null || typeof b !== 'object') return badRequest();
  const body = { name: b.name, email: b.email, phone: b.phone, subject: b.subject, message: b.message, website_url: b.website_url };
  return toResponse(await relayPublic(await sessionJar(), { path: '/contact', method: 'POST', body }, await requestContext()));
}
