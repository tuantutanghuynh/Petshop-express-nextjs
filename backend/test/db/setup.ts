import { afterAll, beforeEach, inject } from 'vitest';

// Runs before every DB test file, BEFORE the file's own imports are evaluated. That ordering
// matters: config/env.ts reads DATABASE_URL once, at import time, when services/prisma.ts is
// first loaded by `app`. Setting the variable here guarantees the app's Prisma client connects
// to the throwaway container and never to backend/.env (dotenv does not override variables
// that already exist).
process.env.DATABASE_URL = inject('databaseUrl');

// Safety gate, checked again on the real value: NODE_ENV must be "test", the database name
// must contain "test" and the host must be loopback. A copied production URL that happens to
// contain "test" still fails because its host is not 127.0.0.1.
function assertTestDatabase(): void {
  const raw = process.env.DATABASE_URL ?? '';
  let dbName = '';
  let host = '';
  try {
    const parsed = new URL(raw);
    dbName = parsed.pathname;
    host = parsed.hostname;
  } catch {
    // dbName stays empty and the check below fails
  }
  const isLoopback = host === '127.0.0.1' || host === 'localhost';
  if (process.env.NODE_ENV !== 'test' || !/test/i.test(dbName) || !isLoopback) {
    throw new Error(
      'Refusing to run: NODE_ENV must be "test" and DATABASE_URL must be a loopback database whose name contains "test".',
    );
  }
}

assertTestDatabase();

// The helpers are imported lazily (inside the hooks) so the env assignment above is
// guaranteed to happen before anything opens a connection. A static import would be hoisted
// above it. (Top-level await is not available: the backend compiles as CommonJS.)

// Every test starts from empty tables: no test may depend on data left behind by another,
// and the suite can run in any order (`--sequence.shuffle`).
beforeEach(async () => {
  const { resetDb } = await import('./helpers/db');
  await resetDb();
});

afterAll(async () => {
  const { default: prisma } = await import('../../services/prisma');
  const { closeDb } = await import('./helpers/db');
  await prisma.$disconnect();
  await closeDb();
});
