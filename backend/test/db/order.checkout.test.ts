import { describe, expect, it } from 'vitest';
import { pool, countRows, orderRow, variantStock } from './helpers/db';
import { call, LEAK } from './helpers/http';
import { createAdmin, createBrand, createProduct, createUser, fillCart, orderBody, validShipping } from './helpers/factories';

// =============================================================================================
// Order endpoints — functional behaviour (skill: deep-test levels 0–4, 8, 9). Concurrency of
// the same endpoints lives in order.race.test.ts.
//
// Spec sources: routes/order.route.ts (field-by-field shipping validation, note ≤ 500 chars,
// only BANK_TRANSFER / COD), order.controller.ts header comments (prices from DB never from
// the client, orders listed/fetched only for their owner, state machine in
// constants/order.ts: PENDING_PAYMENT → CONFIRMED|CANCELLED, CONFIRMED → PROCESSING|CANCELLED,
// COMPLETED/CANCELLED terminal).
// =============================================================================================

async function shopWithCart(stock = 10, quantity = 1) {
  const { child } = await createBrand();
  const product = await createProduct(child.id, { variants: [{ stock, price: 80_000 }] });
  const user = await createUser();
  await fillCart(user.id, [{ variantId: product.variants[0].id, quantity }]);
  return { product, variant: product.variants[0], user };
}

const place = (token: string, body: Record<string, unknown> = orderBody('COD'), brand?: string | null) =>
  call('post', '/api/v1/orders', { token, brand }).send(body);

describe('POST /orders — validation (levels 1, 2)', () => {
  it.each([
    ['missing paymentMethod', { shippingAddress: validShipping }],
    ['VNPAY is reserved, not accepted yet', { paymentMethod: 'VNPAY', shippingAddress: validShipping }],
    ['unknown payment method', { paymentMethod: 'BITCOIN', shippingAddress: validShipping }],
    ['missing phone', { paymentMethod: 'COD', shippingAddress: { ...validShipping, phone: '' } }],
    ['phone only spaces', { paymentMethod: 'COD', shippingAddress: { ...validShipping, phone: '   ' } }],
    ['missing city', { paymentMethod: 'COD', shippingAddress: { ...validShipping, city: undefined } }],
    ['shippingAddress is a string', { paymentMethod: 'COD', shippingAddress: '12 Lê Lợi' }],
    ['note of 501 characters', { ...orderBody('COD'), note: 'n'.repeat(501) }],
  ])('rejects %s with 422 and changes nothing', async (_name, body) => {
    const { user, variant } = await shopWithCart();
    const res = await place(user.token, body as Record<string, unknown>);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(LEAK);
    expect(await countRows('Order')).toBe(0);
    expect(await variantStock(variant.id)).toEqual({ stock: 10, reserved: 0 });
  });

  it('accepts a note of exactly 500 characters (boundary)', async () => {
    const { user } = await shopWithCart();
    expect((await place(user.token, { ...orderBody('COD'), note: 'n'.repeat(500) })).status).toBe(201);
  });

  it('an empty cart answers 422 CART_EMPTY', async () => {
    await createBrand();
    const u = await createUser();
    const res = await place(u.token);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CART_EMPTY');
  });

  it('keeps Vietnamese text in the shipping snapshot byte-for-byte (level 9)', async () => {
    const { user } = await shopWithCart();
    const res = await place(user.token, { paymentMethod: 'COD', shippingAddress: { ...validShipping, fullName: '  Đặng Thị Ổn  ' } });
    expect(res.status).toBe(201);
    // trimmed by the validator, diacritics intact
    expect(res.body.data.shippingAddress.fullName).toBe('Đặng Thị Ổn');
  });
});

