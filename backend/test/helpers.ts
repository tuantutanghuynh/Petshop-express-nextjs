import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET as string;

export function tokenFor(role: 'admin' | 'customer', options: jwt.SignOptions = { expiresIn: '15m' }): string {
  return jwt.sign({ sub: 'user-1', role }, ACCESS_SECRET, options);
}

// Builds an unsigned JWT with `alg: none`, the classic forged-token attack.
export function unsignedToken(role: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 'user-1', role })}.`;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// A different client IP per call (198.18.0.0/15 is reserved for testing). Validation suites send
// dozens of login / register requests; without this they would hit the auth limiter (10 per IP,
// tested on its own in ratelimit.auth.test.ts) and see 429 instead of the 422 they are checking.
let ipSeq = 0;
export function freshIp(): string {
  ipSeq += 1;
  return `198.18.${Math.floor(ipSeq / 250) % 250}.${(ipSeq % 250) + 1}`;
}
