import { revalidateTag } from 'next/cache';
import { authorizeRevalidate } from '../../../lib/bff/revalidate';
import { readJson, rejectCrossOrigin, requestContext, toResponse } from '../../../lib/server/bff';

// Called by the admin pages after a save. { expire: 0 }: the next visitor gets fresh data instead
// of one more stale view — the admin is looking at the site and expects to see the change.
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const decision = await authorizeRevalidate(request.headers.get('authorization'), await readJson(request), await requestContext());
  if (!decision.ok) {
    return toResponse({ status: decision.status, body: { data: null, meta: null, error: { code: decision.code, message: 'Không làm mới được', details: null } } });
  }
  for (const tag of decision.tags) revalidateTag(tag, { expire: 0 });
  return toResponse({ status: 200, body: { data: { revalidated: decision.tags }, meta: null, error: null } });
}
