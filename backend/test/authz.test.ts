import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../app';
import { adminToken, algNoneToken, customerToken, expiredToken, forgedToken } from './helpers/tokens';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

// Endpoints the route files protect with authenticate + requireRole('admin'). Both checks run
// before validation and before any controller, so none of these requests reach the database.
const ADMIN_ENDPOINTS: Array<[Method, string]> = [
  ['get', '/api/v1/blog/admin/list'],
  ['post', '/api/v1/blog'],
  ['patch', '/api/v1/blog/some-id'],
  ['delete', '/api/v1/blog/some-id'],
  ['get', '/api/v1/products/admin/list'],
  ['post', '/api/v1/products'],
  ['post', '/api/v1/products/some-id/variants'],
  ['patch', '/api/v1/products/some-id'],
  ['patch', '/api/v1/products/variants/some-id'],
  ['delete', '/api/v1/products/some-id'],
  ['delete', '/api/v1/products/variants/some-id'],
  ['post', '/api/v1/products/some-id/images'],
  ['delete', '/api/v1/products/images/some-id'],
  ['post', '/api/v1/uploads/image'],
  ['patch', '/api/v1/settings'],
  ['get', '/api/v1/contact/admin/list'],
  ['patch', '/api/v1/contact/admin/some-id/read'],
  ['delete', '/api/v1/contact/admin/some-id'],
  ['delete', '/api/v1/gallery/some-id'],
  ['post', '/api/v1/categories/some-id/attributes'],
  ['delete', '/api/v1/categories/some-id/attributes/attr-id'],
  ['get', '/api/v1/quote-requests/admin/anything'],
];

const send = (method: Method, path: string) => request(app)[method](path);

describe('authentication (401)', () => {
  it.each(ADMIN_ENDPOINTS)('%s %s rejects a request without a token', async (method, path) => {
    const res = await send(method, path);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ data: null, error: { code: 'UNAUTHENTICATED' } });
  });

  it.each([
    ['wrong scheme', 'Basic dXNlcjpwYXNz'],
    ['scheme without token', 'Bearer'],
    ['lower-case scheme', `bearer ${'x'}`],
    ['garbage token', 'Bearer not.a.jwt'],
    ['empty header value', ''],
    ['token with SQL', "Bearer ' OR 1=1 --"],
  ])('rejects %s', async (_name, header) => {
    const res = await request(app).get('/api/v1/blog/admin/list').set('Authorization', header);
    expect(res.status).toBe(401);
  });

  it.each([
    ['expired', expiredToken],
    ['signed with a different secret', forgedToken],
    ['alg=none', algNoneToken],
  ])('rejects a token that is %s', async (_name, make) => {
    const res = await request(app).get('/api/v1/blog/admin/list').set('Authorization', `Bearer ${make()}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('gives the same answer for a forged and an expired token (no oracle)', async () => {
    const a = await request(app).get('/api/v1/blog/admin/list').set('Authorization', `Bearer ${forgedToken()}`);
    const b = await request(app).get('/api/v1/blog/admin/list').set('Authorization', `Bearer ${expiredToken()}`);
    expect(a.body.error.message).toBe(b.body.error.message);
  });
});

describe('authorisation (403)', () => {
  it.each(ADMIN_ENDPOINTS)('%s %s rejects a customer token', async (method, path) => {
    const res = await send(method, path).set('Authorization', `Bearer ${customerToken()}`);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ data: null, error: { code: 'FORBIDDEN' } });
  });
});

describe('token lifetime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Only Date is faked so supertest's sockets and timers keep working.
  it('accepts a fresh admin token and rejects it one second after the 15 minute TTL', async () => {
    const token = adminToken();

    // A valid token gets past authenticate and requireRole; the empty body is then stopped by
    // validation (422), which proves auth passed without touching the database.
    const fresh = await request(app).post('/api/v1/blog').set('Authorization', `Bearer ${token}`).send({});
    expect(fresh.status).toBe(422);

    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 15 * 60 * 1000 + 1000 });
    const late = await request(app).post('/api/v1/blog').set('Authorization', `Bearer ${token}`).send({});
    expect(late.status).toBe(401);
  });
});

describe('admin input validation (422)', () => {
  const asAdmin = (path: string) => request(app).post(path).set('Authorization', `Bearer ${adminToken()}`);
  const variant = { sku: 'SKU-1', price: 1000 };
  const product = { categoryId: 'c', name: 'n', slug: 's', variants: [variant] };

  it.each([
    ['negative price', -1],
    ['decimal price', 10.5],
    ['string price', 'cheap'],
    ['null price', null],
    ['price beyond MAX_SAFE_INTEGER', Number.MAX_SAFE_INTEGER + 2],
  ])('rejects a product variant with %s', async (_name, price) => {
    const res = await asAdmin('/api/v1/products').send({ ...product, variants: [{ ...variant, price }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['no variants', { ...product, variants: [] }],
    ['variants not an array', { ...product, variants: 'x' }],
    ['missing name', { ...product, name: '' }],
    ['unknown status', { ...product, status: 'hacked' }],
    ['negative stock', { ...product, variants: [{ ...variant, stockQuantity: -5 }] }],
  ])('rejects a product with %s', async (_name, body) => {
    expect((await asAdmin('/api/v1/products').send(body)).status).toBe(422);
  });

  it.each([
    ['missing title', { slug: 's', content: 'c' }],
    ['unknown status', { title: 't', slug: 's', content: 'c', status: 'archived' }],
    ['empty content', { title: 't', slug: 's', content: '' }],
  ])('rejects a blog post with %s', async (_name, body) => {
    expect((await asAdmin('/api/v1/blog').send(body)).status).toBe(422);
  });
});
