import { afterEach, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { pool, countRows, orderRow, variantStock } from './helpers/db';
import { call } from './helpers/http';
import { ITER, isBlocked, percentiles, runConcurrently, statusHistogram } from './helpers/concurrency';
import { createAdmin, createBrand, createProduct, createUser, fillCart, orderBody } from './helpers/factories';
import { releaseExpiredOrders } from '../../workers/releaseExpiredOrders';
import { writeMetric } from './helpers/metrics';

// =============================================================================================
// Transaction & race-condition tests for the order / stock write paths (skill:
// transaction-race-test, levels L0 → L5).
//
// WRITE-PATH INVENTORY (what this file attacks)
// | Write path                         | File:function                            | Risk | Pattern today                                   |
// |------------------------------------|------------------------------------------|------|-------------------------------------------------|
// | Claim stock at checkout            | order.controller.ts:createOrder          | HIGH | conditional UPDATE inside $transaction  ✔       |
// | Confirm bank transfer (deduct)     | order.controller.ts:confirmPayment       | HIGH | read status OUTSIDE tx, unconditional UPDATE ✘  |
// | Cancel order (give stock back)     | order.controller.ts:cancelOrder          | HIGH | read status OUTSIDE tx, unconditional UPDATE ✘  |
// | Expire unpaid orders               | workers/releaseExpiredOrders.ts          | HIGH | conditional UPDATE claim per order      ✔       |
// | Same customer submits checkout 2x  | order.controller.ts:createOrder          | HIGH | cart read OUTSIDE tx, no idempotency    ✘       |
//
// INVARIANTS (checked straight from the tables, never from the HTTP response)
//   I1  stockQuantity >= 0 and reservedQuantity >= 0 for every variant — always.
//   I2  stockQuantity - reservedQuantity >= 0 — we never promise more than we own.
//   I3  units sold (COD + confirmed transfers) + stock left = stock we started with.
//   I4  reservedQuantity = sum of quantities of orders still in PENDING_PAYMENT.
//   I5  each cart is turned into at most ONE order.
//   I6  an order's final status is consistent with what happened to the stock:
//         CONFIRMED  ⇒ its units left stockQuantity and are no longer reserved;
//         CANCELLED  ⇒ its units are back (in stock, not reserved).
//   I7  a burst of requests produces only expected statuses (201 / 409 / 200) — never 500.
//
// A note on the app's connection pool: services/prisma.ts uses the pg driver default
// (10 connections). Bursts larger than that queue for a connection, which is realistic — it
// is exactly what happens in production on a busy day — and is tested on purpose in L4.
// =============================================================================================

type Variant = { id: string };

async function setupShop(stock: number, extra: { price?: number; reserved?: number } = {}) {
  const { child } = await createBrand();
  const product = await createProduct(child.id, { variants: [{ stock, price: extra.price ?? 50_000, reserved: extra.reserved ?? 0 }] });
  return { categoryId: child.id, product, variant: product.variants[0] as Variant };
}

// N distinct customers, each with `quantity` of `variant` in their cart — the shape of a real
// flash sale: different people, same item, same second.
async function customersWithCart(n: number, variantId: string, quantity = 1) {
  const users = [];
  for (let i = 0; i < n; i += 1) {
    const u = await createUser();
    await fillCart(u.id, [{ variantId, quantity }]);
    users.push(u);
  }
  return users;
}

function checkout(token: string, method: 'COD' | 'BANK_TRANSFER' = 'COD') {
  return call('post', '/api/v1/orders', { token }).send(orderBody(method));
}

// Places one bank-transfer order (reserving `quantity` units) and returns its id.
async function pendingTransferOrder(variantId: string, quantity = 1) {
  const u = await createUser();
  await fillCart(u.id, [{ variantId, quantity }]);
  const res = await checkout(u.token, 'BANK_TRANSFER');
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
}

// I1 + I2 for one variant, with a readable failure message.
async function expectStockSane(variantId: string) {
  const { stock, reserved } = await variantStock(variantId);
  expect({ stock, reserved, free: stock - reserved }, 'stock invariants I1/I2').toEqual({
    stock: expect.toSatisfy((v: number) => v >= 0),
    reserved: expect.toSatisfy((v: number) => v >= 0),
    free: expect.toSatisfy((v: number) => v >= 0),
  });
}

let heldClient: PoolClient | null = null;
afterEach(async () => {
  // A test that holds a row lock must always let it go, even when its assertions fail —
  // otherwise TRUNCATE in the next test's beforeEach would wait on that lock forever.
  if (heldClient) {
    await heldClient.query('ROLLBACK').catch(() => undefined);
    heldClient.release();
    heldClient = null;
  }
});

// ---------------------------------------------------------------------------------------------
// L0 — ideal: one request at a time, everything valid.
// ---------------------------------------------------------------------------------------------
describe('L0 ideal path', () => {
  it('COD checkout deducts stock immediately, snapshots prices and empties the cart', async () => {
    const { variant } = await setupShop(10, { price: 120_000 });
    const [u] = await customersWithCart(1, variant.id, 3);

    const res = await checkout(u.token, 'COD');

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      orderStatus: 'CONFIRMED',
      paymentStatus: 'UNPAID',
      subtotal: 360_000, // recomputed from the DB price, never sent by the client
      grandTotal: 360_000,
      expiresAt: null, // COD is final, it never expires
    });
    expect(res.body.data.items[0]).toMatchObject({ unitPrice: 120_000, quantity: 3, lineTotal: 360_000 });
    expect(await variantStock(variant.id)).toEqual({ stock: 7, reserved: 0 });
    expect(await countRows('CartItem')).toBe(0);
  });

  it('bank-transfer checkout only RESERVES stock and sets a payment deadline', async () => {
    const { variant } = await setupShop(10);
    const [u] = await customersWithCart(1, variant.id, 2);

    const res = await checkout(u.token, 'BANK_TRANSFER');

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ orderStatus: 'PENDING_PAYMENT', paymentStatus: 'PENDING' });
    expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    // units are held for this customer but still physically on the shelf
    expect(await variantStock(variant.id)).toEqual({ stock: 10, reserved: 2 });
  });

  it('two checkouts in sequence each take their own units', async () => {
    const { variant } = await setupShop(10);
    const [a, b] = await customersWithCart(2, variant.id, 1);
    expect((await checkout(a.token)).status).toBe(201);
    expect((await checkout(b.token)).status).toBe(201);
    expect(await variantStock(variant.id)).toEqual({ stock: 8, reserved: 0 });
  });

  it('buying exactly the last units succeeds and leaves stock at 0 (boundary)', async () => {
    const { variant } = await setupShop(4);
    const [u] = await customersWithCart(1, variant.id, 4);
    expect((await checkout(u.token)).status).toBe(201);
    expect(await variantStock(variant.id)).toEqual({ stock: 0, reserved: 0 });
  });

  it('confirming a transfer turns the reservation into a real deduction', async () => {
    const { variant } = await setupShop(10);
    const admin = await createAdmin();
    const orderId = await pendingTransferOrder(variant.id, 2);

    const res = await call('patch', `/api/v1/orders/admin/${orderId}/confirm-payment`, { token: admin.token });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ orderStatus: 'CONFIRMED', paymentStatus: 'PAID', expiresAt: null });
    expect(await variantStock(variant.id)).toEqual({ stock: 8, reserved: 0 });
  });
});

