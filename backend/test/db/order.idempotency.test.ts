import { describe, expect, it } from 'vitest';
import { countRows, variantStock } from './helpers/db';
import { call } from './helpers/http';
import { ITER, statusHistogram } from './helpers/concurrency';
import { createBrand, createProduct, createUser, fillCart, orderBody } from './helpers/factories';

// =============================================================================================
// Idempotent checkout with the Idempotency-Key header (pattern borrowed from Medusa's
// completeCartWorkflow, which locks the cart and returns the order already linked to it).
//
// Contract (routes/order.route.ts, controllers/order.controller.ts):
//   - the header is optional, 8–100 chars of [A-Za-z0-9_-];
//   - first request with a key creates the order → 201;
//   - any later request with the SAME key from the SAME user returns that same order → 200,
//     creates nothing and touches no stock, whatever its body says;
//   - keys are scoped per user: another user's identical key is a different attempt;
//   - without a key the behaviour is unchanged (a repeat after success → 422 CART_EMPTY).
// =============================================================================================

async function shopper(stock = 10, quantity = 1) {
  const { child } = await createBrand();
  const product = await createProduct(child.id, { variants: [{ stock, price: 60_000 }] });
  const user = await createUser();
  await fillCart(user.id, [{ variantId: product.variants[0].id, quantity }]);
  return { user, variant: product.variants[0] };
}

const checkout = (token: string, key?: string, method: 'COD' | 'BANK_TRANSFER' = 'COD') => {
  const req = call('post', '/api/v1/orders', { token });
  return (key ? req.set('Idempotency-Key', key) : req).send(orderBody(method));
};

describe('Idempotency-Key on POST /orders', () => {
  it(`a double click with the same key yields ONE order and BOTH responses carry it — ${ITER}x`, async () => {
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const { user, variant } = await shopper(10, 1);
      const key = `checkout-attempt-${i}`;

      const responses = await Promise.all([checkout(user.token, key), checkout(user.token, key)]);

      const ids = new Set(responses.map((r) => r.body.data?.id));
      const hist = statusHistogram(responses);
      const orders = await countRows('Order', `"userId" = $1`, [user.id]);
      const { stock } = await variantStock(variant.id);
      // one creates (201), the other waits on the cart lock and replays it (200)
      if (ids.size !== 1 || ids.has(undefined) || hist[201] !== 1 || hist[200] !== 1 || orders !== 1 || stock !== 9) {
        failures.push({ iteration: i, hist, distinctOrderIds: ids.size, orders, stock });
      }
    }
    expect(failures).toEqual([]);
  });

  it('a retry storm (5 submits, same key) returns the same order five times', async () => {
    const { user, variant } = await shopper(10, 2);
    const responses = await Promise.all(Array.from({ length: 5 }, () => checkout(user.token, 'storm-key-0001')));

    expect(responses.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(new Set(responses.map((r) => r.body.data.code)).size).toBe(1);
    expect(await countRows('Order')).toBe(1);
    expect(await variantStock(variant.id)).toEqual({ stock: 8, reserved: 0 });
  });

  it('a retry long after success (same key) answers 200 with the original order', async () => {
    const { user } = await shopper();
    const first = await checkout(user.token, 'late-retry-key');
    const again = await checkout(user.token, 'late-retry-key');

    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ id: first.body.data.id, code: first.body.data.code, grandTotal: 60_000 });
  });

  it('a bank-transfer replay does not reserve the stock a second time', async () => {
    const { user, variant } = await shopper(10, 3);
    await checkout(user.token, 'transfer-key-01', 'BANK_TRANSFER');
    const replay = await checkout(user.token, 'transfer-key-01', 'BANK_TRANSFER');

    expect(replay.status).toBe(200);
    expect(await variantStock(variant.id)).toEqual({ stock: 10, reserved: 3 });
  });

  it('a NEW key after a successful checkout is a new attempt: empty cart → 422 CART_EMPTY', async () => {
    const { user } = await shopper();
    expect((await checkout(user.token, 'first-attempt')).status).toBe(201);
    const second = await checkout(user.token, 'second-attempt');
    expect(second.status).toBe(422);
    expect(second.body.error.code).toBe('CART_EMPTY');
  });

  it('reusing a key with a refilled cart returns the OLD order and leaves the new cart untouched', async () => {
    const { user, variant } = await shopper(10, 1);
    const first = await checkout(user.token, 'reused-key-001');
    await fillCart(user.id, [{ variantId: variant.id, quantity: 4 }]);

    const reused = await checkout(user.token, 'reused-key-001');

    expect(reused.status).toBe(200);
    expect(reused.body.data.id).toBe(first.body.data.id);
    expect(await countRows('Order')).toBe(1);
    expect(await countRows('CartItem')).toBe(1); // the 4 units are still waiting in the cart
    expect(await variantStock(variant.id)).toEqual({ stock: 9, reserved: 0 });
  });

  it("another user's identical key is a separate attempt and never exposes the first user's order", async () => {
    const a = await shopper();
    const b = await createUser();
    await fillCart(b.id, [{ variantId: a.variant.id, quantity: 1 }]);

    const orderA = await checkout(a.user.token, 'shared-key-123');
    const orderB = await checkout(b.token, 'shared-key-123');

    expect(orderA.status).toBe(201);
    expect(orderB.status).toBe(201);
    expect(orderB.body.data.id).not.toBe(orderA.body.data.id);
    expect(orderB.body.data.userId).toBe(b.id);
  });

  it.each([
    ['too short', 'abc'],
    ['too long', 'k'.repeat(101)],
    ['with spaces', 'has spaces here'],
    ['with SQL', "x' OR 1=1 --"],
  ])('rejects a key that is %s with 422 and creates nothing', async (_name, key) => {
    const { user, variant } = await shopper();
    const res = await checkout(user.token, key);
    expect(res.status).toBe(422);
    expect(await countRows('Order')).toBe(0);
    expect(await variantStock(variant.id)).toEqual({ stock: 10, reserved: 0 });
  });

  it('without a key the old behaviour holds: the repeat after success is 422 CART_EMPTY', async () => {
    const { user } = await shopper();
    expect((await checkout(user.token)).status).toBe(201);
    expect((await checkout(user.token)).body.error.code).toBe('CART_EMPTY');
  });
});
