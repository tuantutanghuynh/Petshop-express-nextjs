import request from 'supertest';
import app from '../../../app';
import { BRAND } from './factories';

// HTTP helpers around supertest.
//
// Every request gets its OWN client IP through X-Forwarded-For. The app trusts one proxy hop
// (`app.set('trust proxy', 1)`), so express-rate-limit keys on that header. Without this the
// global limiter (100 requests / 15 min / IP) would start answering 429 halfway through a
// file and every later assertion would fail for a reason unrelated to the code under test.
// Rate limiting itself is covered separately in test/ratelimit.test.ts.

let ipCounter = 0;
export function nextIp(): string {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

type Options = { token?: string; brand?: string | null };

// `brand: null` deliberately omits X-Brand-Slug, to test the "missing brand" path.
export function call(method: Method, url: string, opts: Options = {}) {
  let req = request(app)[method](url).set('X-Forwarded-For', nextIp());
  if (opts.brand !== null) req = req.set('X-Brand-Slug', opts.brand ?? BRAND);
  if (opts.token) req = req.set('Authorization', `Bearer ${opts.token}`);
  return req;
}

// Regex for anything that would reveal internals to a client: Prisma error names, stack
// frames, file paths. A 4xx/5xx body matching this is an information leak.
export const LEAK = /prisma|stack|node_modules|at \w+ \(|\.ts:\d+/i;
