import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ADMIN_API_RATE_LIMIT, API_RATE_LIMIT } from '../constants/rateLimit';
import { apiRateLimitFor } from '../middlewares/rateLimitKeys';

// How many requests the global API limiter allows per window (ADR-019): a verified admin token
// gets ADMIN_API_RATE_LIMIT, so the owner can enter products in bulk; everyone else — customers,
// visitors, and any token that does not verify — keeps API_RATE_LIMIT.

const SECRET = process.env.JWT_ACCESS_SECRET as string;
const sign = (role: string, secret = SECRET, expiresIn: jwt.SignOptions['expiresIn'] = '15m') =>
  jwt.sign({ sub: `u-${role}`, role }, secret, { expiresIn });
const req = (token?: string) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} }) as unknown as Request;

describe('apiRateLimitFor — allowance per caller', () => {
  it('gives a verified admin token the admin allowance', () => {
    expect(apiRateLimitFor(req(sign('admin')))).toBe(ADMIN_API_RATE_LIMIT);
  });

  it.each([
    ['a customer token', () => req(sign('customer'))],
    ['an admin token signed with another secret', () => req(sign('admin', 'not-the-secret'))],
    ['an expired admin token', () => req(sign('admin', SECRET, '-1s'))],
    ['no token', () => req()],
  ])('gives %s the normal allowance', (_label, make) => {
    expect(apiRateLimitFor(make())).toBe(API_RATE_LIMIT);
  });
});

// Fresh copy of the app (and of its in-memory limiter) per scenario; unknown routes cost nothing,
// the limiter counts them and the 404 handler answers.
async function freshApp() {
  vi.resetModules();
  const { default: app } = await import('../app');
  return app;
}

async function burst(n: number, ip: string, token: string) {
  const app = await freshApp();
  const statuses: number[] = [];
  for (let i = 0; i < n; i += 1) {
    statuses.push((await request(app).get('/api/v1/unknown').set({ 'X-Forwarded-For': ip, Authorization: `Bearer ${token}` })).status);
  }
  return statuses;
}

describe('global API limiter — allowance in practice', () => {
  it('stops a customer at the normal allowance', async () => {
    expect((await burst(API_RATE_LIMIT + 1, '203.0.113.31', sign('customer')))[API_RATE_LIMIT]).toBe(429);
  });

  it('lets an admin go past the normal allowance', async () => {
    expect((await burst(API_RATE_LIMIT + 1, '203.0.113.32', sign('admin')))[API_RATE_LIMIT]).toBe(404);
  });

  it('does not give the admin allowance to a forged admin token', async () => {
    expect((await burst(API_RATE_LIMIT + 1, '203.0.113.33', sign('admin', 'not-the-secret')))[API_RATE_LIMIT]).toBe(429);
  });
});
