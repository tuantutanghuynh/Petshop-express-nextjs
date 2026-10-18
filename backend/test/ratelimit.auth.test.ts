import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

// Login, register and password-reset requests are limited much harder than the rest of the API:
// 10 attempts per 15 minutes per visitor IP. Without it, the only brake on password guessing was
// the global 100-requests limit — and a logged-out attacker has no user bucket to exhaust.
// The bodies below fail validation (422), so the tests need no database: the limiter counts the
// attempt before validation runs, exactly as it must for a real guessing attack.

const SECRET = 'internal_test_secret_value_0123456789';

async function freshApp() {
  vi.resetModules();
  vi.stubEnv('INTERNAL_API_SECRET', SECRET);
  const { default: app } = await import('../app');
  return app;
}

const badLogin = { email: 'not-an-email', password: '' };

describe('auth rate limit', () => {
  it.each(['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/request-password-reset'])(
    '%s allows 10 attempts per IP, then answers 429 in the standard envelope',
    async (path) => {
      const app = await freshApp();
      const statuses: number[] = [];
      for (let i = 0; i < 10; i += 1) statuses.push((await request(app).post(path).set('X-Forwarded-For', '203.0.113.80').send(badLogin)).status);
      expect(statuses.every((s) => s === 422)).toBe(true);

      const blocked = await request(app).post(path).set('X-Forwarded-For', '203.0.113.80').send(badLogin);
      expect(blocked.status).toBe(429);
      expect(blocked.body).toMatchObject({ data: null, error: { code: 'RATE_LIMITED' } });
    },
  );

  it('counts attempts forwarded by the Next.js BFF against the visitor IP, not the server IP', async () => {
    const app = await freshApp();
    const via = (ip: string) => ({ 'X-Forwarded-For': '10.0.0.10', 'X-Internal-Secret': SECRET, 'X-Client-IP': ip });
    for (let i = 0; i < 10; i += 1) await request(app).post('/api/v1/auth/login').set(via('203.0.113.81')).send(badLogin);
    expect((await request(app).post('/api/v1/auth/login').set(via('203.0.113.81')).send(badLogin)).status).toBe(429);
    // a different visitor behind the same Next.js server is not blocked
    expect((await request(app).post('/api/v1/auth/login').set(via('203.0.113.82')).send(badLogin)).status).toBe(422);
  });

  it('the internal secret alone does not exempt login from the limit', async () => {
    const app = await freshApp();
    const headers = { 'X-Forwarded-For': '10.0.0.11', 'X-Internal-Secret': SECRET };
    for (let i = 0; i < 10; i += 1) await request(app).post('/api/v1/auth/login').set(headers).send(badLogin);
    expect((await request(app).post('/api/v1/auth/login').set(headers).send(badLogin)).status).toBe(429);
  });
});
