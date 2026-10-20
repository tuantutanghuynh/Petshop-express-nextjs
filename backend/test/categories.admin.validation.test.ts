import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app';
import { bearer, tokenFor } from './helpers';

// Category admin endpoints (spec 2026-10-20 admin categories): no token → 401, a customer → 403,
// bad input → 422. All of it is answered by middleware before any query runs, so no database.
const ENDPOINTS: [string, string][] = [
  ['get', '/api/v1/categories/admin/list'],
  ['patch', '/api/v1/categories/some-id'],
  ['delete', '/api/v1/categories/some-id'],
  ['put', '/api/v1/categories/reorder'],
];
type Method = 'get' | 'patch' | 'delete' | 'put' | 'post';
const call = (m: string, url: string) => request(app)[m as Method](url).set('X-Brand-Slug', 'petshop');

describe('category admin access', () => {
  it.each(ENDPOINTS)('%s %s → 401 without a token', async (m, url) => {
    expect((await call(m, url)).status).toBe(401);
  });

  it.each(ENDPOINTS)('%s %s → 403 for a customer', async (m, url) => {
    expect((await call(m, url).set(bearer(tokenFor('customer')))).status).toBe(403);
  });
});

describe('category admin validation', () => {
  const admin = () => bearer(tokenFor('admin'));

  it.each([
    ['blank name', { name: '   ' }],
    ['long name', { name: 'x'.repeat(101) }],
    ['bad slug', { slug: 'Chó Mèo' }],
    ['long description', { description: 'x'.repeat(501) }],
  ])('PATCH refuses a %s with 422', async (_label, body) => {
    const res = await call('patch', '/api/v1/categories/some-id').set(admin()).send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST needs a name, a slug and a parent', async () => {
    expect((await call('post', '/api/v1/categories').set(admin()).send({ name: 'A', slug: 'a' })).status).toBe(422);
  });

  it('reorder needs a parent and a list of ids', async () => {
    expect((await call('put', '/api/v1/categories/reorder').set(admin()).send({ parentId: 'p', ids: 'x' })).status).toBe(422);
  });
});
