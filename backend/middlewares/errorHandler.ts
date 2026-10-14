import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import ApiError from '../utils/ApiError';

// Known failures that are the CLIENT's doing, translated into the 4xx they really are. Without
// this they all fell through to the generic 500 below, so a customer double-clicking "register"
// or a script posting a field as an array saw "server error" for something that is not one.
//   - body-parser: malformed JSON (400) and a body over the size limit (413);
//   - Prisma P2002: a unique index rejected a duplicate that slipped past a check-then-insert
//     (two requests checked "slug free" at the same moment) — that is a conflict, 409;
//   - PrismaClientValidationError: a value of the wrong type reached a query (an array where a
//     string belongs, an Invalid Date) — the same 422 VALIDATION_ERROR the validate middleware uses.
// Everything else stays a 500, because then it really is our bug.
function toClientError(err: unknown): ApiError | null {
  const bodyError = err as { type?: string };
  if (bodyError?.type === 'entity.parse.failed') {
    return new ApiError(400, 'MALFORMED_JSON', 'Dữ liệu gửi lên không phải JSON hợp lệ');
  }
  if (bodyError?.type === 'entity.too.large') {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Dữ liệu gửi lên quá lớn');
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return new ApiError(409, 'DUPLICATE', 'Dữ liệu này đã tồn tại');
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return new ApiError(422, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ');
  }
  return null;
}

// The last middleware in the chain and the only place that formats error responses. Every
// failure in the app — thrown by a controller, forwarded by asyncHandler, or raised by
// Express itself — ends up here and leaves as the standard `{ data, meta, error }` envelope.

// Turns any error into an HTTP response. Errors that are instances of ApiError were raised
// deliberately, so their status, code and message are trusted and sent to the client as-is.
// Anything else is an unexpected bug (a Prisma failure, a typo, a bad payload) — it gets
// logged to the server and answered with a generic 500, because raw error text and stack
// traces can leak table names, file paths and query structure to an attacker. Express only
// treats a middleware as an error handler if it declares exactly four parameters, so `next`
// must stay in the signature even though it is never called.
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  const known = err instanceof ApiError ? err : toClientError(err);
  if (known) {
    return res.status(known.status).json({
      data: null,
      meta: null,
      error: { code: known.code, message: known.message, details: known.details },
    });
  }

  console.error(err);
  return res.status(500).json({
    data: null,
    meta: null,
    error: { code: 'INTERNAL_ERROR', message: 'Đã có lỗi xảy ra', details: null },
  });
}

export default errorHandler;
