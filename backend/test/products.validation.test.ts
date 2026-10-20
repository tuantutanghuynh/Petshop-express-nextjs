import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app';

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