describe('POST /orders — abuse (level 8)', () => {
  it('ignores money and status fields sent by the client (prices always come from the DB)', async () => {
    const { user } = await shopWithCart(10, 2);
    const res = await place(user.token, {
      ...orderBody('COD'),
      subtotal: 1,
      grandTotal: 1,
      shippingFee: -500_000,
      orderStatus: 'COMPLETED',
      paymentStatus: 'PAID',
      userId: 'someone-else',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ subtotal: 160_000, grandTotal: 160_000, shippingFee: 0, orderStatus: 'CONFIRMED', paymentStatus: 'UNPAID', userId: user.id });
  });

  it('does not persist arbitrary extra fields inside shippingAddress (it is a frozen snapshot)', async () => {
    // The route validates four known fields but the controller stores `shippingAddress` as
    // sent, so a client can park up to ~10 MB of arbitrary JSON in every order row.
    const { user } = await shopWithCart();
    const res = await place(user.token, {
      paymentMethod: 'COD',
      shippingAddress: { ...validShipping, junk: 'x'.repeat(200_000), isAdmin: true },
    });
    expect(res.status).toBeLessThan(500);
    if (res.status === 201) {
      const row = await orderRow(res.body.data.id);
      expect(Object.keys(row.shippingAddress)).not.toContain('junk');
      expect(Object.keys(row.shippingAddress)).not.toContain('isAdmin');
    }
  });

  it('a malicious note is stored as plain text, not interpreted', async () => {
    const { user } = await shopWithCart();
    const note = `<script>alert(1)</script>' OR 1=1 --`;
    const res = await place(user.token, { ...orderBody('COD'), note });
    expect(res.status).toBe(201);
    expect((await orderRow(res.body.data.id)).note).toBe(note);
  });

  it('order codes are unique and not sequential (cannot guess a neighbour)', async () => {
    const { child } = await createBrand();
    const p = await createProduct(child.id, { variants: [{ stock: 100 }] });
    const codes: string[] = [];
    for (let i = 0; i < 15; i += 1) {
      const u = await createUser();
      await fillCart(u.id, [{ variantId: p.variants[0].id, quantity: 1 }]);
      codes.push((await place(u.token)).body.data.code);
    }
    expect(new Set(codes).size).toBe(15);
    for (const c of codes) expect(c).toMatch(/^NP-\d{6}-[0-9A-Z]{6}$/);
  });
});

describe('reading orders — access control (level 3)', () => {
  it('GET /orders lists only the caller’s own orders for the current brand', async () => {
    const a = await shopWithCart();
    await place(a.user.token);
    const b = await createUser();
    await fillCart(b.id, [{ variantId: a.variant.id, quantity: 1 }]);
    await place(b.token);

    const res = await call('get', '/api/v1/orders', { token: a.user.token });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].userId).toBe(a.user.id);
    expect(res.body.meta.total).toBe(1);
  });

  it('IDOR: knowing another customer’s order code is not enough to read it', async () => {
    const owner = await shopWithCart();
    const code = (await place(owner.user.token)).body.data.code;
    const stranger = await createUser();
    expect((await call('get', `/api/v1/orders/${code}`, { token: stranger.token })).status).toBe(404);
    expect((await call('get', `/api/v1/orders/${code}`, { token: owner.user.token })).status).toBe(200);
  });

  it('pageSize on GET /orders is capped at 50', async () => {
    const { user } = await shopWithCart();
    const res = await call('get', '/api/v1/orders?pageSize=1000', { token: user.token });
    expect(res.body.meta.pageSize).toBe(50);
  });

  it('a customer cannot use the admin endpoints (403)', async () => {
    const { user } = await shopWithCart();
    const id = (await place(user.token, orderBody('BANK_TRANSFER'))).body.data.id;
    for (const [m, url] of [
      ['get', '/api/v1/orders/admin/list'],
      ['patch', `/api/v1/orders/admin/${id}/confirm-payment`],
      ['patch', `/api/v1/orders/admin/${id}/cancel`],
    ] as const) {
      expect((await call(m, url, { token: user.token })).status).toBe(403);
    }
    expect((await orderRow(id)).orderStatus).toBe('PENDING_PAYMENT');
  });

  it('admin list is scoped to the brand in X-Brand-Slug and filters by status', async () => {
    const admin = await createAdmin();
    const { user } = await shopWithCart();
    await place(user.token, orderBody('BANK_TRANSFER'));
    await createBrand('gomsu');

    const pet = await call('get', '/api/v1/orders/admin/list?orderStatus=PENDING_PAYMENT', { token: admin.token });
    const pottery = await call('get', '/api/v1/orders/admin/list', { token: admin.token, brand: 'gomsu' });
    expect(pet.body.meta.total).toBe(1);
    expect(pottery.body.meta.total).toBe(0);
    // customer identity is limited to id / email / fullName — no password hash
    expect(Object.keys(pet.body.data[0].user).sort()).toEqual(['email', 'fullName', 'id']);
  });
});

