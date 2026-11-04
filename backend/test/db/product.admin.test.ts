import { describe, expect, it } from 'vitest';
import prisma from '../../services/prisma';
import { call } from './helpers/http';
import { createAdmin, createProduct, createUser } from './helpers/factories';
import {
  assertProductSlugFree,
  changeProductSlug,
  getShopProduct,
  imageInShop,
  productInShop,
  resolveProductSlug,
  variantInShop,
} from '../../services/productAdmin.service';
import { categorySubtreeIds } from '../../utils/categoryTree';

// Admin products (spec 2026-11-04): shop "petshop" (root → cho → hat-cho-cho) and a foreign root
// "gomsu" whose product, variant and image must stay out of reach.
async function shop() {
  const root = await prisma.category.create({ data: { slug: 'petshop', name: 'Shop' } });
  const cho = await prisma.category.create({ data: { slug: 'cho', name: 'Chó', parentId: root.id } });
  const leaf = await prisma.category.create({ data: { slug: 'hat-cho-cho', name: 'Hạt cho chó', parentId: cho.id } });
  const gomsu = await prisma.category.create({ data: { slug: 'gomsu', name: 'Gốm' } });
  const all = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const scope = { shopIds: categorySubtreeIds(all, root.id) };
  const ours = await createProduct(leaf.id, { slug: 'hat-a', status: 'draft' });
  const foreign = await createProduct(gomsu.id, { slug: 'binh-gom' });
  const img = await prisma.productImage.create({ data: { productId: foreign.id, url: 'https://res.cloudinary.com/x/a.jpg' } });
  return { scope, leaf, gomsu, ours, foreign, img };
}

describe('shop scope', () => {
  it('finds a draft product of the shop and hides everything of another storefront', async () => {
    const t = await shop();
    expect((await getShopProduct(t.scope, t.ours.id)).status).toBe('draft');
    await expect(productInShop(t.scope, t.foreign.id)).rejects.toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND' });
    await expect(variantInShop(t.scope, t.foreign.variants[0].id)).rejects.toMatchObject({ status: 404, code: 'VARIANT_NOT_FOUND' });
    await expect(imageInShop(t.scope, t.img.id)).rejects.toMatchObject({ status: 404, code: 'IMAGE_NOT_FOUND' });
  });
});

describe('slug history', () => {
  it('keeps the old slug, frees it again when the product returns to it, and blocks it for others', async () => {
    const t = await shop();
    await prisma.$transaction(async (tx) => {
      await changeProductSlug(tx, t.ours, 'hat-b');
      await tx.product.update({ where: { id: t.ours.id }, data: { slug: 'hat-b', status: 'active' } });
    });
    expect(await resolveProductSlug('hat-a')).toBe('hat-b');
    await expect(assertProductSlugFree('hat-a')).rejects.toMatchObject({ status: 409, code: 'SLUG_TAKEN' });
    await expect(assertProductSlugFree('hat-a', t.ours.id)).resolves.toBeUndefined();
    await prisma.$transaction(async (tx) => {
      await changeProductSlug(tx, { id: t.ours.id, slug: 'hat-b' }, 'hat-a');
      await tx.product.update({ where: { id: t.ours.id }, data: { slug: 'hat-a' } });
    });
    await expect(resolveProductSlug('hat-a')).rejects.toMatchObject({ status: 404 });
    expect(await resolveProductSlug('hat-b')).toBe('hat-a');
  });

  it('does not resolve to a product that is not on sale', async () => {
    const t = await shop();
    await prisma.$transaction(async (tx) => {
      await changeProductSlug(tx, t.ours, 'hat-b');
      await tx.product.update({ where: { id: t.ours.id }, data: { slug: 'hat-b' } }); // still a draft
    });
    await expect(resolveProductSlug('hat-a')).rejects.toMatchObject({ status: 404 });
  });
});

const asAdmin = async () => {
  const admin = await createAdmin();
  return (m: 'get' | 'post' | 'patch' | 'delete', url: string) => call(m, `/api/v1/products${url}`, { token: admin.token });
};

