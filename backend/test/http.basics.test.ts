import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app';

const noInternalsLeaked = (body: unknown) =>
  expect(JSON.stringify(body)).not.toMatch(/prisma|node_modules|at \w+ \(|\.ts:\d+/i);

describe('basic HTTP behaviour', () => {
  it('answers the liveness probe without credentials', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it.each(['/api/v1/does-not-exist', '/nope', '/api/v1/products/../../etc/passwd'])(
    'returns a 404 error envelope for unknown route %s',
    async (path) => {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ data: null, meta: null, error: { code: 'NOT_FOUND' } });
      noInternalsLeaked(res.body);
    },
  );

  it('sets the standard security headers and hides the framework', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('CORS', () => {
  it('allows the configured frontend origin with credentials', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant access to an unknown origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  // The spec (CLAUDE.md section 8) asks for a CORS *whitelist*. app.ts also accepts every
  // "*.vercel.app" origin, and anyone can register one, so with `credentials: true` an attacker
  // site hosted there could read authenticated responses.
  it('does not grant credentialed access to an arbitrary *.vercel.app origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://attacker-site.vercel.app');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('request body handling', () => {
  it('answers 400 (not 500) for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.com", "password": ');
    expect(res.status).toBe(400);
    noInternalsLeaked(res.body);
  });

  it('answers 413 (not 500) when the body exceeds the 10MB limit', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.com', password: 'x'.repeat(11 * 1024 * 1024) }));
    expect(res.status).toBe(413);
  });
});
