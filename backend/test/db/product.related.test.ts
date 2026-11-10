import { describe, expect, it } from 'vitest';
import { PRODUCT_STATUS } from '../../constants/product';
import prisma from '../../services/prisma';
import { LEAK, call } from './helpers/http';
import { createAdmin, createBrand, createProduct, createUser } from './helpers/factories';

// "Thường mua kèm" (spec 2026-11-10, ADR-026): the admin picks up to 4 products a product suggests,
// in order; the public detail shows the ones on sale.

async function setup() {
  const admin = await createAdmin();
  const { child } = await createBrand();
  const make = (name: string, status: string = PRODUCT_STATUS.ACTIVE) => createProduct(child.id, { name, status });
  const main = await make('Hạt mèo');
  const [pate, cat, toy, bowl, extra] = await Promise.all([make('Pate mèo'), make('Cát mèo'), make('Đồ chơi'), make('Bát ăn'), make('Lược')]);
  return { admin, child, main, pate, cat, toy, bowl, extra, make };
}
const put = (token: string, id: string, ids: unknown) => call('put', `/api/v1/products/${id}/related`, { token }).send({ ids });
const adminGet = (token: string, id: string) => call('get', `/api/v1/products/admin/${id}`, { token });
const publicGet = (slug: string) => call('get', `/api/v1/products/${slug}`);

describe('PUT /products/:id/related', () => {
  it('saves the suggestions in the chosen order and replaces them on the next save', async () => {
    const s = await setup();
    const res = await put(s.admin.token, s.main.id, [s.cat.id, s.pate.id]);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual([s.cat.id, s.pate.id]);
    expect((await adminGet(s.admin.token, s.main.id)).body.data.related).toEqual([
      { id: s.cat.id, name: 'Cát mèo', slug: s.cat.slug, status: 'active' },
      { id: s.pate.id, name: 'Pate mèo', slug: s.pate.slug, status: 'active' },
    ]);
    await put(s.admin.token, s.main.id, [s.toy.id]);
    expect((await adminGet(s.admin.token, s.main.id)).body.data.related.map((r: { id: string }) => r.id)).toEqual([s.toy.id]);
    await put(s.admin.token, s.main.id, []);
    expect(await prisma.productRelated.count()).toBe(0);
  });

  it('is one-way: the suggested product does not suggest back', async () => {
    const s = await setup();
    await put(s.admin.token, s.main.id, [s.pate.id]);
    expect((await adminGet(s.admin.token, s.pate.id)).body.data.related).toEqual([]);
  });

  it.each([
    ['more than 4', (s: Awaited<ReturnType<typeof setup>>) => [s.pate.id, s.cat.id, s.toy.id, s.bowl.id, s.extra.id]],
    ['the same product twice', (s: Awaited<ReturnType<typeof setup>>) => [s.pate.id, s.pate.id]],
    ['the product itself', (s: Awaited<ReturnType<typeof setup>>) => [s.main.id]],
    ['something that is not a list', () => 'abc'],
    ['an id that does not exist', () => ['00000000-0000-0000-0000-000000000000']],
  ])('refuses %s with 422 on ids', async (_name, ids) => {
    const s = await setup();
    const res = await put(s.admin.token, s.main.id, ids(s));
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain('ids');
    expect(JSON.stringify(res.body)).not.toMatch(LEAK);
    expect(await prisma.productRelated.count()).toBe(0);
  });

  it('refuses a product of another shop (422), and editing another shop\'s product is 404', async () => {
    const s = await setup();
    const other = await createBrand('other-shop');
    const foreign = await createProduct(other.child.id, { name: 'Hàng shop khác' });
    expect((await put(s.admin.token, s.main.id, [foreign.id])).status).toBe(422);
    expect((await put(s.admin.token, foreign.id, [s.pate.id])).status).toBe(404);
  });

  it('is 401 without a token and 403 for a customer', async () => {
    const s = await setup();
    const customer = await createUser();
    expect((await call('put', `/api/v1/products/${s.main.id}/related`).send({ ids: [] })).status).toBe(401);
    expect((await put(customer.token, s.main.id, [s.pate.id])).status).toBe(403);
  });

  it('drops the link when the suggested product is deleted', async () => {
    const s = await setup();
    await put(s.admin.token, s.main.id, [s.pate.id, s.cat.id]);
    expect((await call('delete', `/api/v1/products/${s.pate.id}`, { token: s.admin.token })).status).toBe(200);
    expect((await adminGet(s.admin.token, s.main.id)).body.data.related.map((r: { id: string }) => r.id)).toEqual([s.cat.id]);
  });
});

describe('GET /products/:slug related', () => {
  it('lists the suggestions on sale, in order, with images and variants sorted by price', async () => {
    const s = await setup();
    const hidden = await s.make('Bản nháp', PRODUCT_STATUS.DRAFT);
    await prisma.productVariant.create({ data: { productId: s.cat.id, sku: 'CAT-CHEAP', variantKey: 'CAT-CHEAP', price: 10_000, stockQuantity: 3 } });
    await put(s.admin.token, s.main.id, [s.cat.id, hidden.id, s.pate.id]);
    const res = await publicGet(s.main.slug);
    expect(res.status).toBe(200);
    const related = res.body.data.related as { id: string; slug: string; name: string; images: unknown[]; variants: { price: number }[] }[];
    expect(related.map((r) => r.id)).toEqual([s.cat.id, s.pate.id]);
    expect(related[0].variants.map((v) => v.price)).toEqual([10_000, 50_000]);
    expect(Object.keys(related[0]).sort()).toEqual(['brand', 'id', 'images', 'name', 'slug', 'variants']);
  });

  it('is an empty list for a product without suggestions', async () => {
    const s = await setup();
    expect((await publicGet(s.main.slug)).body.data.related).toEqual([]);
  });
});
