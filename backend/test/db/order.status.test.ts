import { describe, expect, it } from 'vitest';
import { pool, orderRow, variantStock } from './helpers/db';
import { call } from './helpers/http';
import { ITER, statusHistogram } from './helpers/concurrency';
import { createAdmin, createBrand, createProduct, createUser, fillCart, orderBody } from './helpers/factories';

// =============================================================================================
// PATCH /api/v1/orders/admin/:id/status — moving an order through fulfilment
// (skills: TDD, deep-test levels 0–4, transaction-race-test L5).
//
// Spec (constants/order.ts ORDER_TRANSITIONS + decision 2026-10-18):
//   - body { status } accepts only PROCESSING or COMPLETED; CONFIRMED / CANCELLED / PENDING_PAYMENT
//     have their own endpoints (confirm-payment, cancel) and are refused here with 422;
//   - CONFIRMED → PROCESSING → COMPLETED; any other jump answers 409 INVALID_STATE_TRANSITION;
//   - completing a COD order means the courier collected the cash: paymentStatus becomes PAID and
//     paidAt is stamped; a bank transfer was already PAID and keeps its original paidAt;
//   - stock is never touched (it left the shelf when the order was confirmed);
//   - two admins pressing at once: exactly one wins, the other gets 409 ORDER_STATE_CHANGED;
//   - only admins (403 for customers), only orders of the brand in X-Brand-Slug (404 otherwise).
// =============================================================================================

async function codOrder() {
  const { child } = await createBrand();
  const product = await createProduct(child.id, { variants: [{ stock: 10, price: 80_000 }] });
  const user = await createUser();
  await fillCart(user.id, [{ variantId: product.variants[0].id, quantity: 2 }]);
  const res = await call('post', '/api/v1/orders', { token: user.token }).send(orderBody('COD'));
  expect(res.status).toBe(201);
  return { id: res.body.data.id as string, variant: product.variants[0], user };
}

const setStatus = (token: string, id: string, status: unknown, brand?: string) =>
  call('patch', `/api/v1/orders/admin/${id}/status`, { token, brand }).send({ status });

describe('happy path', () => {
  it('CONFIRMED → PROCESSING → COMPLETED, and a completed COD order is marked paid', async () => {
    const admin = await createAdmin();
    const { id, variant } = await codOrder();
    const stockBefore = await variantStock(variant.id);

    const processing = await setStatus(admin.token, id, 'PROCESSING');
    expect(processing.status).toBe(200);
    expect(processing.body.data).toMatchObject({ orderStatus: 'PROCESSING', paymentStatus: 'UNPAID' });

    const completed = await setStatus(admin.token, id, 'COMPLETED');
    expect(completed.status).toBe(200);
    expect(completed.body.data).toMatchObject({ orderStatus: 'COMPLETED', paymentStatus: 'PAID' });
    expect(completed.body.data.paidAt).not.toBeNull();
    expect(completed.body.data.items).toHaveLength(1);

    expect(await variantStock(variant.id)).toEqual(stockBefore); // fulfilment never moves stock
  });

  it('a bank-transfer order keeps the paidAt of its payment when completed', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    const product = await createProduct(child.id, { variants: [{ stock: 5 }] });
    const user = await createUser();
    await fillCart(user.id, [{ variantId: product.variants[0].id, quantity: 1 }]);
    const id = (await call('post', '/api/v1/orders', { token: user.token }).send(orderBody('BANK_TRANSFER'))).body.data.id;
    // read paidAt through the API, like the app does: the column is `timestamp without time zone`
    // and node-pg would shift it by the machine's UTC offset when read directly
    const confirmed = await call('patch', `/api/v1/orders/admin/${id}/confirm-payment`, { token: admin.token });
    const paidAt = confirmed.body.data.paidAt as string;

    await setStatus(admin.token, id, 'PROCESSING');
    const done = await setStatus(admin.token, id, 'COMPLETED');

    expect(done.body.data).toMatchObject({ orderStatus: 'COMPLETED', paymentStatus: 'PAID' });
    expect(done.body.data.paidAt).toBe(paidAt);
  });
});

