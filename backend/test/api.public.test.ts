import request from 'supertest';
import fc from 'fast-check';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import app from '../app';
import { bearer, tokenFor, unsignedToken } from './helpers';

// Everything here is stopped by a middleware before any controller or Prisma query runs, so
// it is safe to execute without a database.

const LEAK = /prisma|stack|node_modules|at \w+ \(/i;

const PROTECTED: [string, string][] = [
  ['get', '/api/v1/auth/me'],
  ['get', '/api/v1/orders'],
  ['post', '/api/v1/orders'],
  ['get', '/api/v1/blog/admin/list'],
  ['post', '/api/v1/blog'],
  ['delete', '/api/v1/blog/some-id'],
  ['post', '/api/v1/uploads/image'],
  ['get', '/api/v1/contact/admin/list'],
];

const ADMIN_ONLY: [string, string][] = [
  ['get', '/api/v1/blog/admin/list'],
  ['post', '/api/v1/blog'],
  ['delete', '/api/v1/blog/some-id'],
  ['post', '/api/v1/uploads/image'],
  ['get', '/api/v1/contact/admin/list'],
];

type Method = 'get' | 'post' | 'delete';
const call = (method: string, url: string) => request(app)[method as Method](url);

describe('level 0 - basics', () => {
  it('answers the health probe without credentials', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('sets standard security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('turns an unknown URL into the standard error envelope', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ data: null, meta: null, error: { code: 'NOT_FOUND' } });
    expect(JSON.stringify(res.body)).not.toMatch(LEAK);
  });
});

describe('level 3 - authentication', () => {
  it.each(PROTECTED)('%s %s returns 401 without a token', async (method, url) => {
    const res = await call(method, url);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it.each([
    ['wrong scheme', 'Basic abc'],
    ['no token after Bearer', 'Bearer'],
    ['garbage token', 'Bearer not.a.jwt'],
    ['empty header', ''],
  ])('rejects an Authorization header with %s', async (_name, header) => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', header);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const expired = tokenFor('admin', { expiresIn: -1 });
    const res = await request(app).get('/api/v1/auth/me').set(bearer(expired));
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ sub: 'user-1', role: 'admin' }, 'some-other-secret');
    const res = await request(app).get('/api/v1/blog/admin/list').set(bearer(forged));
    expect(res.status).toBe(401);
  });

  it('rejects a refresh-secret token used as an access token', async () => {
    const refresh = jwt.sign({ sub: 'user-1', role: 'admin' }, process.env.JWT_REFRESH_SALT as string);
    const res = await request(app).get('/api/v1/blog/admin/list').set(bearer(refresh));
    expect(res.status).toBe(401);
  });

  it('rejects an unsigned alg=none token claiming to be admin', async () => {
    const res = await request(app).get('/api/v1/blog/admin/list').set(bearer(unsignedToken('admin')));
    expect(res.status).toBe(401);
  });

  it('never answers 5xx for arbitrary bearer strings (property)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 200 }).filter((s) => !/[\r\n\0]/.test(s)), async (junk) => {
        const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${junk}`);
        return res.status === 401;
      }),
      { numRuns: 50, seed: 42 },
    );
  });
});

describe('level 3 - authorization', () => {
  it.each(ADMIN_ONLY)('%s %s returns 403 for a customer token', async (method, url) => {
    const res = await call(method, url).set(bearer(tokenFor('customer')));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('asks order endpoints for a brand header before touching the database', async () => {
    const res = await request(app).get('/api/v1/orders').set(bearer(tokenFor('customer')));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BRAND_REQUIRED');
  });
});

describe('levels 1, 2, 8, 9 - input validation and hostile input', () => {
  const strong = 'Abcdef1!';

  it.each([
    ['empty body', {}],
    ['empty strings', { email: '', password: '' }],
    ['not an email', { email: 'abc', password: 'x' }],
    ['SQL injection', { email: "' OR 1=1 --", password: 'x' }],
    ['XSS', { email: '<script>alert(1)</script>', password: 'x' }],
    ['path traversal', { email: '../../etc/passwd', password: 'x' }],
    ['accented local part', { email: 'Nguyễn Thị Ánh@example.com', password: 'x' }],
    ['whitespace only', { email: '   ', password: '   ' }],
  ])('login rejects %s before reaching the database', async (_name, body) => {
    const res = await request(app).post('/api/v1/auth/login').send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(LEAK);
  });

  it.each([
    ['too short', 'Ab1!'],
    ['no uppercase', 'abcdef1!'],
    ['no lowercase', 'ABCDEF1!'],
    ['no digit', 'Abcdefg!'],
    ['no special character', 'Abcdefg1'],
  ])('register rejects a password that is %s', async (_name, password) => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'a@example.com', password, confirmPassword: password });
    expect(res.status).toBe(422);
  });

  it('register rejects a mismatched confirmPassword', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'a@example.com', password: strong, confirmPassword: 'Different1!' });
    expect(res.status).toBe(422);
  });

  it('creating a blog post rejects an empty body for an admin', async () => {
    const res = await request(app).post('/api/v1/blog').set(bearer(tokenFor('admin'))).send({});
    expect(res.status).toBe(422);
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(3);
  });

  it('creating a blog post rejects an unknown status value', async () => {
    const res = await request(app)
      .post('/api/v1/blog')
      .set(bearer(tokenFor('admin')))
      .send({ title: 't', slug: 's', content: 'c', status: 'hacked' });
    expect(res.status).toBe(422);
  });

  it('answers 400, not 500, for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(LEAK);
  });

  it('answers 413, not 500, for a body over the 10mb limit', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@example.com', password: 'x'.repeat(11 * 1024 * 1024) }));
    expect(res.status).toBe(413);
  });
});

describe('level 8 - cross-origin access', () => {
  it('does not grant CORS to an unknown origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not grant credentialed CORS to an arbitrary *.vercel.app origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://attacker-site.vercel.app');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('grants CORS to the configured frontend origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });
});

describe('level 8 - search engine exposure', () => {
  it('marks API responses noindex', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.headers['x-robots-tag']).toMatch(/noindex/);
  });
});
