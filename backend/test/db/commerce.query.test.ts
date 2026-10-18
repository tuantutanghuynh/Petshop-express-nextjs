import { beforeAll, describe, expect, it } from 'vitest';
import { pool, appQueryCount, enableQueryStats, resetQueryStats } from './helpers/db';
import { call } from './helpers/http';
import { createAdmin, createBrand, createProduct, createUser, fillCart, orderBody } from './helpers/factories';
import { writeMetric } from './helpers/metrics';

// =============================================================================================
// Query cost of the commerce read paths (skill: data-query-performance §6, §7, §11).
//
// Rules checked:
//   - the number of SQL statements a list request sends must not grow with the number of rows
//     (no N+1) — measured with pg_stat_statements, the same way as catalog.query.test.ts;
//   - paginated order lists must be stable when rows share a timestamp (id tie-breaker);
//   - the hot lookups must be served by an index on a realistically large table, checked with
//     EXPLAIN after ANALYZE.
// =============================================================================================

beforeAll(async () => {
  await enableQueryStats();
});

async function countQueries(run: () => Promise<{ status: number }>): Promise<number> {
  await resetQueryStats();
  const res = await run();
  expect(res.status).toBe(200);
  return appQueryCount();
}

describe('no N+1 on commerce reads', () => {
  it('GET /cart sends the same number of queries for 1 line and for 20 lines', async () => {
    const { child } = await createBrand();
    const counts: Record<string, number> = {};
    for (const n of [1, 20]) {
      const u = await createUser();
      const lines = [];
      for (let i = 0; i < n; i += 1) {
        const p = await createProduct(child.id);
        lines.push({ variantId: p.variants[0].id, quantity: 1 });
      }
      await fillCart(u.id, lines);
      counts[`lines=${n}`] = await countQueries(() => call('get', '/api/v1/cart', { token: u.token }));
    }
    writeMetric('cart-query-count', counts);
    expect(counts['lines=20']).toBe(counts['lines=1']);
  });

  it('GET /orders (mine) and GET /orders/admin/list do not grow with the number of orders', async () => {
    const { child } = await createBrand();
    const p = await createProduct(child.id, { variants: [{ stock: 1000 }] });
    const admin = await createAdmin();
    const counts: Record<string, number> = {};
    for (const n of [1, 20]) {
      await pool.query('TRUNCATE "Order", "OrderItem" CASCADE');
      const u = await createUser();
      for (let i = 0; i < n; i += 1) {
        await fillCart(u.id, [{ variantId: p.variants[0].id, quantity: 1 }]);
        await call('post', '/api/v1/orders', { token: u.token }).send(orderBody('COD'));
      }
      counts[`mine,orders=${n}`] = await countQueries(() => call('get', '/api/v1/orders?pageSize=50', { token: u.token }));
      counts[`admin,orders=${n}`] = await countQueries(() => call('get', '/api/v1/orders/admin/list?pageSize=50', { token: admin.token }));
    }
    writeMetric('order-list-query-count', counts);
    expect(counts['mine,orders=20']).toBe(counts['mine,orders=1']);
    expect(counts['admin,orders=20']).toBe(counts['admin,orders=1']);
  });

  it('GET /quote-requests/admin/list does not grow with the number of requests', async () => {
    const { child } = await createBrand();
    const p = await createProduct(child.id);
    const admin = await createAdmin();
    const counts: Record<string, number> = {};
    for (const n of [1, 20]) {
      await pool.query('TRUNCATE "QuoteRequest"');
      for (let i = 0; i < n; i += 1) {
        await call('post', '/api/v1/quote-requests').send({ customerName: 'Khách', phone: '0900000000', address: 'HCM', items: [{ variantId: p.variants[0].id, quantity: 1 }] });
      }
      counts[`quotes=${n}`] = await countQueries(() => call('get', '/api/v1/quote-requests/admin/list?pageSize=50', { token: admin.token }));
    }
    writeMetric('quote-list-query-count', counts);
    expect(counts['quotes=20']).toBe(counts['quotes=1']);
  });
});