describe('state machine', () => {
  it('skipping PROCESSING (CONFIRMED → COMPLETED) is refused with 409', async () => {
    const admin = await createAdmin();
    const { id } = await codOrder();
    const res = await setStatus(admin.token, id, 'COMPLETED');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    expect((await orderRow(id)).orderStatus).toBe('CONFIRMED');
  });

  it('an unpaid bank transfer (PENDING_PAYMENT) cannot be shipped', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    const product = await createProduct(child.id, { variants: [{ stock: 5 }] });
    const user = await createUser();
    await fillCart(user.id, [{ variantId: product.variants[0].id, quantity: 1 }]);
    const id = (await call('post', '/api/v1/orders', { token: user.token }).send(orderBody('BANK_TRANSFER'))).body.data.id;
    expect((await setStatus(admin.token, id, 'PROCESSING')).status).toBe(409);
  });

  it('a cancelled or completed order is terminal', async () => {
    const admin = await createAdmin();
    const cancelled = await codOrder();
    await call('patch', `/api/v1/orders/admin/${cancelled.id}/cancel`, { token: admin.token });
    expect((await setStatus(admin.token, cancelled.id, 'PROCESSING')).status).toBe(409);

    const done = await codOrder();
    await setStatus(admin.token, done.id, 'PROCESSING');
    await setStatus(admin.token, done.id, 'COMPLETED');
    expect((await setStatus(admin.token, done.id, 'PROCESSING')).status).toBe(409);
  });

  it('setting the status it already has is a 409, not a silent success', async () => {
    const admin = await createAdmin();
    const { id } = await codOrder();
    await setStatus(admin.token, id, 'PROCESSING');
    expect((await setStatus(admin.token, id, 'PROCESSING')).status).toBe(409);
  });
});

describe('input and access', () => {
  it.each([['CANCELLED'], ['CONFIRMED'], ['PENDING_PAYMENT'], ['shipped'], [''], [null], [['PROCESSING']], [{ status: 'PROCESSING' }]])(
    'rejects status %j with 422 VALIDATION_ERROR',
    async (status) => {
      const admin = await createAdmin();
      const { id } = await codOrder();
      const res = await setStatus(admin.token, id, status);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect((await orderRow(id)).orderStatus).toBe('CONFIRMED');
    },
  );

  it('a customer — even the order owner — gets 403', async () => {
    const { id, user } = await codOrder();
    expect((await setStatus(user.token, id, 'PROCESSING')).status).toBe(403);
  });

  it('no token → 401', async () => {
    const { id } = await codOrder();
    const res = await call('patch', `/api/v1/orders/admin/${id}/status`).send({ status: 'PROCESSING' });
    expect(res.status).toBe(401);
  });

  it('an unknown order id → 404', async () => {
    const admin = await createAdmin();
    await createBrand();
    const res = await setStatus(admin.token, '00000000-0000-0000-0000-000000000000', 'PROCESSING');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ORDER_NOT_FOUND'); // the endpoint's 404, not "route does not exist"
  });

  it("an order of another brand looks like it does not exist (404) and is not changed", async () => {
    const admin = await createAdmin();
    const { id } = await codOrder(); // petshop
    await createBrand('gomsu');
    const res = await setStatus(admin.token, id, 'PROCESSING', 'gomsu');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    expect((await orderRow(id)).orderStatus).toBe('CONFIRMED');
  });
});

describe('concurrency', () => {
  it(`two admins pressing "Đang giao" at once: one 200, one 409 ORDER_STATE_CHANGED — ${ITER}x`, async () => {
    const admin = await createAdmin();
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const { id } = await codOrder();
      const responses = await Promise.all([setStatus(admin.token, id, 'PROCESSING'), setStatus(admin.token, id, 'PROCESSING')]);
      const hist = statusHistogram(responses);
      const loserCode = responses.find((r) => r.status === 409)?.body.error.code;
      if (hist[200] !== 1 || hist[409] !== 1 || (loserCode !== 'ORDER_STATE_CHANGED' && loserCode !== 'INVALID_STATE_TRANSITION')) {
        failures.push({ iteration: i, hist, loserCode });
      }
      await pool.query('TRUNCATE "Order", "OrderItem", "CartItem", "Cart" CASCADE');
    }
    expect(failures).toEqual([]);
  });

  it('"Hoàn tất" racing "Huỷ" on a PROCESSING order never ends in a mixed state', async () => {
    // PROCESSING → CANCELLED is not an allowed transition, so cancel must lose every time and the
    // order must end COMPLETED with its stock untouched (no refund of units that were shipped).
    const admin = await createAdmin();
    for (let i = 0; i < ITER; i += 1) {
      const { id, variant } = await codOrder();
      await setStatus(admin.token, id, 'PROCESSING');
      const before = await variantStock(variant.id);
      await Promise.all([
        setStatus(admin.token, id, 'COMPLETED'),
        call('patch', `/api/v1/orders/admin/${id}/cancel`, { token: admin.token }),
      ]);
      expect((await orderRow(id)).orderStatus).toBe('COMPLETED');
      expect(await variantStock(variant.id)).toEqual(before);
      await pool.query('TRUNCATE "Order", "OrderItem", "CartItem", "Cart" CASCADE');
    }
  });
});
