import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bearer, tokenFor } from './helpers';

// Request logging (spec 2026-11-04 structured logging, CLAUDE.md §6): one JSON line per request
// carrying its request id, never a token, cookie, internal secret or query string. The real
// createLogger is used with an in-memory destination, so redaction and levels are the real ones.

type Line = Record<string, unknown> & { level?: string; reqId?: string; req?: { id?: string; path?: string }; res?: { statusCode?: number } };
let lines: Line[] = [];

async function freshApp() {
  lines = [];
  vi.resetModules();
  vi.doMock('../utils/logger', async () => {
    const actual = await vi.importActual<typeof import('../utils/logger')>('../utils/logger');
    const logger = actual.createLogger({ write: (s: string) => { lines.push(JSON.parse(s) as Line); } });
    return { ...actual, logger, default: logger };
  });
  const { default: app } = await import('../app');
  return app;
}

const flushed = () => new Promise((r) => setImmediate(r));
const raw = () => JSON.stringify(lines);

beforeEach(() => {
  vi.doUnmock('../utils/logger');
});

describe('request id', () => {
  it('answers every request with an X-Request-Id', async () => {
    const res = await request(await freshApp()).get('/api/v1/unknown');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps a well-formed id sent by the BFF and logs it', async () => {
    const res = await request(await freshApp()).get('/api/v1/unknown').set('X-Request-Id', 'bff-abc12345');
    await flushed();
    expect(res.headers['x-request-id']).toBe('bff-abc12345');
    expect(lines.some((l) => l.req?.id === 'bff-abc12345')).toBe(true);
  });

  it.each([
    ['too short', 'a'],
    ['too long', 'x'.repeat(101)],
    // (A line break cannot even be sent: Node's HTTP client refuses it before it leaves.)
    ['markup', 'abc12345<x>'],
    ['a space', 'abc 12345'],
  ])('replaces an id with %s', async (_label, id) => {
    const res = await request(await freshApp()).get('/api/v1/unknown').set('X-Request-Id', id);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('what a log line may contain', () => {
  it('never contains the token, cookie or internal secret', async () => {
    const token = tokenFor('admin');
    await request(await freshApp())
      .get('/api/v1/unknown')
      .set(bearer(token))
      .set('Cookie', 'sc_rt=very-secret-cookie')
      .set('X-Internal-Secret', 'internal-secret-value');
    await flushed();
    expect(lines.length).toBeGreaterThan(0);
    expect(raw()).not.toContain(token);
    expect(raw()).not.toContain('very-secret-cookie');
    expect(raw()).not.toContain('internal-secret-value');
  });

  it('logs the path without the query string', async () => {
    await request(await freshApp()).get('/api/v1/unknown?q=0912345678');
    await flushed();
    expect(lines.some((l) => l.req?.path === '/api/v1/unknown')).toBe(true);
    expect(raw()).not.toContain('0912345678');
  });
});

describe('which requests are logged', () => {
  it('logs a rate limited request as a warning', async () => {
    const app = await freshApp();
    for (let i = 0; i < 101; i += 1) await request(app).get('/api/v1/unknown').set('X-Forwarded-For', '203.0.113.50');
    await flushed();
    expect(lines.some((l) => l.level === 'warn' && l.res?.statusCode === 429)).toBe(true);
  });

  it('ties an unexpected error to its request id', async () => {
    // No database in this suite: reading a product fails inside Prisma → the generic 500.
    const res = await request(await freshApp()).get('/api/v1/products/any-slug');
    await flushed();
    expect(res.status).toBe(500);
    const id = res.headers['x-request-id'];
    expect(lines.some((l) => l.level === 'error' && l.reqId === id && l.msg === 'unhandled error')).toBe(true);
  });

  it('does not log health probes', async () => {
    await request(await freshApp()).get('/health');
    await flushed();
    expect(lines).toEqual([]);
  });
});