describe('admin product API', () => {
  it('reads a draft by id and refuses visitors, customers and other storefronts', async () => {
    const t = await shop();
    const as = await asAdmin();
    expect((await as('get', `/admin/${t.ours.id}`)).body.data).toMatchObject({ id: t.ours.id, status: 'draft' });
    expect((await call('get', `/api/v1/products/admin/${t.ours.id}`)).status).toBe(401);
    expect((await call('get', `/api/v1/products/admin/${t.ours.id}`, { token: (await createUser()).token })).status).toBe(403);
    expect((await as('get', `/admin/${t.foreign.id}`)).status).toBe(404);
    expect((await as('patch', `/${t.foreign.id}`).send({ name: 'X' })).status).toBe(404);
    expect((await as('delete', `/${t.foreign.id}`)).status).toBe(404);
    expect((await as('patch', `/variants/${t.foreign.variants[0].id}`).send({ price: 1 })).status).toBe(404);
    expect((await as('delete', `/variants/${t.foreign.variants[0].id}`)).status).toBe(404);
    expect((await as('post', `/${t.foreign.id}/variants`).send({ sku: 'G-2', price: 1 })).status).toBe(404);
    expect((await as('get', `/variants/${t.foreign.variants[0].id}/stock-movements`)).status).toBe(404);
    expect((await as('post', `/variants/${t.foreign.variants[0].id}/stock-movements`).send({ type: 'STOCKTAKE', countedQuantity: 1 })).status).toBe(404);
    expect((await as('post', `/${t.foreign.id}/images`).send({ url: 'https://res.cloudinary.com/x/b.jpg' })).status).toBe(404);
    expect((await as('patch', `/images/${t.img.id}`).send({ position: 2 })).status).toBe(404);
    expect((await as('delete', `/images/${t.img.id}`)).status).toBe(404);
  });

  it('lists only the shop products', async () => {
    const t = await shop();
    const as = await asAdmin();
    const ids = (await as('get', '/admin/list')).body.data.map((p: { id: string }) => p.id);
    expect(ids).toEqual([t.ours.id]);
    expect((await as('get', '/admin/list?categorySlug=gomsu')).body.data).toEqual([]);
  });

  it('refuses a category of another storefront on create and update', async () => {
    const t = await shop();
    const as = await asAdmin();
    const body = { categoryId: t.gomsu.id, name: 'X', slug: 'x', variants: [{ sku: 'X-1', price: 1 }] };
    expect((await as('post', '').send(body)).body.error.code).toBe('CATEGORY_NOT_FOUND');
    expect((await as('patch', `/${t.ours.id}`).send({ categoryId: t.gomsu.id })).body.error.code).toBe('CATEGORY_NOT_FOUND');
  });

  it('stores the variant label sent on create', async () => {
    const t = await shop();
    const as = await asAdmin();
    const res = await as('post', '').send({ categoryId: t.leaf.id, name: ' Hạt mới ', slug: 'hat-moi', variants: [{ sku: 'HM-1', label: 'Gói 1kg', price: 1000 }] });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Hạt mới');
    expect(res.body.data.variants[0].variantAttributes).toEqual({ label: 'Gói 1kg' });
  });

  it('renames a product on sale and redirects the old slug', async () => {
    const t = await shop();
    const as = await asAdmin();
    expect((await as('patch', `/${t.ours.id}`).send({ slug: 'hat-moi', status: 'active' })).status).toBe(200);
    expect((await call('get', '/api/v1/products/resolve/hat-a', { brand: null })).body.data).toEqual({ slug: 'hat-moi' });
    const other = { categoryId: t.leaf.id, name: 'Y', slug: 'hat-a', variants: [{ sku: 'Y-1', price: 1 }] };
    expect((await as('post', '').send(other)).body.error.code).toBe('SLUG_TAKEN');
    expect((await as('patch', `/${t.ours.id}`).send({ slug: 'hat-a' })).status).toBe(200);
    expect((await call('get', '/api/v1/products/resolve/hat-a', { brand: null })).status).toBe(404);
  });
});
