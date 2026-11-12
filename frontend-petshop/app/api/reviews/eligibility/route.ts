import { optionalSession, proxy } from '../../../../lib/bff/session';
import { isProductId } from '../../../../lib/reviews';
import { badRequest, requestContext, sessionJar, toResponse } from '../../../../lib/server/bff';

// May the visitor review this product, and their review if any. A visitor without a session is a
// normal case on a product page: answered 200 with data null, not a 401 the browser logs.
export async function GET(request: Request) {
  const productId = new URL(request.url).searchParams.get('productId') ?? '';
  if (!isProductId(productId)) return badRequest();
  return toResponse(optionalSession(await proxy(await sessionJar(), { path: `/reviews/eligibility?productId=${productId}`, method: 'GET' }, await requestContext())));
}
