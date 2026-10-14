import { describe, expect, it } from 'vitest';
import { pool } from './helpers/db';
import { call } from './helpers/http';
import { createBrand, createProduct } from './helpers/factories';

// Proves the harness itself works before any real scenario relies on it: the app talks to the
// throwaway container (not backend/.env), the schema contains every table the code uses, and
// tables are empty at the start of each test.
describe('DB test harness', () => {
  it('connects the app and the test pool to the same disposable database', async () => {
    const { rows } = await pool.query<{ db: string }>('SELECT current_database() AS db');
    expect(rows[0].db).toBe('petshop_test');

    const { child } = await createBrand();
    const product = await createProduct(child.id);

    // The product was written through the app's Prisma client; reading it back over HTTP
    // proves both clients point at the same database.
    const res = await call('get', `/api/v1/products/${product.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(product.id);
  });

  it('builds every table the code expects from prisma/migrations alone', async () => {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const tables = rows.map((r) => r.tablename);
    for (const t of ['Order', 'OrderItem', 'Cart', 'CartItem', 'QuoteRequest', 'SiteSetting', 'PasswordResetToken']) {
      expect(tables).toContain(t);
    }
  });

  it('starts every test with empty tables', async () => {
    const { rows } = await pool.query<{ n: string }>('SELECT count(*)::text AS n FROM "Product"');
    expect(rows[0].n).toBe('0');
  });
});
