import { describe, expect, it } from 'vitest';
import prisma from '../../services/prisma';
import { call } from './helpers/http';
import { createAdmin, createBrand, createProduct, createUser, fillCart, orderBody } from './helpers/factories';

// Admin order search (spec 2026-10-21 admin orders): a customer calls about an order and the shop
// finds it by code (any case), by phone (spaces allowed) or by the account's name / email.
async function placeOrder(fullName: string) {
  const { child } = await createBrand();
  const product = await createProduct(child.id, { variants: [{ stock: 10, price: 50_000 }] });
  const user = await createUser({ fullName });
  await fillCart(user.id, [{ variantId: product.variants[0].id, quantity: 1 }]);
  const res = await call('post', '/api/v1/orders', { token: user.token }).send(orderBody('COD'));
  expect(res.status).toBe(201);
  return res.body.data as { id: string; code: string };
}

describe('admin order search', () => {
  it('finds an order by code, phone or account name, and nothing else', async () => {
    const order = await placeOrder('Trần Thị Mai');
    const admin = await createAdmin();
    const search = (q: string, extra = '') => call('get', `/api/v1/orders/admin/list?q=${encodeURIComponent(q)}${extra}`, { token: admin.token });

    expect((await search(order.code.toLowerCase().slice(-6))).body.data.map((o: { id: string }) => o.id)).toEqual([order.id]);
    expect((await search('0901 234')).body.meta.total).toBe(1); // validShipping phone 0901234567
    expect((await search('thị mai')).body.meta.total).toBe(1);
    expect((await search('khong-co-don-nay')).body.meta.total).toBe(0);
    expect((await search('0901 234', '&orderStatus=CANCELLED')).body.meta.total).toBe(0); // combines with the tab
  });

  it('finds a phone saved with spaces, whatever spacing the admin types', async () => {
    const { child } = await createBrand();
    const product = await createProduct(child.id, { variants: [{ stock: 10, price: 50_000 }] });
    const user = await createUser({ fullName: 'Khách Cách' });
    await fillCart(user.id, [{ variantId: product.variants[0].id, quantity: 1 }]);
    const body = { ...orderBody('COD'), shippingAddress: { ...orderBody('COD').shippingAddress, phone: '0912 345 678' } };
    expect((await call('post', '/api/v1/orders', { token: user.token }).send(body)).status).toBe(201);
    const admin = await createAdmin();
    for (const q of ['0912345678', '0912 345', '345.678']) {
      expect((await call('get', `/api/v1/orders/admin/list?q=${encodeURIComponent(q)}`, { token: admin.token })).body.meta.total, q).toBe(1);
    }
  });

  it('treats % and _ literally', async () => {
    await placeOrder('Bình thường');
    const admin = await createAdmin();
    const res = await call('get', '/api/v1/orders/admin/list?q=%25%25', { token: admin.token });
    expect(res.body.meta.total).toBe(0);
    expect(await prisma.order.count()).toBe(1);
  });
});

// The check runs after resolveBrand (router-level), so it lives in the DB suite.
describe('admin order search validation', () => {
  it.each([
    ['too short', 'q=a'],
    ['blank', 'q=%20%20%20'],
    ['too long', `q=${'a'.repeat(51)}`],
    ['repeated', 'q=ab&q=cd'],
  ])('refuses a %s term with 422', async (_label, query) => {
    await createBrand();
    const admin = await createAdmin();
    const res = await call('get', `/api/v1/orders/admin/list?${query}`, { token: admin.token });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
