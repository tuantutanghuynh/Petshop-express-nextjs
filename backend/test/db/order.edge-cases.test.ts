import { describe, expect, it } from 'vitest';
import prisma from '../../services/prisma';
import { call } from './helpers/http';
import { createAdmin, createBrand, createProduct, createUser, fillCart, orderBody } from './helpers/factories';
import { variantStock, countRows } from './helpers/db';
import { PRODUCT_STATUS } from '../../constants/product';

describe('Order edge cases & real-world gaps', () => {
  it('reflects price changes made before checkout (price drift)', async () => {
    const { child } = await createBrand();
    const product = await createProduct(child.id, { variants: [{ stock: 10, price: 50_000 }] });
    const user = await createUser();

    // User adds item to cart at 50,000đ
    await fillCart(user.id, [{ variantId: product.variants[0].id, quantity: 2 }]);

    // Admin reprices variant to 75,000đ before user submits checkout
    await prisma.productVariant.update({
      where: { id: product.variants[0].id },
      data: { price: 75_000 },
    });

    const res = await call('post', '/api/v1/orders', { token: user.token }).send(orderBody('COD'));
    expect(res.status).toBe(201);
    expect(res.body.data.subtotal).toBe(150_000);
    expect(res.body.data.grandTotal).toBe(150_000);
    expect(res.body.data.items[0].unitPrice).toBe(75_000);
    expect(res.body.data.items[0].lineTotal).toBe(150_000);
  });

  it('refuses checkout with 409 PRODUCT_UNAVAILABLE if product becomes draft while in cart', async () => {
    const { child } = await createBrand();
    const product = await createProduct(child.id, { variants: [{ stock: 10, price: 40_000 }] });
    const user = await createUser();

    await fillCart(user.id, [{ variantId: product.variants[0].id, quantity: 1 }]);

    // Admin sets product to draft
    await prisma.product.update({
      where: { id: product.id },
      data: { status: PRODUCT_STATUS.DRAFT },
    });

    const res = await call('post', '/api/v1/orders', { token: user.token }).send(orderBody('COD'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCT_UNAVAILABLE');

    // Cart and stock remain untouched
    expect(await countRows('Order')).toBe(0);
    expect((await variantStock(product.variants[0].id)).stock).toBe(10);
  });

  it('handles variant deletion while in cart cleanly (cascade deletes cart line -> CART_EMPTY 422)', async () => {
    const { child } = await createBrand();
    const product = await createProduct(child.id, { variants: [{ stock: 10, price: 40_000 }] });
    const user = await createUser();

    await fillCart(user.id, [{ variantId: product.variants[0].id, quantity: 1 }]);

    // Admin deletes variant (Postgres cascades delete to CartItem)
    await prisma.productVariant.delete({ where: { id: product.variants[0].id } });

    const res = await call('post', '/api/v1/orders', { token: user.token }).send(orderBody('COD'));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CART_EMPTY');
  });

  it('cannot confirm payment on a cancelled order after stock was sold to someone else', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    const product = await createProduct(child.id, { variants: [{ stock: 2, price: 30_000 }] });

    const buyer1 = await createUser();
    await fillCart(buyer1.id, [{ variantId: product.variants[0].id, quantity: 2 }]);
    const order1 = (await call('post', '/api/v1/orders', { token: buyer1.token }).send(orderBody('BANK_TRANSFER'))).body.data;

    // Order 1 reserved 2 units
    expect(await variantStock(product.variants[0].id)).toEqual({ stock: 2, reserved: 2 });

    // Order 1 is cancelled (sweeper or admin cancel) -> reservation released
    await call('patch', `/api/v1/orders/admin/${order1.id}/cancel`, { token: admin.token });
    expect(await variantStock(product.variants[0].id)).toEqual({ stock: 2, reserved: 0 });

    // Buyer 2 quickly buys the remaining 2 units via COD -> stock drops to 0
    const buyer2 = await createUser();
    await fillCart(buyer2.id, [{ variantId: product.variants[0].id, quantity: 2 }]);
    const order2 = await call('post', '/api/v1/orders', { token: buyer2.token }).send(orderBody('COD'));
    expect(order2.status).toBe(201);
    expect(await variantStock(product.variants[0].id)).toEqual({ stock: 0, reserved: 0 });

    // Admin attempts late confirm-payment on the cancelled Order 1
    const lateConfirm = await call('patch', `/api/v1/orders/admin/${order1.id}/confirm-payment`, { token: admin.token });
    expect(lateConfirm.status).toBe(409);
    expect(lateConfirm.body.error.code).toBe('INVALID_STATE_TRANSITION');

    // Stock does not go negative
    expect(await variantStock(product.variants[0].id)).toEqual({ stock: 0, reserved: 0 });
  });

  it('refuses to cancel an order that has already been COMPLETED (terminal state)', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    const product = await createProduct(child.id, { variants: [{ stock: 5, price: 50_000 }] });
    const user = await createUser();

    await fillCart(user.id, [{ variantId: product.variants[0].id, quantity: 1 }]);
    const order = (await call('post', '/api/v1/orders', { token: user.token }).send(orderBody('COD'))).body.data;

    // Transition to PROCESSING then COMPLETED
    await call('patch', `/api/v1/orders/admin/${order.id}/status`, { token: admin.token }).send({ status: 'PROCESSING' });
    await call('patch', `/api/v1/orders/admin/${order.id}/status`, { token: admin.token }).send({ status: 'COMPLETED' });

    // Attempting to cancel a completed order fails
    const cancelRes = await call('patch', `/api/v1/orders/admin/${order.id}/cancel`, { token: admin.token });
    expect(cancelRes.status).toBe(409);
    expect(cancelRes.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });
});
