import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app';

// Vitest isolates modules per file, so the in-memory limiters in app.ts start from zero here.
describe('rate limiting (429)', () => {
  it('limits /contact to 5 requests per window per IP', async () => {
    // `website_url` is the honeypot: the controller answers 200 without touching the database.
    const spam = () => request(app).post('/api/v1/contact').send({ website_url: 'bot' });

    for (let i = 0; i < 5; i += 1) {
      expect((await spam()).status).toBe(200);
    }
    const blocked = await spam();
    expect(blocked.status).toBe(429);
  });

  it('limits the whole API to 100 requests per window per IP', async () => {
    // Unknown routes cost nothing: they hit the 404 handler after the limiter has counted them.
    const statuses: number[] = [];
    for (let i = 0; i < 101; i += 1) {
      statuses.push((await request(app).get('/api/v1/unknown').set('X-Forwarded-For', '203.0.113.9')).status);
    }
    expect(statuses.slice(0, 99).every((s) => s === 404)).toBe(true);
    expect(statuses[100]).toBe(429);
  });
});
