import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pool, countRows } from './helpers/db';
import { call, LEAK } from './helpers/http';
import { ITER, statusHistogram } from './helpers/concurrency';
import { createUser } from './helpers/factories';

// =============================================================================================
// Auth endpoints against a real database (skills: deep-test levels 0–9, transaction-race-test
// for the token write paths).
//
// Spec sources: routes/auth.route.ts (validation rules), services/token.service.ts (rotation
// + reuse detection, single-use refresh tokens), CLAUDE.md §8 (no account enumeration, never
// log tokens, no sensitive fields in responses).
//
// Write paths with race risk:
//   register              check-then-insert on User.email           → duplicate → 500?
//   rotateRefreshToken    find → revoke → issue, not atomic          → one token, many sessions
//   resetPassword         find token → update → delete, not atomic   → token reused / 500
// =============================================================================================

const STRONG = 'Secret#123';
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

const register = (body: Record<string, unknown>) => call('post', '/api/v1/auth/register', { brand: null }).send(body);
const login = (email: string, password: string) =>
  call('post', '/api/v1/auth/login', { brand: null }).send({ email, password });
const refresh = (refreshToken: string) =>
  call('post', '/api/v1/auth/refresh', { brand: null }).send({ refreshToken });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('register', () => {
  it('L0 creates a customer, hashes the password and returns both tokens', async () => {
    const res = await register({ email: 'an@example.com', password: STRONG, confirmPassword: STRONG, fullName: 'Nguyễn An' });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toEqual({ id: expect.any(String), email: 'an@example.com', fullName: 'Nguyễn An', role: 'customer' });
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toMatch(/^[0-9a-f]{80}$/);
    // password stored as a bcrypt hash, never in clear text
    const { rows } = await pool.query(`SELECT "passwordHash" FROM "User" WHERE email = 'an@example.com'`);
    expect(rows[0].passwordHash).toMatch(/^\$2[aby]\$/);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('L8 ignores a client-supplied role (mass assignment): nobody can register as admin', async () => {
    const res = await register({ email: 'evil@example.com', password: STRONG, confirmPassword: STRONG, role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('customer');
  });

  it('L4 rejects an email already registered with 409, including a different letter case', async () => {
    await createUser({ email: 'binh@example.com' });
    const same = await register({ email: 'binh@example.com', password: STRONG, confirmPassword: STRONG });
    const upper = await register({ email: 'BINH@Example.com', password: STRONG, confirmPassword: STRONG });
    expect(same.status).toBe(409);
    expect(upper.status).toBe(409); // normalizeEmail lower-cases before the lookup
    expect(await countRows('User')).toBe(1);
  });

  it('L9 keeps Vietnamese names with diacritics and emoji intact', async () => {
    const res = await register({ email: 'anh@example.com', password: STRONG, confirmPassword: STRONG, fullName: 'Trần Thị Ánh 🐶' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.fullName).toBe('Trần Thị Ánh 🐶');
  });

  it(`L6 the same email registered 10 times at once creates ONE account and answers 409 to the rest (never 500) — ${ITER}x`, async () => {
    // check-then-insert: every request runs `findUnique(email)` → null, then all try to
    // INSERT. The unique index makes 9 of them fail with Prisma P2002, which errorHandler does
    // not map, so the client sees 500 instead of EMAIL_TAKEN.
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const email = `race${i}@example.com`;
      const responses = await Promise.all(
        Array.from({ length: 10 }, () => register({ email, password: STRONG, confirmPassword: STRONG })),
      );
      const hist = statusHistogram(responses);
      const users = await countRows('User', 'email = $1', [email]);
      if (users !== 1 || hist[201] !== 1 || hist[409] !== 9) failures.push({ iteration: i, users, hist });
    }
    expect(failures).toEqual([]);
  });
});

describe('login', () => {
  it('L0 returns tokens and the public user fields only', async () => {
    const u = await createUser({ email: 'chi@example.com' });
    const res = await login('chi@example.com', u.password);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data.user).sort()).toEqual(['email', 'fullName', 'id', 'role']);
  });

  it('L3/L8 wrong password and unknown email are indistinguishable (no account enumeration)', async () => {
    const u = await createUser({ email: 'dung@example.com' });
    const wrong = await login(u.email, 'Wrong#123');
    const unknown = await login('nobody@example.com', 'Wrong#123');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it.each([
    ["' OR 1=1 --", 'sql injection in password'],
    ['<script>alert(1)</script>', 'markup in password'],
    ['x'.repeat(10_000), '10 000-character password'],
  ])('L8 %s → 401 without leaking internals (%s)', async (password) => {
    await createUser({ email: 'em@example.com' });
    const res = await login('em@example.com', password);
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(LEAK);
  });
});

describe('refresh token rotation', () => {
  async function session() {
    const u = await createUser();
    const res = await login(u.email, u.password);
    return { user: u, refreshToken: res.body.data.refreshToken as string };
  }

  it('L0 exchanges a refresh token for a new pair and the old one stops working', async () => {
    const { refreshToken } = await session();
    const first = await refresh(refreshToken);
    expect(first.status).toBe(200);
    expect(first.body.data.refreshToken).not.toBe(refreshToken);

    // Replaying the OLD token now is the theft signal …
    const replay = await refresh(refreshToken);
    expect(replay.status).toBe(401);
    // … and reuse detection kills the whole family, including the token just issued.
    const afterTheft = await refresh(first.body.data.refreshToken);
    expect(afterTheft.status).toBe(401);
  });

  it('L9 an expired refresh token is refused', async () => {
    const { refreshToken } = await session();
    await pool.query(`UPDATE "RefreshToken" SET "expiresAt" = now() - interval '1 second'`);
    expect((await refresh(refreshToken)).status).toBe(401);
  });

  it('L2 an unknown or malformed refresh token is a clean 401', async () => {
    for (const t of ['deadbeef', 'x'.repeat(5000), "' OR 1=1 --"]) {
      const res = await refresh(t);
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toMatch(LEAK);
    }
  });

  it(`L6 the same refresh token used 10 times at once yields exactly ONE new session — ${ITER}x`, async () => {
    // rotateRefreshToken does findFirst → (check revokedAt) → update → issue as separate
    // statements. Concurrent calls all read revokedAt = null before any of them revokes it, so
    // each issues its own fresh token: one stolen refresh token becomes many live sessions and
    // reuse detection never fires. The fix is a single conditional
    // `UPDATE … SET revokedAt = now() WHERE tokenHash = $1 AND revokedAt IS NULL` and checking
    // the affected row count.
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const { user, refreshToken } = await session();
      const responses = await Promise.all(Array.from({ length: 10 }, () => refresh(refreshToken)));
      const hist = statusHistogram(responses);
      const live = await countRows('RefreshToken', `"userId" = $1 AND "revokedAt" IS NULL`, [user.id]);
      if (hist[200] !== 1 || live > 1) failures.push({ iteration: i, hist, liveTokens: live });
    }
    expect(failures, 'one refresh token was turned into several live sessions').toEqual([]);
  });

  it('L4 logout revokes the token, is idempotent and silent about unknown tokens', async () => {
    const { refreshToken } = await session();
    const out = () => call('post', '/api/v1/auth/logout', { brand: null }).send({ refreshToken });
    expect((await out()).status).toBe(200);
    expect((await out()).status).toBe(200);
    expect((await refresh(refreshToken)).status).toBe(401);
    expect((await call('post', '/api/v1/auth/logout', { brand: null }).send({ refreshToken: 'nope' })).status).toBe(200);
  });
});

describe('me', () => {
  it('L0 returns the caller', async () => {
    const u = await createUser();
    const res = await call('get', '/api/v1/auth/me', { token: u.token, brand: null });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(u.id);
  });

  it('L4 a valid token for a user deleted since it was issued answers 404, not 500', async () => {
    const u = await createUser();
    await pool.query(`DELETE FROM "User" WHERE id = $1`, [u.id]);
    expect((await call('get', '/api/v1/auth/me', { token: u.token, brand: null })).status).toBe(404);
  });
});

describe('password reset', () => {
  // The raw reset token is only ever printed to the server log, so tests plant a known token
  // by storing its SHA-256 hash exactly the way requestPasswordReset does.
  //
  // The expiry is computed by PostgreSQL (`now() + interval`), not passed as a JS Date: the
  // column is `timestamp WITHOUT time zone`, and node-pg serialises a Date in the machine's
  // local zone (+07:00), which the column would silently store 7 hours later than meant.
  async function plantResetToken(userId: string, expiresInSeconds = 3600) {
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO "PasswordResetToken" (id, "userId", "tokenHash", "expiresAt")
       VALUES ($1, $2, $3, (now() AT TIME ZONE 'UTC') + make_interval(secs => $4))`,
      [crypto.randomUUID(), userId, sha256(token), expiresInSeconds],
    );
    return token;
  }
  const reset = (email: string, token: string, newPassword = 'NewPass#456') =>
    call('post', '/api/v1/auth/reset-password', { brand: null }).send({ email, token, newPassword });
  const requestReset = (email: string) =>
    call('post', '/api/v1/auth/request-password-reset', { brand: null }).send({ email });

  it('L0 a valid token sets the new password and can be used only once', async () => {
    const u = await createUser({ email: 'giang@example.com' });
    const token = await plantResetToken(u.id);

    expect((await reset(u.email, token)).status).toBe(200);
    expect((await login(u.email, 'NewPass#456')).status).toBe(200);
    expect((await login(u.email, u.password)).status).toBe(401);
    expect((await reset(u.email, token, 'Other#789')).status).toBe(400); // single use
  });

  it('L9 an expired token is refused with EXPIRED_TOKEN', async () => {
    const u = await createUser();
    const token = await plantResetToken(u.id, -1); // expired one second ago
    const res = await reset(u.email, token);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EXPIRED_TOKEN');
  });

  it("L3 a token issued for one account cannot reset another account's password", async () => {
    const victim = await createUser();
    const attacker = await createUser();
    const token = await plantResetToken(attacker.id);
    expect((await reset(victim.email, token)).status).toBe(400);
    expect((await login(victim.email, victim.password)).status).toBe(200);
  });

  it('L8 request-password-reset answers identically for known and unknown emails (no enumeration)', async () => {
    await createUser({ email: 'known@example.com' });
    const known = await requestReset('known@example.com');
    const unknown = await requestReset('unknown@example.com');
    expect(known.status).toBe(unknown.status);
    expect(known.body).toEqual(unknown.body);
  });

  it('L8 the reset token is never written to the server log', async () => {
    // CLAUDE.md §6/§8: never log tokens. Anyone with log access (hosting dashboard, log
    // aggregator) could otherwise take over any account that requests a reset.
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await createUser({ email: 'log@example.com' });
    await requestReset('log@example.com');
    const logged = logSpy.mock.calls.flat().join(' ');
    expect(logged).not.toMatch(/token=[0-9a-f]{64}/);
  });

  it(`L6 one reset token submitted 5 times at once changes the password ONCE; the rest get 400, not 500 — ${ITER}x`, async () => {
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const u = await createUser();
      const token = await plantResetToken(u.id);
      const responses = await Promise.all(Array.from({ length: 5 }, (_, k) => reset(u.email, token, `Race#${k}aaA`)));
      const hist = statusHistogram(responses);
      if (hist[200] !== 1 || hist[400] !== 4) failures.push({ iteration: i, hist });
    }
    expect(failures).toEqual([]);
  });
});
