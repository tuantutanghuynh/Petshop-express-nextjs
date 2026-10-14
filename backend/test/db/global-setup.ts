import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

// Starts ONE throwaway PostgreSQL for the whole DB suite and tears it down afterwards.
//
// Why a container instead of the dev database on :5434:
//   - the suite TRUNCATEs every table before each test; pointing that at a database with real
//     data would wipe it, so the only safe target is one that did not exist a minute ago;
//   - race-condition tests are only meaningful against a real PostgreSQL (real row locks,
//     real READ COMMITTED semantics) — a mock or SQLite would make every race test pass.
//
// The image matches production (PostgreSQL 15, see docker-compose.yml) so lock behaviour is
// identical. `max_connections` is raised because concurrency tests open many connections at
// once, and `pg_stat_statements` is preloaded so the query-count tests can see every SQL
// statement a request sends.

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  container = await new PostgreSqlContainer('postgres:15-alpine')
    .withDatabase('petshop_test')
    .withUsername('test')
    .withPassword('test')
    .withCommand([
      'postgres',
      '-c', 'max_connections=300',
      '-c', 'shared_preload_libraries=pg_stat_statements',
      // fsync off is safe for a disposable database and makes TRUNCATE + inserts much faster
      '-c', 'fsync=off',
    ])
    .start();

  // Testcontainers reports the mapped host; force 127.0.0.1 so the loopback safety gate in
  // test/db/setup.ts can verify we are not talking to a remote server.
  const url = new URL(container.getConnectionUri());
  url.hostname = '127.0.0.1';
  const databaseUrl = url.toString();

  // The schema is built by replaying prisma/migrations exactly as production would
  // (`migrate deploy`), not with `db push`. That way the suite also proves the migrations are
  // complete — until 2026-10-12 they were missing seven tables — and the CHECK constraints that
  // only exist in migration SQL are really present in the test database.
  // DIRECT_URL is set explicitly so prisma.config.ts never falls back to backend/.env.
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(__dirname, '..', '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    stdio: 'pipe',
  });

  project.provide('databaseUrl', databaseUrl);

  return async () => {
    await container?.stop();
  };
}
