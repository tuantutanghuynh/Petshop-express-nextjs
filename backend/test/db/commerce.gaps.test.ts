import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { pool, countRows, orderRow, variantStock } from './helpers/db';
import { call } from './helpers/http';
import { isBlocked, ITER } from './helpers/concurrency';
import { createAdmin, createBrand, createProduct, createUser, fillCart, orderBody } from './helpers/factories';
import prisma from '../../services/prisma';
import { releaseExpiredOrders, startExpiredOrderSweeper } from '../../workers/releaseExpiredOrders';

// =============================================================================================
// Second pass over the commerce write paths (skills: transaction-race-test, deep-test, TDD).
// The first suites already cover checkout, confirm / cancel, refresh tokens and stock edits. This
// file covers the cases a review of the code found still untested:
//
//   - cart edits racing a checkout. Checkout locks the Cart ROW, but PATCH / DELETE of a cart LINE
//     never take that lock, so they can slip in between "checkout read the lines" and "checkout
//     deleted the lines";
//   - money arithmetic at the Int column limit;
//   - the expiry sweeper's own behaviour (errors, timer, what it must leave alone).
//
// Interleavings are forced, not hoped for: a test holds a row lock on the product variant, which
// parks the checkout transaction INSIDE its stock claim — after it has read the cart, before it
// commits. Whatever the test does in that window is exactly the race.
// =============================================================================================

let held: PoolClient | null = null;

afterEach(async () => {
  vi.restoreAllMocks();
  if (held) {
    await held.query('ROLLBACK').catch(() => undefined);
    held.release();
    held = null;
  }
});

async function shopper(stock = 10, quantity = 1, price = 50_000) {
  const { child } = await createBrand();
  const product = await createProduct(child.id, { variants: [{ stock, price }] });
  const user = await createUser();
  const cart = await fillCart(user.id, [{ variantId: product.variants[0].id, quantity }]);
  const line = await prisma.cartItem.findFirstOrThrow({ where: { cartId: cart.id } });
  return { user, variant: product.variants[0], lineId: line.id };
}

// Locks the variant row from a separate connection. A checkout started afterwards reads the cart,
// then blocks on its first `UPDATE "ProductVariant"`: the cart has been read but not yet emptied.
async function parkCheckoutInsideStockClaim(variantId: string) {
  held = await pool.connect();
  await held.query('BEGIN');
  await held.query(`SELECT 1 FROM "ProductVariant" WHERE id = $1 FOR UPDATE`, [variantId]);
}

async function releaseParkedCheckout() {
  await held!.query('ROLLBACK');
  held!.release();
  held = null;
}

async function cartLines(userId: string) {
  const { rows } = await pool.query<{ variantId: string; quantity: number }>(
    `SELECT ci."variantId", ci.quantity FROM "CartItem" ci JOIN "Cart" c ON c.id = ci."cartId" WHERE c."userId" = $1`,
    [userId],
  );
  return rows;
}

