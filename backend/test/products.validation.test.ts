import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app';
import { bearer, tokenFor } from './helpers';

// ?brand= reaches a database filter, so it is checked first: one string of 1–100 characters.
// Validation answers before any query runs, so this needs no database.
describe('GET /products brand filter validation', () => {
  it.each([
    ['too long', `brand=${'a'.repeat(101)}`],
    ['blank', 'brand=%20%20'],
    ['repeated', 'brand=a&brand=b'],
  ])('refuses a %s brand with 422', async (_label, query) => {
    const res = await request(app).get(`/api/v1/products?${query}`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// Product fields are checked before resolveBrand reaches the database, so these need no DB either.
describe('admin product validation', () => {
  const admin = bearer(tokenFor('admin'));
  const valid = { categoryId: 'c', name: 'Pate', slug: 'pate', variants: [{ sku: 'P-1', price: 1 }] };
  it.each([
    ['an accented slug', { ...valid, slug: 'pâté' }],
    ['an upper-case slug', { ...valid, slug: 'Pate' }],
    ['a slug with double dashes', { ...valid, slug: 'pate--meo' }],
    ['a slug over 120 characters', { ...valid, slug: 'a'.repeat(121) }],
    ['a blank name', { ...valid, name: '   ' }],
    ['a name over 200 characters', { ...valid, name: 'a'.repeat(201) }],
    ['attributes as an array', { ...valid, attributes: [] }],
    ['a description over 20 000 characters', { ...valid, description: 'a'.repeat(20_001) }],
    ['a brand over 100 characters', { ...valid, brand: 'a'.repeat(101) }],
    ['a variant label over 100 characters', { ...valid, variants: [{ sku: 'P-1', price: 1, label: 'a'.repeat(101) }] }],
  ])('refuses %s with 422', async (_label, body) => {
    const res = await request(app).post('/api/v1/products').set(admin).send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a bad slug or blank name on update too', async () => {
    expect((await request(app).patch('/api/v1/products/some-id').set(admin).send({ slug: 'Có Dấu' })).status).toBe(422);
    expect((await request(app).patch('/api/v1/products/some-id').set(admin).send({ name: '' })).status).toBe(422);
  });
});
