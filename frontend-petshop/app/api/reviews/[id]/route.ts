import { proxy } from '../../../../lib/bff/session';
import { isReviewId } from '../../../../lib/reviews';
import { badRequest, readJson, rejectCrossOrigin, requestContext, sessionJar, toResponse } from '../../../../lib/server/bff';

// Edit the customer's own review (the backend matches the author; it goes back to the queue).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const { id } = await params;
  const body = (await readJson(request)) as { rating?: unknown; content?: unknown; images?: unknown } | null;
  if (!isReviewId(id) || body === null || typeof body !== 'object') return badRequest();
  const payload = { rating: body.rating, content: body.content, images: body.images };
  return toResponse(await proxy(await sessionJar(), { path: `/reviews/${id}`, method: 'PATCH', body: payload }, await requestContext()));
}