describe('L2 race — cart edits during a checkout', () => {
  it('changing a quantity while checkout runs is never silently lost', async () => {
    // Invariant: a PATCH that answered 200 with quantity 3 must end up somewhere — in the order
    // (if it got in before checkout read the cart) or still in the cart. Losing it means the
    // customer saw "3" on screen and received an order for 1.
    const { user, variant, lineId } = await shopper(10, 1);
    await parkCheckoutInsideStockClaim(variant.id);

    const pending = call('post', '/api/v1/orders', { token: user.token }).send(orderBody('COD')).then((r) => r);
    expect(await isBlocked(pending, 400)).toBe(true); // checkout has read the cart and is waiting

    const patchPending = call('patch', `/api/v1/cart/items/${lineId}`, { token: user.token }).send({ quantity: 3 }).then((r) => r);
    const patchBlocked = await isBlocked(patchPending, 400);
    await releaseParkedCheckout();
    const [order, patch] = await Promise.all([pending, patchPending]);

    expect(order.status).toBe(201);
    const ordered = order.body.data.items[0].quantity;
    const inCart = (await cartLines(user.id)).find((l) => l.variantId === variant.id)?.quantity;
    if (patch.status === 200) {
      expect({ ordered, inCart, patchBlocked }, 'PATCH answered 200 but its quantity vanished').toSatisfy(
        (s: { ordered: number; inCart?: number }) => s.ordered === 3 || s.inCart === 3,
      );
    } else {
      // the line no longer exists once the checkout committed: a clean 404 is the honest answer
      expect(patch.status).toBe(404);
    }
  });

  it('removing a line while checkout runs does not leave it in the order behind the customer\'s back', async () => {
    const { user, variant, lineId } = await shopper(10, 1);
    await parkCheckoutInsideStockClaim(variant.id);

    const pending = call('post', '/api/v1/orders', { token: user.token }).send(orderBody('COD')).then((r) => r);
    expect(await isBlocked(pending, 400)).toBe(true);
    const delPending = call('delete', `/api/v1/cart/items/${lineId}`, { token: user.token }).then((r) => r);
    await isBlocked(delPending, 400);
    await releaseParkedCheckout();
    const [order, del] = await Promise.all([pending, delPending]);

    // Either the delete won (order refused because the cart is empty) or the order won and the
    // delete is told the line is gone. "Đã xoá" + an order containing that item is the bug.
    const deletedOk = del.status === 200;
    const orderContainsIt = order.status === 201 && order.body.data.items.some((i: { variantId: string }) => i.variantId === variant.id);
    expect({ deleteSaid200: deletedOk, orderContainsIt }).not.toEqual({ deleteSaid200: true, orderContainsIt: true });
  });

  it('adding an item while checkout runs keeps the new item in the cart for next time', async () => {
    const { user, variant } = await shopper(10, 1);
    const { child } = await createBrand();
    const other = await createProduct(child.id, { variants: [{ stock: 10 }] });
    await parkCheckoutInsideStockClaim(variant.id);

    const pending = call('post', '/api/v1/orders', { token: user.token }).send(orderBody('COD')).then((r) => r);
    expect(await isBlocked(pending, 400)).toBe(true);
    const addPending = call('post', '/api/v1/cart/items', { token: user.token }).send({ variantId: other.variants[0].id, quantity: 2 }).then((r) => r);
    await isBlocked(addPending, 400);
    await releaseParkedCheckout();
    const [order, add] = await Promise.all([pending, addPending]);

    expect(order.status).toBe(201);
    expect(order.body.data.items.map((i: { variantId: string }) => i.variantId)).toEqual([variant.id]);
    expect(add.status).toBe(201);
    expect(await cartLines(user.id)).toEqual([{ variantId: other.variants[0].id, quantity: 2 }]);
  });

  it(`a burst of quantity changes racing checkouts never yields an order whose lines disagree with stock — ${ITER}x`, async () => {
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const { user, variant, lineId } = await shopper(50, 1);
      const before = await variantStock(variant.id);
      const [order] = await Promise.all([
        call('post', '/api/v1/orders', { token: user.token }).send(orderBody('COD')),
        call('patch', `/api/v1/cart/items/${lineId}`, { token: user.token }).send({ quantity: 4 }),
      ]);
      const after = await variantStock(variant.id);
      const sold = order.status === 201 ? order.body.data.items[0].quantity : 0;
      if (before.stock - after.stock !== sold) failures.push({ iteration: i, sold, before, after });
    }
    expect(failures).toEqual([]);
  });
});

describe('deep-test — money and price edges at checkout', () => {
  it('charges TODAY\'s price, not the price when the item was put in the cart', async () => {
    const { user, variant } = await shopper(10, 2, 50_000);
    await pool.query(`UPDATE "ProductVariant" SET price = 65000 WHERE id = $1`, [variant.id]);
    const res = await call('post', '/api/v1/orders', { token: user.token }).send(orderBody('COD'));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ subtotal: 130_000, grandTotal: 130_000 });
    expect(res.body.data.items[0]).toMatchObject({ unitPrice: 65_000, lineTotal: 130_000 });
  });

  it('an order total beyond the Int column (30.000.000₫ × 99) is refused with a clear 4xx and touches no stock', async () => {
    // price ≤ 2,147,483,647 per variant and quantity ≤ 99 are each valid, but their product is
    // not: 2,970,000,000 does not fit "subtotal" INTEGER, so the INSERT fails inside the
    // transaction. The customer must get an explanation, not a 500, and stock must roll back.
    const { user, variant } = await shopper(200, 99, 30_000_000);
    const res = await call('post', '/api/v1/orders', { token: user.token }).send(orderBody('COD'));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await variantStock(variant.id)).toEqual({ stock: 200, reserved: 0 });
    expect(await countRows('Order')).toBe(0);
  });

  it('an order total exactly at the limit is accepted', async () => {
    const { user } = await shopper(5, 1, 2_147_483_647);
    const res = await call('post', '/api/v1/orders', { token: user.token }).send(orderBody('COD'));
    expect(res.status).toBe(201);
  });
});

