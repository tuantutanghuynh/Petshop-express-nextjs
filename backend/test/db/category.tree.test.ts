import { describe, expect, it } from 'vitest';
import prisma from '../../services/prisma';
import { call } from './helpers/http';
import { createProduct } from './helpers/factories';

// Three levels under the brand root (spec 2026-10-20 category tree): a product filed on a leaf
// must show on the leaf, its group, its species and the brand root listing — and nowhere else.
async function threeLevels() {
  const root = await prisma.category.create({ data: { slug: 'petshop', name: 'Shop' } });
  const cho = await prisma.category.create({ data: { slug: 'cho', name: 'Chó', parentId: root.id, sortOrder: 0 } });
  const group = await prisma.category.create({ data: { slug: 'cho-thuc-an', name: 'Thức ăn', parentId: cho.id } });
  const leaf = await prisma.category.create({ data: { slug: 'hat-cho-cho', name: 'Hạt cho chó', parentId: group.id } });
  await prisma.category.create({ data: { slug: 'meo', name: 'Mèo', parentId: root.id, sortOrder: 1 } });
  return { leaf };
}

describe('category subtree filter', () => {
  it('lists a leaf product at every ancestor level', async () => {
    const { leaf } = await threeLevels();
    await createProduct(leaf.id);
    for (const slug of ['hat-cho-cho', 'cho-thuc-an', 'cho', 'petshop']) {
      const res = await call('get', `/api/v1/products?categorySlug=${slug}`, { brand: null });
      expect(res.status, slug).toBe(200);
      expect(res.body.meta.total, slug).toBe(1);
    }
    const other = await call('get', '/api/v1/products?categorySlug=meo', { brand: null });
    expect(other.body.meta.total).toBe(0);
  });

  it('returns categories ordered by sortOrder', async () => {
    await threeLevels();
    await prisma.category.update({ where: { slug: 'cho' }, data: { sortOrder: 5 } });
    const res = await call('get', '/api/v1/categories', { brand: null });
    const species = res.body.data.filter((c: { slug: string }) => ['cho', 'meo'].includes(c.slug)).map((c: { slug: string }) => c.slug);
    expect(species).toEqual(['meo', 'cho']);
  });

  it('filters by brand, ignoring case, within a category', async () => {
    const { leaf } = await threeLevels();
    await createProduct(leaf.id, { brand: 'Royal Canin' });
    await createProduct(leaf.id, { brand: 'Other' });
    const res = await call('get', '/api/v1/products?categorySlug=cho&brand=royal%20canin', { brand: null });
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].brand).toBe('Royal Canin');
  });
});
