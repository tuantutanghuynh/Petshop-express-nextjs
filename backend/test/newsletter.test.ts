import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app';
import { bearer, freshIp, tokenFor } from './helpers';

// Newsletter (spec 2026-11-07), the parts that never reach the database: input rules and who may
// use the admin endpoints. Each request uses its own IP so the 5-per-IP limiter stays out of the way.
const post = (path: string, body: object) => request(app).post(`/api/v1/newsletter${path}`).set('X-Forwarded-For', freshIp()).send(body);

describe('subscribe input', () => {
  it.each([
    ['no consent', { email: 'an@example.com' }],
    ['consent not true', { email: 'an@example.com', consent: 'yes' }],
    ['bad email', { email: 'an@', consent: true }],
    ['email as array', { email: ['an@example.com'], consent: true }],
    ['email too long', { email: `${'a'.repeat(250)}@x.vn`, consent: true }],
  ])('refuses %s with 422', async (_label, body) => {
    const res = await post('/subscribe', body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('token input', () => {
  it.each(['/confirm', '/unsubscribe'])('%s refuses a missing or non-string token with 422', async (path) => {
    expect((await post(path, {})).status).toBe(422);
    expect((await post(path, { token: ['x'] })).status).toBe(422);
  });
});

describe('admin endpoints', () => {
  const admin = [
    ['get', '/api/v1/newsletter/subscribers'],
    ['get', '/api/v1/newsletter/subscribers/export'],
    ['delete', '/api/v1/newsletter/subscribers/abc'],
  ] as const;

  it.each(admin)('%s %s needs a token', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
  });

  it.each(admin)('%s %s is admin only', async (method, url) => {
    expect((await request(app)[method](url).set(bearer(tokenFor('customer')))).status).toBe(403);
  });

  it('refuses an unknown status filter with 422', async () => {
    const res = await request(app).get('/api/v1/newsletter/subscribers?status=ALL').set(bearer(tokenFor('admin')));
    expect(res.status).toBe(422);
  });
});