describe('deep-test — the expiry sweeper itself', () => {
  async function pendingOrder(quantity = 1) {
    const { user, variant } = await shopper(10, quantity);
    const res = await call('post', '/api/v1/orders', { token: user.token }).send(orderBody('BANK_TRANSFER'));
    expect(res.status).toBe(201);
    return { id: res.body.data.id as string, variant };
  }
  const expire = (id: string) => pool.query(`UPDATE "Order" SET "expiresAt" = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE id = $1`, [id]);

  it('leaves COD orders, paid transfers and not-yet-expired transfers alone', async () => {
    const admin = await createAdmin();
    const cod = await shopper(10, 1);
    const codRes = await call('post', '/api/v1/orders', { token: cod.user.token }).send(orderBody('COD'));
    const paid = await pendingOrder();
    await call('patch', `/api/v1/orders/admin/${paid.id}/confirm-payment`, { token: admin.token });
    const fresh = await pendingOrder();

    expect(await releaseExpiredOrders()).toBe(0);
    expect((await orderRow(codRes.body.data.id)).orderStatus).toBe('CONFIRMED');
    expect((await orderRow(paid.id)).orderStatus).toBe('CONFIRMED');
    expect((await orderRow(fresh.id)).orderStatus).toBe('PENDING_PAYMENT');
  });

  it('cancels an expired order whose variant was deleted (nothing to give back, no crash)', async () => {
    const { id, variant } = await pendingOrder();
    await pool.query(`DELETE FROM "ProductVariant" WHERE id = $1`, [variant.id]);
    await expire(id);
    expect(await releaseExpiredOrders()).toBe(1);
    expect(await orderRow(id)).toMatchObject({ orderStatus: 'CANCELLED', paymentStatus: 'EXPIRED' });
  });

  it('a database error during a sweep is logged, never thrown — a timer callback that rejects would kill the server', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(prisma.order, 'findMany').mockRejectedValueOnce(new Error('connection reset'));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    const timer = startExpiredOrderSweeper();
    clearInterval(timer);
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    process.off('unhandledRejection', unhandled);

    expect(unhandled).not.toHaveBeenCalled();
    expect(logged.mock.calls.flat().join(' ')).toContain('connection reset');
  });

  it('runs once immediately and does not keep the process alive on its own (timer is unref\'d)', async () => {
    const { id } = await pendingOrder();
    await expire(id);
    const timer = startExpiredOrderSweeper();
    clearInterval(timer);
    expect(timer.hasRef()).toBe(false);
    await expect.poll(async () => (await orderRow(id)).orderStatus, { timeout: 3000 }).toBe('CANCELLED');
  });

  it('releases a large backlog (200 expired orders) completely and exactly once', async () => {
    const { child } = await createBrand();
    const product = await createProduct(child.id, { variants: [{ stock: 1000 }] });
    const v = product.variants[0];
    for (let i = 0; i < 200; i += 1) {
      const u = await createUser();
      await fillCart(u.id, [{ variantId: v.id, quantity: 1 }]);
      expect((await call('post', '/api/v1/orders', { token: u.token }).send(orderBody('BANK_TRANSFER'))).status).toBe(201);
    }
    expect(await variantStock(v.id)).toEqual({ stock: 1000, reserved: 200 });
    await pool.query(`UPDATE "Order" SET "expiresAt" = (now() AT TIME ZONE 'UTC') - interval '1 minute'`);

    expect(await releaseExpiredOrders()).toBe(200);
    expect(await variantStock(v.id)).toEqual({ stock: 1000, reserved: 0 });
    expect(await releaseExpiredOrders()).toBe(0);
  });
});
