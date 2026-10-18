import { afterEach, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { pool, variantStock } from './helpers/db';
import { call } from './helpers/http';
import { ITER, isBlocked } from './helpers/concurrency';
import { createAdmin, createBrand, createProduct, createUser, fillCart, orderBody } from './helpers/factories';

// =============================================================================================
// L2 deterministic interleaving at the SQL level (skill: transaction-race-test).
//
// These tests drive two PostgreSQL connections BY HAND, statement by statement, so the exact
// ordering that causes a bug happens every time — no luck involved. They serve two purposes:
//   1. Document WHY the checkout uses `UPDATE … WHERE stock - reserved >= qty` instead of
//      "SELECT stock, check in JS, then UPDATE": the first test shows the naive pattern
//      losing an update under PostgreSQL's default READ COMMITTED isolation.
//   2. Prove the pattern the app actually uses blocks and re-checks correctly.
// The last block attacks a real endpoint (PATCH /products/variants/:id) that still uses the
// naive read-then-write shape.
// =============================================================================================

const clients: PoolClient[] = [];
async function twoClients(): Promise<[PoolClient, PoolClient]> {
  const a = await pool.connect();
  const b = await pool.connect();
  clients.push(a, b);
  return [a, b];
}

afterEach(async () => {
  // Always end both transactions and return the connections, even after a failed assertion,
  // or the next test's TRUNCATE would wait on their locks forever.
  for (const c of clients.splice(0)) {
    await c.query('ROLLBACK').catch(() => undefined);
    c.release();
  }
});

async function variantWithStock(stock: number) {
  const { child } = await createBrand();
  const product = await createProduct(child.id, { variants: [{ stock }] });
  return product.variants[0];
}

describe('L2 — why the checkout SQL looks the way it does', () => {
  it('NAIVE read-modify-write loses an update under READ COMMITTED (demonstration)', async () => {
    // This is not app code — it is the pattern the app must NOT use, replayed by hand. The
    // assertion pins down PostgreSQL's real behaviour so a reader can see the anomaly.
    const v = await variantWithStock(10);
    const [a, b] = await twoClients();
    const read = async (c: PoolClient) =>
      (await c.query<{ s: number }>(`SELECT "stockQuantity" AS s FROM "ProductVariant" WHERE id = $1`, [v.id])).rows[0].s;

    await a.query('BEGIN');
    await b.query('BEGIN');
    const seenByA = await read(a); // 10
    const seenByB = await read(b); // 10 — A has not written yet
    await a.query(`UPDATE "ProductVariant" SET "stockQuantity" = $1 WHERE id = $2`, [seenByA - 1, v.id]);
    await a.query('COMMIT');
    // B writes the value it computed from a stale read, overwriting A's decrement.
    await b.query(`UPDATE "ProductVariant" SET "stockQuantity" = $1 WHERE id = $2`, [seenByB - 1, v.id]);
    await b.query('COMMIT');

    // Two units sold, but stock only went down by one: a LOST UPDATE.
    expect((await variantStock(v.id)).stock).toBe(9);
  });

  it('the app pattern (conditional UPDATE) makes the second writer WAIT and re-check the condition', async () => {
    const v = await variantWithStock(1);
    const [a, b] = await twoClients();
    const claim = (c: PoolClient) =>
      c.query(
        `UPDATE "ProductVariant" SET "stockQuantity" = "stockQuantity" - 1
         WHERE id = $1 AND "stockQuantity" - "reservedQuantity" >= 1`,
        [v.id],
      );

    await a.query('BEGIN');
    await b.query('BEGIN');
    expect((await claim(a)).rowCount).toBe(1); // A takes the last unit and holds the row lock

    const pB = claim(b);
    expect(await isBlocked(pB)).toBe(true); // B must wait for A, not read a stale "1"

    await a.query('COMMIT');
    // When A commits, PostgreSQL re-evaluates B's WHERE against the NEW row: 0 >= 1 is false.
    expect((await pB).rowCount).toBe(0);
    await b.query('COMMIT');
    expect((await variantStock(v.id)).stock).toBe(0);
  });

  it('a rolled-back claim gives the unit back to the waiting transaction', async () => {
    const v = await variantWithStock(1);
    const [a, b] = await twoClients();
    const claim = (c: PoolClient) =>
      c.query(
        `UPDATE "ProductVariant" SET "reservedQuantity" = "reservedQuantity" + 1
         WHERE id = $1 AND "stockQuantity" - "reservedQuantity" >= 1`,
        [v.id],
      );

    await a.query('BEGIN');
    await b.query('BEGIN');
    expect((await claim(a)).rowCount).toBe(1);
    const pB = claim(b);
    expect(await isBlocked(pB)).toBe(true);

    await a.query('ROLLBACK'); // A's order failed later on (e.g. another line out of stock)
    expect((await pB).rowCount).toBe(1); // B gets the unit A never really took
    await b.query('COMMIT');
    expect(await variantStock(v.id)).toEqual({ stock: 1, reserved: 1 });
  });

  it('there is no CHECK constraint keeping stock / reservation non-negative (missing safety net)', async () => {
    // The skill's last line of defence: even if application code has a race, the database
    // should refuse a negative counter. Today it accepts one silently — which is why the
    // races in order.race.test.ts end with reservedQuantity = -4 instead of an error.
    const v = await variantWithStock(1);
    const attempt = pool.query(`UPDATE "ProductVariant" SET "reservedQuantity" = -1 WHERE id = $1`, [v.id]);
    await expect(attempt, 'expected a CHECK ("reservedQuantity" >= 0) violation (23514)').rejects.toMatchObject({
      code: '23514',
    });
  });
});

// Since ADR-007 the admin sets stock through POST …/stock-movements (a STOCKTAKE here, the
// equivalent of the old absolute PATCH). The invariant under test is unchanged: stock may never end
// up below the units reserved for customers, however the requests interleave.
describe('L2/L3 — admin stock edit racing checkouts (stocktake)', () => {
  it(`setting stock while customers reserve never leaves stock below the reservation (I2) — ${ITER}x`, async () => {
    // updateVariant reads reservedQuantity, checks `stockQuantity >= reserved` in JS, then
    // writes. Reservations committed between that read and that write are not seen, so the
    // admin can set stock below what is already promised to customers.
    const admin = await createAdmin();
    const failures: unknown[] = [];

    for (let i = 0; i < ITER; i += 1) {
      const v = await variantWithStock(5);
      const buyers = [];
      for (let k = 0; k < 4; k += 1) {
        const u = await createUser();
        await fillCart(u.id, [{ variantId: v.id, quantity: 1 }]);
        buyers.push(u);
      }

      const [edit] = await Promise.all([
        call('post', `/api/v1/products/variants/${v.id}/stock-movements`, { token: admin.token }).send({ type: 'STOCKTAKE', countedQuantity: 2 }),
        ...buyers.map((u) => call('post', '/api/v1/orders', { token: u.token }).send(orderBody('BANK_TRANSFER'))),
      ]);

      const { stock, reserved } = await variantStock(v.id);
      if (stock < reserved) failures.push({ iteration: i, stock, reserved, edit: edit.status });
    }

    expect(failures, 'stock set below units already reserved for customers').toEqual([]);
  });

  it('deterministic replay: a stocktake that starts while a checkout transaction is open never writes stock < reserved', async () => {
    // The random burst above rarely hits the gap (it is a few milliseconds wide). Here the gap
    // is held open on purpose, replaying exactly what createOrder's transaction does:
    //   1. client A = a bank-transfer checkout in progress: reserves 4 units, NOT committed yet;
    //   2. admin PATCH reads the row — MVCC shows the last COMMITTED version (reserved = 0),
    //      so the JS check `2 < 0` passes — then its UPDATE blocks on A's row lock;
    //   3. A commits (reserved = 4); the admin's unconditional UPDATE proceeds and writes 2.
    // A conditional write (`… WHERE "reservedQuantity" <= 2`) or reading the row FOR UPDATE
    // inside a transaction would refuse instead.
    const admin = await createAdmin();
    const v = await variantWithStock(5);
    const [a] = await twoClients();

    await a.query('BEGIN');
    await a.query(`UPDATE "ProductVariant" SET "reservedQuantity" = "reservedQuantity" + 4 WHERE id = $1`, [v.id]);

    const edit = call('post', `/api/v1/products/variants/${v.id}/stock-movements`, { token: admin.token })
      .send({ type: 'STOCKTAKE', countedQuantity: 2 })
      .then((r) => r);
    expect(await isBlocked(edit, 500)).toBe(true); // the edit is waiting on the checkout's lock

    await a.query('COMMIT');
    const res = await edit;

    const { stock, reserved } = await variantStock(v.id);
    expect({ status: res.status, stock, reserved }).toEqual({
      status: 409, // STOCK_BELOW_RESERVED is the documented answer for this situation
      stock: 5,
      reserved: 4,
    });
  });
});
