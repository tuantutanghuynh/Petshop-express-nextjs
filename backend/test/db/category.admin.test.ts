import { describe, expect, it } from 'vitest';
import prisma from '../../services/prisma';
import { call } from './helpers/http';
import { createAdmin, createProduct } from './helpers/factories';

// The petshop tree (spec 2026-10-20 admin categories): root → cho → cho-thuc-an → hat-cho-cho, plus
// meo, and a foreign root "gomsu" that must stay out of reach.
async function tree() {
  const root = await prisma.category.create({ data: { slug: 'petshop', name: 'Shop' } });
  const cho = await prisma.category.create({ data: { slug: 'cho', name: 'Chó', parentId: root.id, sortOrder: 0 } });
  const meo = await prisma.category.create({ data: { slug: 'meo', name: 'Mèo', parentId: root.id, sortOrder: 1 } });
  const group = await prisma.category.create({ data: { slug: 'cho-thuc-an', name: 'Thức ăn', parentId: cho.id } });
  const leaf = await prisma.category.create({ data: { slug: 'hat-cho-cho', name: 'Hạt cho chó', parentId: group.id } });
  const gomsu = await prisma.category.create({ data: { slug: 'gomsu', name: 'Gốm' } });
  const admin = await createAdmin();
  const as = (m: 'get' | 'post' | 'patch' | 'delete' | 'put', url: string) => call(m, `/api/v1/categories${url}`, { token: admin.token });
  return { root, cho, meo, group, leaf, gomsu, as };
}

describe('admin list', () => {
  it('lists only the shop tree with counts', async () => {
    const t = await tree();
    await createProduct(t.leaf.id);
    const res = await t.as('get', '/admin/list');
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((c: { slug: string }) => c.slug);
    expect(slugs).toContain('hat-cho-cho');
    expect(slugs).not.toContain('gomsu');
    const leaf = res.body.data.find((c: { slug: string }) => c.slug === 'hat-cho-cho');
    expect(leaf._count).toMatchObject({ products: 1, children: 0 });
  });
});

describe('create', () => {
  it('adds at the end of the parent and refuses a fourth level or a used slug', async () => {
    const t = await tree();
    const res = await t.as('post', '').send({ name: 'Pate', slug: 'pate-cho-cho', parentId: t.group.id });
    expect(res.status).toBe(201);
    expect(res.body.data.sortOrder).toBe(1);
    expect((await t.as('post', '').send({ name: 'Quá sâu', slug: 'qua-sau', parentId: t.leaf.id })).body.error.code).toBe('CATEGORY_TOO_DEEP');
    expect((await t.as('post', '').send({ name: 'Trùng', slug: 'cho', parentId: t.root.id })).body.error.code).toBe('SLUG_TAKEN');
    expect((await t.as('post', '').send({ name: 'Ngoài', slug: 'ngoai', parentId: t.gomsu.id })).status).toBe(404);
  });
});

describe('update', () => {
  it('edits name and description', async () => {
    const t = await tree();
    const res = await t.as('patch', `/${t.leaf.id}`).send({ name: ' Hạt khô ', description: '' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'Hạt khô', description: null });
  });

  it('moves to another parent at the end, refusing cycles and depth over 3', async () => {
    const t = await tree();
    const moved = await t.as('patch', `/${t.group.id}`).send({ parentId: t.meo.id });
    expect(moved.status).toBe(200);
    expect(moved.body.data.parentId).toBe(t.meo.id);
    expect((await t.as('patch', `/${t.meo.id}`).send({ parentId: t.group.id })).body.error.code).toBe('CATEGORY_CYCLE');
    // meo now holds group → leaf (height 2); under cho (depth 1) it would reach a fourth level.
    expect((await t.as('patch', `/${t.meo.id}`).send({ parentId: t.cho.id })).body.error.code).toBe('CATEGORY_TOO_DEEP');
  });

  it('keeps the old slug as a redirect, and renaming back removes it', async () => {
    const t = await tree();
    expect((await t.as('patch', `/${t.leaf.id}`).send({ slug: 'hat-kho-cho-cho' })).status).toBe(200);
    expect((await call('get', '/api/v1/categories/resolve/hat-cho-cho', { brand: null })).body.data).toEqual({ slug: 'hat-kho-cho-cho' });
    // Another category may not take a slug that still redirects.
    expect((await t.as('post', '').send({ name: 'X', slug: 'hat-cho-cho', parentId: t.group.id })).body.error.code).toBe('SLUG_TAKEN');
    expect((await t.as('patch', `/${t.leaf.id}`).send({ slug: 'hat-cho-cho' })).status).toBe(200);
    expect((await call('get', '/api/v1/categories/resolve/hat-cho-cho', { brand: null })).status).toBe(404);
    expect((await call('get', '/api/v1/categories/resolve/hat-kho-cho-cho', { brand: null })).body.data).toEqual({ slug: 'hat-cho-cho' });
  });

  it('cannot touch the root or another storefront', async () => {
    const t = await tree();
    expect((await t.as('patch', `/${t.root.id}`).send({ name: 'X' })).status).toBe(404);
    expect((await t.as('patch', `/${t.gomsu.id}`).send({ name: 'X' })).status).toBe(404);
  });
});

describe('delete', () => {
  it('refuses a category that still holds children or products, deletes an empty one', async () => {
    const t = await tree();
    const busy = await t.as('delete', `/${t.group.id}`);
    expect(busy.status).toBe(409);
    expect(busy.body.error.code).toBe('CATEGORY_NOT_EMPTY');
    expect(busy.body.error.details).toMatchObject({ children: 1 });
    await createProduct(t.leaf.id);
    expect((await t.as('delete', `/${t.leaf.id}`)).body.error.details).toMatchObject({ products: 1 });
    expect((await t.as('delete', `/${t.meo.id}`)).status).toBe(200);
    expect(await prisma.category.findUnique({ where: { id: t.meo.id } })).toBeNull();
  });
});

describe('reorder', () => {
  it('writes the given order and refuses a list that is not exactly the siblings', async () => {
    const t = await tree();
    expect((await t.as('put', '/reorder').send({ parentId: t.root.id, ids: [t.meo.id, t.cho.id] })).status).toBe(200);
    const rows = await prisma.category.findMany({ where: { parentId: t.root.id }, orderBy: { sortOrder: 'asc' } });
    expect(rows.map((r) => r.slug)).toEqual(['meo', 'cho']);
    const bad = await t.as('put', '/reorder').send({ parentId: t.root.id, ids: [t.meo.id] });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('REORDER_MISMATCH');
  });
});
