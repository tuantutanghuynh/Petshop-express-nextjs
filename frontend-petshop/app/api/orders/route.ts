import { proxy } from '../../../lib/bff/session';
import { parsePageParam } from '../../../lib/pagination';
import { badRequest, readJson, rejectCrossOrigin, requestContext, sessionJar, toResponse } from '../../../lib/server/bff';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,100}$/; // same rule as the backend header validator

// The customer's own orders, newest first (the backend filters by the signed-in user).
export async function GET(request: Request) {
  const page = parsePageParam(new URL(request.url).searchParams.get('page') ?? undefined);
  if (page === null) return badRequest();
  return toResponse(await proxy(await sessionJar(), { path: `/orders?page=${page}&pageSize=10`, method: 'GET' }, await requestContext()));
}

// Place an order from the current cart. Prices and stock are decided by the backend; only the
// delivery details and the payment method are relayed.
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const body = (await readJson(request)) as { paymentMethod?: unknown; shippingAddress?: unknown; note?: unknown } | null;
  const key = request.headers.get('Idempotency-Key') ?? undefined;
  if (body === null || typeof body !== 'object' || (key !== undefined && !IDEMPOTENCY_KEY.test(key))) return badRequest();

  const address = (typeof body.shippingAddress === 'object' && body.shippingAddress !== null ? body.shippingAddress : {}) as Record<string, unknown>;
  const payload = {
    paymentMethod: body.paymentMethod,
    shippingAddress: { fullName: address.fullName, phone: address.phone, addressLine: address.addressLine, city: address.city },
    note: body.note,
  };
  return toResponse(
    await proxy(await sessionJar(), { path: '/orders', method: 'POST', body: payload, idempotencyKey: key }, await requestContext()),
  );
}