describe('stable pagination of orders', () => {
  it('walking "my orders" page by page returns every order exactly once when they share a timestamp', async () => {
    const u = await createUser();
    await createBrand();
    await pool.query(
      `INSERT INTO "Order" (id, code, "userId", "brandSlug", "orderStatus", "paymentMethod", "paymentStatus", subtotal, "grandTotal", "shippingAddress", "createdAt", "updatedAt")
       SELECT gen_random_uuid(), 'NP-T-' || g, $1, 'petshop', 'CONFIRMED', 'COD', 'UNPAID', 1000, 1000, '{}', now(), now()
       FROM generate_series(1, 95) g`,
      [u.id],
    );
    await pool.query('ANALYZE "Order"');
    const seen = new Map<string, number>();
    for (let page = 1; page <= 10; page += 1) {
      const res = await call('get', `/api/v1/orders?page=${page}&pageSize=10`, { token: u.token });
      for (const o of res.body.data) seen.set(o.id, (seen.get(o.id) ?? 0) + 1);
    }
    expect({ distinct: seen.size, duplicated: [...seen.values()].filter((n) => n > 1).length }).toEqual({ distinct: 95, duplicated: 0 });
  });
});

describe('index use on a large Order table (20 000 rows)', () => {
  // Seeded inside each test: the suite's beforeEach TRUNCATEs every table, so data loaded in a
  // beforeAll would already be gone and EXPLAIN would describe an empty table.
  async function seedOrders(): Promise<string> {
    const u = await createUser();
    const someoneElse = await createUser(); // owns the bulk, so "my orders" is a narrow slice
    const userId = u.id;
    await pool.query(
      `INSERT INTO "Order" (id, code, "userId", "brandSlug", "orderStatus", "paymentMethod", "paymentStatus", subtotal, "grandTotal", "shippingAddress", "expiresAt", "createdAt", "updatedAt")
       SELECT gen_random_uuid(), 'NP-X-' || g, CASE WHEN g % 200 = 0 THEN $1 ELSE $2 END, 'petshop',
              CASE WHEN g % 50 = 0 THEN 'PENDING_PAYMENT' ELSE 'CONFIRMED' END, 'COD', 'UNPAID', 1000, 1000, '{}',
              CASE WHEN g % 50 = 0 THEN now() + interval '1 day' END, now() - (g || ' minutes')::interval, now()
       FROM generate_series(1, 20000) g`,
      [userId, someoneElse.id],
    );
    await pool.query('ANALYZE "Order"');
    return userId;
  }

  async function plan(sql: string, params: unknown[] = []) {
    const { rows } = await pool.query<{ 'QUERY PLAN': string }>(`EXPLAIN ${sql}`, params);
    return rows.map((r) => r['QUERY PLAN']).join('\n');
  }

  it('looking up an order by its code uses the unique index', async () => {
    await seedOrders();
    const p = await plan(`SELECT id FROM "Order" WHERE code = 'NP-X-123'`);
    writeMetric('plan-order-by-code', { p });
    expect(p).not.toMatch(/Seq Scan on "Order"/);
  });

  it('"my orders" (userId, newest first) uses the (userId, createdAt) index', async () => {
    const userId = await seedOrders();
    const p = await plan(
      `SELECT id FROM "Order" WHERE "userId" = $1 AND "brandSlug" = 'petshop' ORDER BY "createdAt" DESC, id DESC LIMIT 10`,
      [userId],
    );
    writeMetric('plan-my-orders', { p });
    expect(p).not.toMatch(/Seq Scan on "Order"/);
  });

  it('the expiry sweeper (PENDING_PAYMENT and expiresAt < now) does not scan the whole table every 15 minutes', async () => {
    // Measured: PostgreSQL serves this through the (brandSlug, orderStatus) index (bitmap scan on
    // the second column) rather than a sequential scan, so no extra index is needed today. This
    // guards against a future change that would push the sweeper back to reading every row.
    await seedOrders();
    const p = await plan(`SELECT id FROM "Order" WHERE "orderStatus" = 'PENDING_PAYMENT' AND "expiresAt" < now()`);
    writeMetric('plan-sweeper', { p });
    expect(p).not.toMatch(/Seq Scan on "Order"/);
  });
});
