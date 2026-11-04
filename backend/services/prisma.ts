import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseUrl, dbPoolMax } from '../config/env';

// The one Prisma client the whole backend shares. Every controller imports this module
// rather than constructing its own client.

// Prisma 7 no longer opens the connection itself — it requires a driver adapter, so the
// `pg` pool is wired in here and the datasource block in schema.prisma carries no `url`
// (that moved to prisma.config.ts). Constructing `new PrismaClient()` anywhere else would
// both throw for the missing adapter and open a second connection pool, so this module
// stays the only place it happens and everything else reuses the exported instance.

if (!databaseUrl) {
  throw new Error('Thiếu DATABASE_URL — server không thể khởi động mà không có database.');
}

// Bounds on the pool (spec v2 §3.3). Without them a request waits forever for a free connection
// and a stuck query holds its connection forever. The statement limit stays below the 15 s
// timeout of the checkout transaction, so a hung statement fails that request instead of
// keeping its row locks; long one-off jobs (seeds, reports) must not run through this client.
const CONNECT_TIMEOUT_MS = 5_000;
const IDLE_TIMEOUT_MS = 30_000;
const STATEMENT_TIMEOUT_MS = 10_000;

const adapter = new PrismaPg({
  connectionString: databaseUrl,
  max: dbPoolMax,
  connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  idleTimeoutMillis: IDLE_TIMEOUT_MS,
  statement_timeout: STATEMENT_TIMEOUT_MS,
});
export const prisma = new PrismaClient({ adapter });

export default prisma;
