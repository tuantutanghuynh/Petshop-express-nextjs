import { describe, expect, it } from 'vitest';
import { pool, variantStock } from './helpers/db';
import { call } from './helpers/http';
import { ITER, statusHistogram } from './helpers/concurrency';
import { createAdmin, createBrand, createProduct, createUser, fillCart, orderBody } from './helpers/factories';
import { releaseExpiredOrders } from '../../workers/releaseExpiredOrders';

// =============================================================================================
// Inventory ledger (decision 2026-10-18, ADR-007): stock is changed by DELTAS and every change of
// the physical stock is written to "InventoryMovement" in the same transaction.
//
// Spec
//   - Admin adjusts with POST /api/v1/products/variants/:id/stock-movements
//       { type: 'ADJUST', delta: ±n (≠ 0, integer), reason: PURCHASE|DAMAGED|RETURN|OTHER, note? }
//       { type: 'STOCKTAKE', countedQuantity: n ≥ 0, note? }  → delta = counted − current
//     Stock may never drop below the units reserved for pending orders (409 STOCK_BELOW_RESERVED).
//   - Automatic movements: product / variant creation → OPENING; COD checkout and confirmed bank
//     transfer → SALE (−qty, with orderId); cancelling an order whose stock was already deducted →
//     CANCEL_RESTOCK (+qty). Reserving / releasing a hold is NOT a stock movement.
//   - PATCH /products/variants/:id no longer accepts stockQuantity (422) — absolute overwrites were
//     the lost-update bug: they erased sales that happened between reading and writing.
//   - GET /api/v1/products/variants/:id/stock-movements lists the ledger, newest first (admin).
//   - INVARIANT, checked after every scenario: sum(delta) of a variant == its stockQuantity, and
//     every movement's quantityAfter equals the running total at that point.
// =============================================================================================

type Movement = { delta: number; reason: string; quantityAfter: number; orderId: string | null; userId: string | null; note: string | null };

async function movements(variantId: string): Promise<Movement[]> {
  const { rows } = await pool.query<Movement>(
    `SELECT delta, reason, "quantityAfter", "orderId", "userId", note FROM "InventoryMovement"
     WHERE "variantId" = $1 ORDER BY seq`,
    [variantId],
  );
  return rows;
}

// The ledger must explain the stock exactly, and each row must record the stock right after it.
async function expectLedgerMatchesStock(variantId: string) {
  const rows = await movements(variantId);
  const { stock } = await variantStock(variantId);
  const sum = rows.reduce((s, r) => s + r.delta, 0);
  expect({ ledgerSum: sum, stock }, 'sum of ledger deltas must equal stockQuantity').toEqual({ ledgerSum: stock, stock });
  const { rows: ordered } = await pool.query<{ ok: boolean }>(
    `SELECT bool_and(running = "quantityAfter") AS ok FROM (
       SELECT "quantityAfter", sum(delta) OVER (ORDER BY seq) AS running
       FROM "InventoryMovement" WHERE "variantId" = $1) t`,
    [variantId],
  );
  // quantityAfter is checked per row only when rows were written strictly in commit order;
  // concurrent writers serialise on the variant row lock, so this must hold as well.
  expect(ordered[0].ok ?? true).toBe(true);
}

const adjust = (token: string, variantId: string, body: Record<string, unknown>) =>
  call('post', `/api/v1/products/variants/${variantId}/stock-movements`, { token, brand: null }).send(body);

async function shop(stock = 10) {
  const { child } = await createBrand();
  const product = await createProduct(child.id, { variants: [{ stock, price: 40_000 }] });
  return { variant: product.variants[0], product };
}

async function buyer(variantId: string, quantity = 1) {
  const u = await createUser();
  await fillCart(u.id, [{ variantId, quantity }]);
  return u;
}

