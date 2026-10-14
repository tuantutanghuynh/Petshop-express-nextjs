import { Pool } from 'pg';

// A raw `pg` pool owned by the TESTS, separate from the app's Prisma client.
//
// Tests use it for three things the app client cannot do for them:
//   1. resetting the database between tests (TRUNCATE);
//   2. reading invariants straight from the tables, so an assertion never trusts the same
//      code path it is checking;
//   3. opening several independent connections to replay two transactions step by step
//      (see stock.isolation.test.ts).
//
// `max` is generous on purpose: if the pool were smaller than the number of concurrent
// clients a test opens, the clients would queue behind each other and the race the test is
// trying to provoke would never happen — a "green" result that proves nothing.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 40 });

let tableList: string | null = null;

// Empties every table and resets sequences. Table names come from the PostgreSQL catalog,
// never from user input, so building the statement with string interpolation is safe here.
export async function resetDb(): Promise<void> {
  if (tableList === null) {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    tableList = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  }
  if (tableList) {
    await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

// ---- Invariant readers ---------------------------------------------------------------------
// Small, explicit queries used by assertions. Column names are quoted because Prisma created
// the tables with camelCase identifiers.

export async function variantStock(variantId: string): Promise<{ stock: number; reserved: number }> {
  const { rows } = await pool.query<{ stockQuantity: number; reservedQuantity: number }>(
    `SELECT "stockQuantity", "reservedQuantity" FROM "ProductVariant" WHERE id = $1`,
    [variantId],
  );
  return { stock: rows[0].stockQuantity, reserved: rows[0].reservedQuantity };
}

export async function countRows(table: string, where = 'TRUE', params: unknown[] = []): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM "${table}" WHERE ${where}`, params);
  return Number(rows[0].n);
}

export async function orderRow(id: string) {
  const { rows } = await pool.query(`SELECT * FROM "Order" WHERE id = $1`, [id]);
  return rows[0];
}

// ---- Query counting (data-query-performance) -----------------------------------------------
// pg_stat_statements is preloaded by global-setup.ts. Resetting it right before a request and
// reading it right after tells us how many SQL statements that request sent. The test's own
// bookkeeping queries (TRUNCATE, pg_stat_statements itself, BEGIN/COMMIT) are filtered out.

export async function enableQueryStats(): Promise<void> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements');
}

export async function resetQueryStats(): Promise<void> {
  await pool.query('SELECT pg_stat_statements_reset()');
}

export async function appQueryCount(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(`
    SELECT COALESCE(sum(calls), 0)::text AS n
    FROM pg_stat_statements
    WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND query !~* 'pg_stat_statements|TRUNCATE|^\\s*(BEGIN|COMMIT|ROLLBACK|SET|SHOW|DEALLOCATE)'
      AND query !~* 'pg_catalog|information_schema'`);
  return Number(rows[0].n);
}
