import crypto from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import pinoHttp from 'pino-http';
import { logger } from '../utils/logger';

// One log line per request, mounted first in app.ts so requests answered early (a 429 from the
// rate limiter, a CORS refusal) are logged too. Each request gets an id, returned as X-Request-Id
// and carried by every line logged through req.log, so a customer's error can be found in the log.

// An id sent by our Next.js server (BFF) is kept so both sides log the same id. Only a plain token
// is accepted: anything else (a line break, a huge value) is replaced, so a client cannot forge or
// break log lines through this header.
const REQUEST_ID = /^[A-Za-z0-9_-]{8,100}$/;

function requestId(req: IncomingMessage, res: ServerResponse): string {
  const sent = req.headers['x-request-id'];
  const id = typeof sent === 'string' && REQUEST_ID.test(sent) ? sent : crypto.randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

// Health probes run every few seconds; logging them would bury real traffic.
const isHealthProbe = (req: IncomingMessage) => req.url === '/health' || (req.url ?? '').startsWith('/health/');

type LoggedReq = { id: string; method: string; url: string };

export const requestLogger = pinoHttp({
  logger,
  genReqId: requestId,
  quietReqLogger: true,
  autoLogging: { ignore: isHealthProbe },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  // The signed-in user (set by authenticate) when the route had one.
  customProps: (req) => {
    const user = (req as IncomingMessage & { user?: { id?: string } }).user;
    return user?.id ? { userId: user.id } : {};
  },
  serializers: {
    // Path only: query strings carry search terms such as a customer's phone number. Headers and
    // body are never logged.
    req: (req: LoggedReq) => ({ id: req.id, method: req.method, path: req.url.split('?')[0] }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
});

export default requestLogger;