describe('opening balance', () => {
  it('creating a product through the API records an OPENING movement per variant, by the admin', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    const res = await call('post', '/api/v1/products', { token: admin.token, brand: null }).send({
      categoryId: child.id, name: 'Hạt mèo', slug: 'hat-meo-opening', status: 'active',
      variants: [{ sku: 'OPEN-1', price: 1000, stockQuantity: 12 }, { sku: 'OPEN-2', price: 2000 }],
    });
    expect(res.status).toBe(201);
    const [v1, v2] = res.body.data.variants as { id: string; sku: string }[];
    const byId = Object.fromEntries([[v1.sku, v1.id], [v2.sku, v2.id]]);
    expect(await movements(byId['OPEN-1'])).toEqual([{ delta: 12, reason: 'OPENING', quantityAfter: 12, orderId: null, userId: admin.id, note: null }]);
    expect(await movements(byId['OPEN-2'])).toEqual([{ delta: 0, reason: 'OPENING', quantityAfter: 0, orderId: null, userId: admin.id, note: null }]);
  });

  it('adding a variant records its OPENING movement', async () => {
    const admin = await createAdmin();
    const { product } = await shop(5);
    const res = await call('post', `/api/v1/products/${product.id}/variants`, { token: admin.token, brand: null }).send({ sku: 'ADD-OPEN', price: 500, stockQuantity: 7 });
    expect(res.status).toBe(201);
    expect(await movements(res.body.data.id)).toMatchObject([{ delta: 7, reason: 'OPENING', quantityAfter: 7, userId: admin.id }]);
  });
});

describe('admin adjustments (ADJUST by delta)', () => {
  it('+50 for a purchase raises stock by 50 and records who, why and the note', async () => {
    const admin = await createAdmin();
    const { variant } = await shop(10);
    const res = await adjust(admin.token, variant.id, { type: 'ADJUST', delta: 50, reason: 'PURCHASE', note: 'Nhập lô 18/10' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ stockQuantity: 60, reservedQuantity: 0 });
    expect((await movements(variant.id)).at(-1)).toEqual({ delta: 50, reason: 'PURCHASE', quantityAfter: 60, orderId: null, userId: admin.id, note: 'Nhập lô 18/10' });
    await expectLedgerMatchesStock(variant.id);
  });

  it('−3 for damaged goods lowers stock by 3', async () => {
    const admin = await createAdmin();
    const { variant } = await shop(10);
    expect((await adjust(admin.token, variant.id, { type: 'ADJUST', delta: -3, reason: 'DAMAGED' })).status).toBe(201);
    expect(await variantStock(variant.id)).toEqual({ stock: 7, reserved: 0 });
    await expectLedgerMatchesStock(variant.id);
  });

  it('cannot take stock below the units reserved for pending orders (409) and writes nothing', async () => {
    const admin = await createAdmin();
    const { variant } = await shop(10);
    const u = await buyer(variant.id, 6);
    await call('post', '/api/v1/orders', { token: u.token }).send(orderBody('BANK_TRANSFER')); // reserves 6
    const before = await movements(variant.id);

    const res = await adjust(admin.token, variant.id, { type: 'ADJUST', delta: -5, reason: 'DAMAGED' }); // 10−5 = 5 < 6
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STOCK_BELOW_RESERVED');
    expect(await variantStock(variant.id)).toEqual({ stock: 10, reserved: 6 });
    expect(await movements(variant.id)).toEqual(before);
  });

  it.each([
    ['delta 0', { type: 'ADJUST', delta: 0, reason: 'OTHER' }],
    ['decimal delta', { type: 'ADJUST', delta: 1.5, reason: 'OTHER' }],
    ['delta as text', { type: 'ADJUST', delta: 'mười', reason: 'OTHER' }],
    ['huge delta', { type: 'ADJUST', delta: 3_000_000_000, reason: 'PURCHASE' }],
    ['unknown reason', { type: 'ADJUST', delta: 1, reason: 'STOLEN_BY_CAT' }],
    ['reason reserved for the system', { type: 'ADJUST', delta: 1, reason: 'SALE' }],
    ['missing type', { delta: 1, reason: 'OTHER' }],
    ['note of 501 chars', { type: 'ADJUST', delta: 1, reason: 'OTHER', note: 'n'.repeat(501) }],
    ['negative stocktake', { type: 'STOCKTAKE', countedQuantity: -1 }],
    ['stocktake without a count', { type: 'STOCKTAKE' }],
  ])('rejects %s with 422 and changes nothing', async (_name, body) => {
    const admin = await createAdmin();
    const { variant } = await shop(10);
    const res = await adjust(admin.token, variant.id, body);
    expect(res.status).toBe(422);
    expect(await variantStock(variant.id)).toEqual({ stock: 10, reserved: 0 });
  });

  it('customers cannot adjust stock (403); unknown variant → 404', async () => {
    const admin = await createAdmin();
    const { variant } = await shop(10);
    const u = await createUser();
    expect((await adjust(u.token, variant.id, { type: 'ADJUST', delta: 1, reason: 'OTHER' })).status).toBe(403);
    const missing = await adjust(admin.token, '00000000-0000-0000-0000-000000000000', { type: 'ADJUST', delta: 1, reason: 'OTHER' });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('VARIANT_NOT_FOUND');
  });
});

