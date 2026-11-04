import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app';
import { markShuttingDown } from '../utils/lifecycle';

// Readiness during shutdown (spec v2 §3.2). In a file of its own: the flag belongs to the whole
// process, and Vitest gives every test file its own worker, so it cannot leak into other suites.
// Answers before any database call, so this needs no database.
describe('GET /health/ready while shutting down', () => {
  it('reports not ready so the load balancer stops sending traffic', async () => {
    markShuttingDown();
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'shutting-down' });
  });
});
