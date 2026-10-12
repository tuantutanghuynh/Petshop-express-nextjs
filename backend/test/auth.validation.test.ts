import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app';

const STRONG = 'Abcdef1!';
const hostile: Array<[string, unknown]> = [
  ['empty string', ''],
  ['whitespace only', '   '],
  ['10,000 characters', 'a'.repeat(10_000)],
  ['SQL injection', "' OR 1=1 --"],
  ['XSS payload', '<script>alert(1)</script>'],
  ['path traversal', '../../etc/passwd'],
  ['emoji', '😀😀😀'],
  ['null', null],
  ['array', ['a@b.com']],
  ['object', { $ne: null }],
  ['number', 12345],
];

// Every case here is rejected by express-validator before any controller or database code runs,
// so the suite stays DB-free. The point is that bad input always yields a clean 422 envelope.
const expectValidationError = (res: request.Response) => {
  expect(res.status).toBe(422);
  expect(res.body).toMatchObject({ data: null, error: { code: 'VALIDATION_ERROR' } });
  expect(Array.isArray(res.body.error.details)).toBe(true);
  expect(JSON.stringify(res.body)).not.toMatch(/prisma|stack|node_modules/i);
};

describe('POST /api/v1/auth/register validation', () => {
  it.each(hostile)('rejects %s as the email', async (_name, email) => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password: STRONG, confirmPassword: STRONG });
    expectValidationError(res);
  });

  it.each([
    ['too short', 'Ab1!'],
    ['no uppercase', 'abcdef1!'],
    ['no lowercase', 'ABCDEF1!'],
    ['no digit', 'Abcdefg!'],
    ['no special character', 'Abcdefg1'],
    ['empty', ''],
  ])('rejects a password that is %s', async (_name, password) => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'user@example.com', password, confirmPassword: password });
    expectValidationError(res);
  });

  it('rejects a mismatching confirmPassword', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'user@example.com', password: STRONG, confirmPassword: 'Different1!' });
    expectValidationError(res);
  });

  it('rejects an empty body', async () => {
    expectValidationError(await request(app).post('/api/v1/auth/register').send({}));
  });
});

describe('POST /api/v1/auth/login validation', () => {
  it.each(hostile)('rejects %s as the email', async (_name, email) => {
    expectValidationError(await request(app).post('/api/v1/auth/login').send({ email, password: 'x' }));
  });

  it('rejects a missing password', async () => {
    expectValidationError(await request(app).post('/api/v1/auth/login').send({ email: 'user@example.com' }));
  });
});

describe('POST /api/v1/auth/refresh and password reset validation', () => {
  it.each([[''], [null], [undefined]])('rejects refreshToken=%s', async (refreshToken) => {
    expectValidationError(await request(app).post('/api/v1/auth/refresh').send({ refreshToken }));
  });

  it.each(hostile)('rejects %s as the reset-password email', async (_name, email) => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email, token: 't', newPassword: STRONG });
    expectValidationError(res);
  });

  it('rejects a weak new password on reset', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ email: 'user@example.com', token: 't', newPassword: 'weak' });
    expectValidationError(res);
  });

  it.each(hostile)('rejects %s as the request-password-reset email', async (_name, email) => {
    expectValidationError(await request(app).post('/api/v1/auth/request-password-reset').send({ email }));
  });
});