describe('stocktake (STOCKTAKE by counted quantity)', () => {
  it('counting 7 where the system says 10 records −3 and sets stock to 7', async () => {
    const admin = await createAdmin();
    const { variant } = await shop(10);
    const res = await adjust(admin.token, variant.id, { type: 'STOCKTAKE', countedQuantity: 7, note: 'Kiểm kê tháng 10' });
    expect(res.status).toBe(201);
    expect((await movements(variant.id)).at(-1)).toMatchObject({ delta: -3, reason: 'STOCKTAKE', quantityAfter: 7, userId: admin.id });
    await expectLedgerMatchesStock(variant.id);
  });

  it('a count equal to the system stock is recorded as a 0 movement (the check happened)', async () => {
    const admin = await createAdmin();
    const { variant } = await shop(10);
    expect((await adjust(admin.token, variant.id, { type: 'STOCKTAKE', countedQuantity: 10 })).status).toBe(201);
    expect((await movements(variant.id)).at(-1)).toMatchObject({ delta: 0, reason: 'STOCKTAKE', quantityAfter: 10 });
  });

  it('a count below the reserved units is refused (409)', async () => {
    const admin = await createAdmin();
    const { variant } = await shop(10);
    const u = await buyer(variant.id, 4);
    await call('post', '/api/v1/orders', { token: u.token }).send(orderBody('BANK_TRANSFER'));
    expect((await adjust(admin.token, variant.id, { type: 'STOCKTAKE', countedQuantity: 3 })).status).toBe(409);
  });
});

describe('automatic movements from orders', () => {
  it('a COD checkout records SALE −qty linked to the order', async () => {
    const { variant } = await shop(10);
    const u = await buyer(variant.id, 3);
    const order = (await call('post', '/api/v1/orders', { token: u.token }).send(orderBody('COD'))).body.data;
    expect((await movements(variant.id)).at(-1)).toEqual({ delta: -3, reason: 'SALE', quantityAfter: 7, orderId: order.id, userId: null, note: null });
    await expectLedgerMatchesStock(variant.id);
  });

  it('a bank-transfer reservation is NOT a movement; confirming the payment is the SALE', async () => {
    const admin = await createAdmin();
    const { variant } = await shop(10);
    const u = await buyer(variant.id, 2);
    const order = (await call('post', '/api/v1/orders', { token: u.token }).send(orderBody('BANK_TRANSFER'))).body.data;
    expect((await movements(variant.id)).map((m) => m.reason)).toEqual(['OPENING']);

    await call('patch', `/api/v1/orders/admin/${order.id}/confirm-payment`, { token: admin.token });
    expect((await movements(variant.id)).at(-1)).toMatchObject({ delta: -2, reason: 'SALE', quantityAfter: 8, orderId: order.id, userId: admin.id });
    await expectLedgerMatchesStock(variant.id);
  });

  it('cancelling a confirmed order puts the units back as CANCEL_RESTOCK; cancelling a hold writes nothing', async () => {
    const admin = await createAdmin();
    const { variant } = await shop(10);
    const cod = (await call('post', '/api/v1/orders', { token: (await buyer(variant.id, 2)).token }).send(orderBody('COD'))).body.data;
    const hold = (await call('post', '/api/v1/orders', { token: (await buyer(variant.id, 1)).token }).send(orderBody('BANK_TRANSFER'))).body.data;

    await call('patch', `/api/v1/orders/admin/${cod.id}/cancel`, { token: admin.token });
    await call('patch', `/api/v1/orders/admin/${hold.id}/cancel`, { token: admin.token });

    expect((await movements(variant.id)).map((m) => [m.reason, m.delta])).toEqual([['OPENING', 10], ['SALE', -2], ['CANCEL_RESTOCK', 2]]);
    await expectLedgerMatchesStock(variant.id);
  });

  it('the expiry sweeper releases holds without writing movements', async () => {
    const { variant } = await shop(10);
    await call('post', '/api/v1/orders', { token: (await buyer(variant.id, 1)).token }).send(orderBody('BANK_TRANSFER'));
    await pool.query(`UPDATE "Order" SET "expiresAt" = (now() AT TIME ZONE 'UTC') - interval '1 minute'`);
    expect(await releaseExpiredOrders()).toBe(1);
    expect((await movements(variant.id)).map((m) => m.reason)).toEqual(['OPENING']);
  });

  it('a failed checkout (out of stock) leaves no movement behind', async () => {
    const { variant } = await shop(1);
    const u = await buyer(variant.id, 5);
    expect((await call('post', '/api/v1/orders', { token: u.token }).send(orderBody('COD'))).status).toBe(409);
    expect((await movements(variant.id)).map((m) => m.reason)).toEqual(['OPENING']);
  });
});

