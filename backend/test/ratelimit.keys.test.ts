import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { bearer, tokenFor, unsignedToken } from './helpers';
import jwt from 'jsonwebtoken';

// How the global API limiter (100 requests / 15 min) decides WHO a request belongs to.
//
// Counting only by IP breaks two real situations:
//   - the Next.js server renders every page for every visitor from ONE IP, so a few dozen page
//     views would lock the whole storefront out with 429;
//   - phone users on 4G sit behind carrier NAT and share an IP with thousands of strangers.
// Spec for this suite:
//   1. a verified access token → the bucket is that user, not the IP;
//   2. no token, or a token that does not verify → the bucket is the IP (a forged or random token
//      must NOT buy a fresh bucket, or anyone could bypass the limit);
//   3. a request carrying X-Internal-Secret equal to INTERNAL_API_SECRET (server-to-server, sent
//      only by the Next.js server) is not limited at all; a wrong secret is an ordinary request;
//   4. with INTERNAL_API_SECRET unset, the header is ignored — an empty secret must never match.
// Unknown routes are used because they cost nothing: the limiter counts them, then 404 answers.

const SECRET = 'internal_test_secret_value_0123456789';
const URL = '/api/v1/unknown';

// Fresh copy of the app (and therefore of the in-memory limiter) for each scenario.
async function freshApp(env: Record<string, string | undefined> = { INTERNAL_API_SECRET: SECRET }) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, ''); else vi.stubEnv(k, v);
  }
  const { default: app } = await import('../app');
  return app;
}

function userToken(sub: string) {
  return jwt.sign({ sub, role: 'customer' }, process.env.JWT_ACCESS_SECRET as string, { expiresIn: '15m' });
}

async function burst(app: Awaited<ReturnType<typeof freshApp>>, n: number, headers: Record<string, string>) {
  const statuses: number[] = [];
  for (let i = 0; i < n; i += 1) statuses.push((await request(app).get(URL).set(headers)).status);
  return statuses;
}

describe('global API limiter — whose bucket a request falls into', () => {
  it('logged-in users behind the same IP each get their own 100 requests', async () => {
    const app = await freshApp();
    const ip = { 'X-Forwarded-For': '203.0.113.10' };

    const alice = await burst(app, 101, { ...ip, ...bearer(userToken('alice')) });
    expect(alice[99]).toBe(404);
    expect(alice[100]).toBe(429); // Alice is limited …

    const bob = await burst(app, 5, { ...ip, ...bearer(userToken('bob')) });
    expect(bob.every((s) => s === 404)).toBe(true); // … Bob on the same IP is not
  });

  it('one user cannot escape the limit by changing IP', async () => {
    const app = await freshApp();
    const statuses: number[] = [];
    for (let i = 0; i < 101; i += 1) {
      statuses.push((await request(app).get(URL).set({ 'X-Forwarded-For': `198.51.100.${i % 250}`, ...bearer(userToken('carol')) })).status);
    }
    expect(statuses[100]).toBe(429);
  });

  it('anonymous requests are still limited per IP', async () => {
    const app = await freshApp();
    const statuses = await burst(app, 101, { 'X-Forwarded-For': '203.0.113.20' });
    expect(statuses.slice(0, 100).every((s) => s === 404)).toBe(true);
    expect(statuses[100]).toBe(429);
  });

  it.each([
    ['an unsigned (alg: none) token', () => unsignedToken('customer')],
    ['a token signed with the wrong secret', () => jwt.sign({ sub: 'x', role: 'customer' }, 'not-the-secret')],
    ['an expired token', () => tokenFor('customer', { expiresIn: -10 })],
    ['garbage', () => 'abc.def.ghi'],
  ])('%s does not buy a fresh bucket — it is counted against the IP', async (_name, make) => {
    const app = await freshApp();
    const statuses: number[] = [];
    for (let i = 0; i < 101; i += 1) {
      // a different bad token on every request, all from one IP
      const token = `${make()}${i}`;
      statuses.push((await request(app).get(URL).set({ 'X-Forwarded-For': '203.0.113.30', Authorization: `Bearer ${token}` })).status);
    }
    expect(statuses[100]).toBe(429);
  });

  it('the Next.js server (correct X-Internal-Secret) is never rate limited', async () => {
    const app = await freshApp();
    const statuses = await burst(app, 150, { 'X-Forwarded-For': '10.0.0.5', 'X-Internal-Secret': SECRET });
    expect(statuses.every((s) => s === 404)).toBe(true);
  });

  it('a wrong X-Internal-Secret is treated as an ordinary anonymous request', async () => {
    const app = await freshApp();
    const statuses = await burst(app, 101, { 'X-Forwarded-For': '10.0.0.6', 'X-Internal-Secret': 'guess' });
    expect(statuses[100]).toBe(429);
  });

  it('with INTERNAL_API_SECRET unset, even an empty header value does not bypass the limit', async () => {
    const app = await freshApp({ INTERNAL_API_SECRET: undefined });
    const statuses = await burst(app, 101, { 'X-Forwarded-For': '10.0.0.7', 'X-Internal-Secret': '' });
    expect(statuses[100]).toBe(429);
  });
});