describe('order state machine (level 4)', () => {
  async function pendingOrder() {
    const { user, variant } = await shopWithCart(10, 1);
    const id = (await place(user.token, orderBody('BANK_TRANSFER'))).body.data.id as string;
    return { id, variant };
  }

  it('cannot confirm a cancelled order (409) and stock stays put', async () => {
    const admin = await createAdmin();
    const { id, variant } = await pendingOrder();
    await call('patch', `/api/v1/orders/admin/${id}/cancel`, { token: admin.token });
    const res = await call('patch', `/api/v1/orders/admin/${id}/confirm-payment`, { token: admin.token });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
    expect(await variantStock(variant.id)).toEqual({ stock: 10, reserved: 0 });
  });

  it('confirming an already paid order answers 409 ALREADY_PAID', async () => {
    const admin = await createAdmin();
    const { id } = await pendingOrder();
    await call('patch', `/api/v1/orders/admin/${id}/confirm-payment`, { token: admin.token });
    const res = await call('patch', `/api/v1/orders/admin/${id}/confirm-payment`, { token: admin.token });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_PAID');
  });

  it('cancelling a CONFIRMED (paid) order puts the units back on the shelf', async () => {
    const admin = await createAdmin();
    const { id, variant } = await pendingOrder();
    await call('patch', `/api/v1/orders/admin/${id}/confirm-payment`, { token: admin.token });
    expect(await variantStock(variant.id)).toEqual({ stock: 9, reserved: 0 });
    expect((await call('patch', `/api/v1/orders/admin/${id}/cancel`, { token: admin.token })).status).toBe(200);
    expect(await variantStock(variant.id)).toEqual({ stock: 10, reserved: 0 });
  });

  it('a terminal order (COMPLETED / CANCELLED) cannot be cancelled again', async () => {
    const admin = await createAdmin();
    const { id } = await pendingOrder();
    await pool.query(`UPDATE "Order" SET "orderStatus" = 'COMPLETED' WHERE id = $1`, [id]);
    expect((await call('patch', `/api/v1/orders/admin/${id}/cancel`, { token: admin.token })).status).toBe(409);
  });

  it('confirm-payment on a COD order (already CONFIRMED, cash on delivery) is refused', async () => {
    const admin = await createAdmin();
    const { user, variant } = await shopWithCart();
    const id = (await place(user.token, orderBody('COD'))).body.data.id;
    expect((await call('patch', `/api/v1/orders/admin/${id}/confirm-payment`, { token: admin.token })).status).toBe(409);
    expect(await variantStock(variant.id)).toEqual({ stock: 9, reserved: 0 });
  });

  it('unknown order id → 404 on confirm and cancel', async () => {
    const admin = await createAdmin();
    await createBrand();
    const fake = '00000000-0000-0000-0000-000000000000';
    expect((await call('patch', `/api/v1/orders/admin/${fake}/confirm-payment`, { token: admin.token })).status).toBe(404);
    expect((await call('patch', `/api/v1/orders/admin/${fake}/cancel`, { token: admin.token })).status).toBe(404);
  });

  it('an order whose variant was deleted can still be confirmed (snapshot survives, stock untouched)', async () => {
    const admin = await createAdmin();
    const { id, variant } = await pendingOrder();
    await pool.query(`DELETE FROM "ProductVariant" WHERE id = $1`, [variant.id]);
    const res = await call('patch', `/api/v1/orders/admin/${id}/confirm-payment`, { token: admin.token });
    expect(res.status).toBe(200);
    expect(res.body.data.items[0]).toMatchObject({ variantId: null, quantity: 1, unitPrice: 80_000 });
  });

  it('level 9: the sweeper leaves an order alone one minute BEFORE its deadline and expires it one minute AFTER', async () => {
    const { releaseExpiredOrders } = await import('../../workers/releaseExpiredOrders');
    const { id, variant } = await pendingOrder();

    await pool.query(`UPDATE "Order" SET "expiresAt" = (now() AT TIME ZONE 'UTC') + interval '1 minute' WHERE id = $1`, [id]);
    expect(await releaseExpiredOrders()).toBe(0);
    expect((await orderRow(id)).orderStatus).toBe('PENDING_PAYMENT');

    await pool.query(`UPDATE "Order" SET "expiresAt" = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE id = $1`, [id]);
    expect(await releaseExpiredOrders()).toBe(1);
    expect(await orderRow(id)).toMatchObject({ orderStatus: 'CANCELLED', paymentStatus: 'EXPIRED', expiresAt: null });
    expect(await variantStock(variant.id)).toEqual({ stock: 10, reserved: 0 });
  });
});