// ---------------------------------------------------------------------------------------------
// L1 — atomicity: a failure part-way through must leave nothing behind.
// ---------------------------------------------------------------------------------------------
describe('L1 atomicity', () => {
  it('a multi-item order that runs out on its LAST line rolls back the lines already claimed', async () => {
    // Variant ids are random UUIDs and the controller claims lines in id order, so we name the
    // variants by that order: `first` is claimed first and succeeds, `second` then fails.
    const { child } = await createBrand();
    const p = await createProduct(child.id, { variants: [{ stock: 10 }, { stock: 1 }] });
    const [plenty, scarce] = p.variants;
    const [first, second] = [plenty, scarce].sort((x, y) => (x.id < y.id ? -1 : 1));
    // whichever is claimed second must be the one that fails, so give IT the shortage
    await pool.query(`UPDATE "ProductVariant" SET "stockQuantity" = 10 WHERE id = $1`, [first.id]);
    await pool.query(`UPDATE "ProductVariant" SET "stockQuantity" = 1 WHERE id = $1`, [second.id]);

    const u = await createUser();
    await fillCart(u.id, [
      { variantId: first.id, quantity: 2 },
      { variantId: second.id, quantity: 5 }, // only 1 in stock
    ]);

    const res = await checkout(u.token, 'COD');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OUT_OF_STOCK');
    // the 2 units of `first` were deducted inside the transaction, then rolled back
    expect(await variantStock(first.id)).toEqual({ stock: 10, reserved: 0 });
    expect(await variantStock(second.id)).toEqual({ stock: 1, reserved: 0 });
    expect(await countRows('Order')).toBe(0);
    expect(await countRows('OrderItem')).toBe(0);
    // the cart is untouched, so the customer can fix the quantity and retry
    expect(await countRows('CartItem')).toBe(2);
  });

  it('a product deactivated while it sits in the cart blocks checkout without touching stock', async () => {
    const { variant, product } = await setupShop(10);
    const [u] = await customersWithCart(1, variant.id, 1);
    await pool.query(`UPDATE "Product" SET status = 'archived' WHERE id = $1`, [product.id]);

    const res = await checkout(u.token);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCT_UNAVAILABLE');
    expect(await variantStock(variant.id)).toEqual({ stock: 10, reserved: 0 });
  });

  it('a failed request does not leak a connection: 30 failures in a row, then a normal checkout still works', async () => {
    // If a transaction error ever skipped releasing its connection, the 10-connection pool
    // would be exhausted after 10 failures and the final checkout would hang.
    const { variant } = await setupShop(0);
    const users = await customersWithCart(30, variant.id, 1);
    for (const u of users) expect((await checkout(u.token)).status).toBe(409);

    await pool.query(`UPDATE "ProductVariant" SET "stockQuantity" = 1 WHERE id = $1`, [variant.id]);
    const started = Date.now();
    expect((await checkout(users[0].token)).status).toBe(201);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

// ---------------------------------------------------------------------------------------------
// L2 — controlled interleaving: force the dangerous ordering on purpose.
// ---------------------------------------------------------------------------------------------
describe('L2 controlled interleaving', () => {
  it('a checkout WAITS for a row lock held by another transaction, then sees the new value', async () => {
    const { variant } = await setupShop(1);
    const [u] = await customersWithCart(1, variant.id, 1);

    // Another transaction (think: an admin editing stock) locks the row and takes the last unit.
    heldClient = await pool.connect();
    await heldClient.query('BEGIN');
    await heldClient.query(`SELECT 1 FROM "ProductVariant" WHERE id = $1 FOR UPDATE`, [variant.id]);
    await heldClient.query(`UPDATE "ProductVariant" SET "stockQuantity" = 0 WHERE id = $1`, [variant.id]);

    const pending = checkout(u.token).then((r) => r);
    // The conditional UPDATE inside createOrder must block on the lock instead of reading a
    // stale "1 in stock" and overselling.
    expect(await isBlocked(pending, 500)).toBe(true);

    await heldClient.query('COMMIT');
    heldClient.release();
    heldClient = null;

    const res = await pending;
    // After the lock is released PostgreSQL re-evaluates the WHERE on the NEW row version:
    // 0 - 0 >= 1 is false, so the claim affects no row and the app answers 409.
    expect(res.status).toBe(409);
    expect(await variantStock(variant.id)).toEqual({ stock: 0, reserved: 0 });
  });

  it('confirm-payment racing cancel on the same order leaves stock consistent with the final status (I6)', async () => {
    // Both handlers read the order OUTSIDE their transaction, decide what to do from that
    // stale snapshot, then write unconditionally. Interleaving: both read PENDING_PAYMENT →
    // confirm deducts stock+reservation → cancel "releases the reservation" a second time.
    const { variant } = await setupShop(100);
    const admin = await createAdmin();
    const violations: unknown[] = [];

    for (let i = 0; i < ITER; i += 1) {
      const before = await variantStock(variant.id);
      const orderId = await pendingTransferOrder(variant.id, 1);

      const [confirm, cancel] = await Promise.all([
        call('patch', `/api/v1/orders/admin/${orderId}/confirm-payment`, { token: admin.token }),
        call('patch', `/api/v1/orders/admin/${orderId}/cancel`, { token: admin.token }),
      ]);

      const after = await variantStock(variant.id);
      const order = await orderRow(orderId);
      // Expected final stock given the final status (I6). CANCELLED after a confirm is a legal
      // transition (CONFIRMED → CANCELLED) and must return the unit to stockQuantity.
      const expected =
        order.orderStatus === 'CONFIRMED'
          ? { stock: before.stock - 1, reserved: before.reserved }
          : { stock: before.stock, reserved: before.reserved };
      if (after.stock !== expected.stock || after.reserved !== expected.reserved) {
        violations.push({ iteration: i, status: order.orderStatus, confirm: confirm.status, cancel: cancel.status, before, after, expected });
      }
    }

    expect(violations, 'stock drifted away from what the final order status says').toEqual([]);
    await expectStockSane(variant.id);
  });
});

// ---------------------------------------------------------------------------------------------
// L3 — high contention: many requests on one row at the same instant.
// ---------------------------------------------------------------------------------------------
describe('L3 high contention', () => {
  it(`never oversells under a COD flash sale: 30 buyers, 10 units, repeated ${ITER}x (I1, I3, I7)`, async () => {
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const { variant } = await setupShop(10);
      const users = await customersWithCart(30, variant.id, 1);

      const responses = await Promise.all(users.map((u) => checkout(u.token)));

      const hist = statusHistogram(responses);
      const { stock, reserved } = await variantStock(variant.id);
      const orders = await countRows('OrderItem', `"variantId" = $1`, [variant.id]);
      const outOfStockOnly = responses.filter((r) => r.status === 409).every((r) => r.body.error.code === 'OUT_OF_STOCK');
      if (hist[201] !== 10 || hist[409] !== 20 || stock !== 0 || reserved !== 0 || orders !== 10 || !outOfStockOnly) {
        failures.push({ iteration: i, hist, stock, reserved, orders });
      }
    }
    expect(failures).toEqual([]);
  });

  it(`never over-reserves under a bank-transfer rush: 30 buyers, 10 units, repeated ${ITER}x (I2, I4)`, async () => {
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const { variant } = await setupShop(10);
      const users = await customersWithCart(30, variant.id, 1);

      const responses = await Promise.all(users.map((u) => checkout(u.token, 'BANK_TRANSFER')));

      const hist = statusHistogram(responses);
      const { stock, reserved } = await variantStock(variant.id);
      const pending = await countRows('Order', `"orderStatus" = 'PENDING_PAYMENT'`);
      if (hist[201] !== 10 || stock !== 10 || reserved !== 10 || pending !== 10) {
        failures.push({ iteration: i, hist, stock, reserved, pending });
      }
      await pool.query('TRUNCATE "Order", "OrderItem", "CartItem", "Cart" CASCADE');
    }
    expect(failures).toEqual([]);
  });

  it('mixed quantities (1, 3, 7) against 10 units never sell more than 10 and never split an order', async () => {
    for (let i = 0; i < ITER; i += 1) {
      const { variant } = await setupShop(10);
      const users = [
        ...(await customersWithCart(4, variant.id, 1)),
        ...(await customersWithCart(4, variant.id, 3)),
        ...(await customersWithCart(4, variant.id, 7)),
      ];

      await Promise.all(users.map((u) => checkout(u.token)));

      const { rows } = await pool.query<{ sold: string | null }>(
        `SELECT sum(quantity)::text AS sold FROM "OrderItem" WHERE "variantId" = $1`,
        [variant.id],
      );
      const sold = Number(rows[0].sold ?? 0);
      const { stock } = await variantStock(variant.id);
      expect(sold).toBeLessThanOrEqual(10);
      expect(sold + stock).toBe(10); // I3: nothing created, nothing lost
      // every order line holds its FULL requested quantity (no partial fulfilment)
      const { rows: lines } = await pool.query<{ quantity: number }>(`SELECT quantity FROM "OrderItem"`);
      for (const l of lines) expect([1, 3, 7]).toContain(l.quantity);
      await pool.query('TRUNCATE "Order", "OrderItem", "CartItem", "Cart" CASCADE');
    }
  });

  it('overlapping multi-item orders do not deadlock (lines are locked in id order)', async () => {
    // 20 orders each containing BOTH variants. If lines were locked in cart order, half the
    // carts listing (A, B) and half listing (B, A) would deadlock and PostgreSQL would kill
    // some of them (40P01 → 500). The controller sorts by variant id, so all must succeed.
    const { child } = await createBrand();
    const p = await createProduct(child.id, { variants: [{ stock: 100 }, { stock: 100 }] });
    const [a, b] = p.variants;
    const users = [];
    for (let i = 0; i < 20; i += 1) {
      const u = await createUser();
      // alternate the insertion order of the cart lines
      await fillCart(u.id, i % 2 ? [{ variantId: a.id, quantity: 1 }, { variantId: b.id, quantity: 1 }]
                                  : [{ variantId: b.id, quantity: 1 }, { variantId: a.id, quantity: 1 }]);
      users.push(u);
    }

    const responses = await Promise.all(users.map((u) => checkout(u.token)));

    expect(statusHistogram(responses)).toEqual({ 201: 20 });
    expect(await variantStock(a.id)).toEqual({ stock: 80, reserved: 0 });
    expect(await variantStock(b.id)).toEqual({ stock: 80, reserved: 0 });
  });

  it('records latency percentiles for N = 10 / 30 / 60 concurrent checkouts', async () => {
    // Not a pass/fail gate on speed — a measurement for the report. A p95 that explodes as N
    // grows means requests are queueing (pool of 10) or a lock is wider than one row.
    const result: Record<number, { p50: number; p95: number; statuses: Record<number, number> }> = {};
    for (const n of [10, 30, 60]) {
      const { variant } = await setupShop(n);
      const users = await customersWithCart(n, variant.id, 1);
      const timings: number[] = [];
      const responses = await Promise.all(
        users.map(async (u) => {
          const t = Date.now();
          const r = await checkout(u.token);
          timings.push(Date.now() - t);
          return r;
        }),
      );
      result[n] = { ...percentiles(timings), statuses: statusHistogram(responses) };
      await pool.query('TRUNCATE "Order", "OrderItem", "CartItem", "Cart" CASCADE');
    }
    writeMetric('checkout-latency', result);
    for (const n of [10, 30, 60]) expect(result[n].statuses[201]).toBe(n);
  });
});

// ---------------------------------------------------------------------------------------------
// L4 — infrastructure failures.
// ---------------------------------------------------------------------------------------------
describe('L4 infrastructure failures', () => {
  it('a burst larger than the connection pool (100 buyers, pool of 10) answers only 201/409, never 500 (I7)', async () => {
    // Prisma waits at most `maxWait` (2 s by default) to get a connection for an interactive
    // transaction. 100 checkouts at once on 10 connections can exceed that, and the resulting
    // P2028 error is not mapped by errorHandler → 500. A customer would see "server error"
    // for what is really "we are busy" (should be 503 + retry, or simply wait).
    const { variant } = await setupShop(20);
    const users = await customersWithCart(100, variant.id, 1);

    const responses = await Promise.all(users.map((u) => checkout(u.token)));

    const hist = statusHistogram(responses);
    const { stock } = await variantStock(variant.id);
    // whatever the statuses, stock must stay exact (I3)
    expect(stock + (await countRows('Order'))).toBe(20);
    expect(Object.keys(hist).sort(), `statuses seen: ${JSON.stringify(hist)}`).toEqual(['201', '409']);
  });

  it('a connection killed in the middle of the checkout transaction leaves no half-written order and the pool recovers', async () => {
    const { variant } = await setupShop(5);
    const [u, v] = await customersWithCart(2, variant.id, 1);

    // 1. Hold the row lock so the checkout transaction stops INSIDE its first UPDATE.
    heldClient = await pool.connect();
    await heldClient.query('BEGIN');
    await heldClient.query(`SELECT 1 FROM "ProductVariant" WHERE id = $1 FOR UPDATE`, [variant.id]);
    const pending = checkout(u.token).then((r) => r);
    expect(await isBlocked(pending, 500)).toBe(true);

    // 2. Find the app's backend that is waiting on that lock and terminate it, exactly as a
    //    database failover or a network cut would.
    const { rows } = await pool.query<{ pid: number }>(
      `SELECT pid FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE '%ProductVariant%' AND pid <> pg_backend_pid()`,
    );
    expect(rows.length).toBe(1);
    await pool.query('SELECT pg_terminate_backend($1)', [rows[0].pid]);
    await heldClient.query('ROLLBACK');
    heldClient.release();
    heldClient = null;

    // 3. The request must END (no hang) with a server error in the standard envelope …
    const res = await pending;
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.error).toBeTruthy();
    // … nothing was half-written …
    expect(await countRows('Order')).toBe(0);
    expect(await variantStock(variant.id)).toEqual({ stock: 5, reserved: 0 });
    // … and the next customer is served normally on a fresh connection.
    expect((await checkout(v.token)).status).toBe(201);
  });
});

// ---------------------------------------------------------------------------------------------
// L5 — chaos & repetition: double submits, retries, overlapping jobs.
// ---------------------------------------------------------------------------------------------
describe('L5 chaos and repetition', () => {
  it('the same customer double-clicking "Đặt hàng" gets ONE order, not two (I5)', async () => {
    // createOrder reads the cart OUTSIDE the transaction, so two simultaneous submits both see
    // the full cart, both claim stock and both create an order; the cart is emptied once.
    // There is no Idempotency-Key and no lock on the cart row.
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const { variant } = await setupShop(10);
      const [u] = await customersWithCart(1, variant.id, 1);

      const responses = await Promise.all([checkout(u.token), checkout(u.token)]);

      const orders = await countRows('Order', `"userId" = $1`, [u.id]);
      const { stock } = await variantStock(variant.id);
      if (orders !== 1 || stock !== 9) failures.push({ iteration: i, orders, stock, statuses: statusHistogram(responses) });
    }
    expect(failures, 'duplicate orders created from one cart').toEqual([]);
  });

  it('a retry storm (5 identical submits while the first is still running) still yields one order', async () => {
    const { variant } = await setupShop(10);
    const [u] = await customersWithCart(1, variant.id, 2);

    const responses = await Promise.all(Array.from({ length: 5 }, () => checkout(u.token)));

    expect(statusHistogram(responses)[201]).toBe(1);
    expect(await countRows('Order')).toBe(1);
    expect(await variantStock(variant.id)).toEqual({ stock: 8, reserved: 0 });
  });

  it('confirm-payment sent twice at once (double click / webhook retry) deducts stock once', async () => {
    const { variant } = await setupShop(100);
    const admin = await createAdmin();
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const before = await variantStock(variant.id);
      const orderId = await pendingTransferOrder(variant.id, 1);

      const responses = await Promise.all([
        call('patch', `/api/v1/orders/admin/${orderId}/confirm-payment`, { token: admin.token }),
        call('patch', `/api/v1/orders/admin/${orderId}/confirm-payment`, { token: admin.token }),
      ]);

      const after = await variantStock(variant.id);
      const hist = statusHistogram(responses);
      if (after.stock !== before.stock - 1 || after.reserved !== before.reserved || hist[200] !== 1 || hist[409] !== 1) {
        failures.push({ iteration: i, before, after, hist });
      }
    }
    expect(failures, 'payment applied twice').toEqual([]);
    await expectStockSane(variant.id);
  });

  it('cancel sent twice at once releases the reservation once', async () => {
    const { variant } = await setupShop(100);
    const admin = await createAdmin();
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const orderId = await pendingTransferOrder(variant.id, 1);
      const responses = await Promise.all([
        call('patch', `/api/v1/orders/admin/${orderId}/cancel`, { token: admin.token }),
        call('patch', `/api/v1/orders/admin/${orderId}/cancel`, { token: admin.token }),
      ]);
      const after = await variantStock(variant.id);
      if (after.reserved !== 0 || after.stock !== 100) failures.push({ iteration: i, after, hist: statusHistogram(responses) });
    }
    expect(failures, 'reservation released twice').toEqual([]);
  });

  it('two sweeper instances running at once release each expired order exactly once', async () => {
    const { variant } = await setupShop(100);
    const ids = [];
    for (let i = 0; i < 10; i += 1) ids.push(await pendingTransferOrder(variant.id, 1));
    await pool.query(`UPDATE "Order" SET "expiresAt" = now() - interval '1 minute'`);

    const [a, b] = await Promise.all([releaseExpiredOrders(), releaseExpiredOrders()]);

    expect(a + b).toBe(10); // each order counted by exactly one instance
    expect(await variantStock(variant.id)).toEqual({ stock: 100, reserved: 0 });
    expect(await countRows('Order', `"orderStatus" = 'CANCELLED' AND "paymentStatus" = 'EXPIRED'`)).toBe(10);
  });

  it('an admin cancelling an order while the sweeper expires it does not release the stock twice', async () => {
    const { variant } = await setupShop(100);
    const admin = await createAdmin();
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const orderId = await pendingTransferOrder(variant.id, 1);
      await pool.query(`UPDATE "Order" SET "expiresAt" = now() - interval '1 minute' WHERE id = $1`, [orderId]);

      const [cancel] = await Promise.all([
        call('patch', `/api/v1/orders/admin/${orderId}/cancel`, { token: admin.token }),
        releaseExpiredOrders(),
      ]);

      const after = await variantStock(variant.id);
      if (after.reserved !== 0 || after.stock !== 100) failures.push({ iteration: i, after, cancel: cancel.status });
    }
    expect(failures).toEqual([]);
  });

  it('an admin confirming a payment while the sweeper expires the same order ends in ONE consistent state', async () => {
    // Worst case seen in review: the sweeper cancels and releases the reservation, then the
    // confirm (which read PENDING_PAYMENT earlier) deducts stock AND the reservation again and
    // overwrites the status to CONFIRMED/PAID. Result: an order marked paid whose stock was
    // given back, and reservedQuantity below zero.
    const { variant } = await setupShop(100);
    const admin = await createAdmin();
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const before = await variantStock(variant.id);
      const orderId = await pendingTransferOrder(variant.id, 1);
      await pool.query(`UPDATE "Order" SET "expiresAt" = now() - interval '1 minute' WHERE id = $1`, [orderId]);

      await Promise.all([
        call('patch', `/api/v1/orders/admin/${orderId}/confirm-payment`, { token: admin.token }),
        releaseExpiredOrders(),
      ]);

      const after = await variantStock(variant.id);
      const order = await orderRow(orderId);
      const consistent =
        (order.orderStatus === 'CONFIRMED' && order.paymentStatus === 'PAID' && after.stock === before.stock - 1 && after.reserved === before.reserved) ||
        (order.orderStatus === 'CANCELLED' && order.paymentStatus === 'EXPIRED' && after.stock === before.stock && after.reserved === before.reserved);
      if (!consistent) failures.push({ iteration: i, status: `${order.orderStatus}/${order.paymentStatus}`, before, after });
    }
    expect(failures).toEqual([]);
    await expectStockSane(variant.id);
  });
});