describe('concurrency — the reason this design exists', () => {
  it(`an admin +50 delivery racing 20 COD buyers never loses a sale or the delivery — ${ITER}x`, async () => {
    const admin = await createAdmin();
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const { variant } = await shop(10);
      const buyers = [];
      for (let k = 0; k < 20; k += 1) buyers.push(await buyer(variant.id, 1));

      const [adj, ...orders] = await Promise.all([
        adjust(admin.token, variant.id, { type: 'ADJUST', delta: 50, reason: 'PURCHASE' }),
        ...buyers.map((b) => call('post', '/api/v1/orders', { token: b.token }).send(orderBody('COD'))),
      ]);
      const sold = orders.filter((o) => o.status === 201).length;
      const { stock } = await variantStock(variant.id);
      const rows = await movements(variant.id);
      const sum = rows.reduce((s, r) => s + r.delta, 0);
      if (adj.status !== 201 || stock !== 10 + 50 - sold || sum !== stock || rows.filter((r) => r.reason === 'SALE').length !== sold) {
        failures.push({ iteration: i, adj: adj.status, sold, stock, ledgerSum: sum, statuses: statusHistogram(orders) });
      }
    }
    expect(failures).toEqual([]);
  });

  it('two stocktakes submitted at once both get recorded and the ledger still explains the stock', async () => {
    const admin = await createAdmin();
    for (let i = 0; i < ITER; i += 1) {
      const { variant } = await shop(10);
      const res = await Promise.all([
        adjust(admin.token, variant.id, { type: 'STOCKTAKE', countedQuantity: 8 }),
        adjust(admin.token, variant.id, { type: 'STOCKTAKE', countedQuantity: 9 }),
      ]);
      expect(statusHistogram(res)).toEqual({ 201: 2 });
      expect([8, 9]).toContain((await variantStock(variant.id)).stock);
      await expectLedgerMatchesStock(variant.id);
    }
  });
});

describe('legacy absolute edit and history', () => {
  it('PATCH /products/variants/:id refuses stockQuantity (422) and leaves stock alone; price edits still work', async () => {
    const admin = await createAdmin();
    const { variant } = await shop(10);
    const res = await call('patch', `/api/v1/products/variants/${variant.id}`, { token: admin.token, brand: null }).send({ stockQuantity: 3 });
    expect(res.status).toBe(422);
    expect(await variantStock(variant.id)).toEqual({ stock: 10, reserved: 0 });
    const price = await call('patch', `/api/v1/products/variants/${variant.id}`, { token: admin.token, brand: null }).send({ price: 45_000 });
    expect(price.status).toBe(200);
    expect(price.body.data.price).toBe(45_000);
  });

  it('GET …/stock-movements lists the ledger newest first with pagination (admin only)', async () => {
    const admin = await createAdmin();
    const { variant } = await shop(10);
    await adjust(admin.token, variant.id, { type: 'ADJUST', delta: 5, reason: 'PURCHASE' });
    await adjust(admin.token, variant.id, { type: 'ADJUST', delta: -2, reason: 'DAMAGED' });

    const res = await call('get', `/api/v1/products/variants/${variant.id}/stock-movements?page=1&pageSize=2`, { token: admin.token, brand: null });
    expect(res.status).toBe(200);
    expect(res.body.data.map((m: Movement) => m.reason)).toEqual(['DAMAGED', 'PURCHASE']);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 3 });

    const u = await createUser();
    expect((await call('get', `/api/v1/products/variants/${variant.id}/stock-movements`, { token: u.token, brand: null })).status).toBe(403);
  });
});
