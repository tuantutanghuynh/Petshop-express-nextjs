import { describe, expect, it } from 'vitest';
import prisma from '../../services/prisma';
import { pool } from './helpers/db';
import { call } from './helpers/http';
import { seedPetshopCatalog } from '../../scripts/petshopCatalog';

// The local demo catalogue. It must be safe to run again (no duplicates, no stock reset), it must
// keep the inventory ledger invariant — sum(delta) per variant = stockQuantity — and the storefront
// API must see it as the "petshop" brand.
describe('seedPetshopCatalog', () => {
  it('creates the petshop root with its categories and active products', async () => {
    await seedPetshopCatalog(prisma);

    const res = await call('get', '/api/v1/products?categorySlug=petshop&pageSize=50');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(10);

    const cats = await call('get', '/api/v1/categories');
    const root = cats.body.data.find((c: { slug: string; parentId: string | null }) => c.slug === 'petshop' && c.parentId === null);
    expect(root).toBeDefined();
    // Spec 2026-10-20: the shop's top level is the species, everything else hangs below them.
    const species = cats.body.data.filter((c: { parentId: string | null }) => c.parentId === root.id).map((c: { slug: string }) => c.slug);
    expect(species).toEqual(['cho', 'meo']);
  });

  it('files demo products on tree leaves and keeps the food spec table', async () => {
    await seedPetshopCatalog(prisma);
    const hat = await prisma.product.findUniqueOrThrow({
      where: { slug: 'hat-cho-cho-truong-thanh-vi-ga' },
      include: { category: { include: { attributes: true } } },
    });
    expect(hat.category.slug).toBe('hat-cho-cho');
    expect(hat.category.attributes.map((a) => a.attributeKey).sort()).toEqual(['do_tuoi', 'khoi_luong', 'xuat_xu']);
    expect(await prisma.category.count({ where: { slug: { in: ['thuc-an-hat', 'pate', 'phu-kien', 'suc-khoe'] } } })).toBe(0);
  });

  it('moves demo products off the old flat categories of an earlier seed, then removes them', async () => {
    const root = await prisma.category.create({ data: { slug: 'petshop', name: 'Siêu thị của chó mèo' } });
    const pate = await prisma.category.create({ data: { slug: 'pate', name: 'Pate', parentId: root.id } });
    const keep = await prisma.category.create({ data: { slug: 'phu-kien', name: 'Phụ kiện', parentId: root.id } });
    await prisma.product.create({ data: { slug: 'pate-cho-vi-bo', name: 'Pate cho chó vị bò', categoryId: pate.id, attributes: {} } });
    await prisma.product.create({ data: { slug: 'owner-product', name: 'Owner product', categoryId: keep.id, attributes: {} } });

    await seedPetshopCatalog(prisma);

    const moved = await prisma.product.findUniqueOrThrow({ where: { slug: 'pate-cho-vi-bo' }, include: { category: true } });
    expect(moved.category.slug).toBe('pate-cho-cho');
    expect(await prisma.category.findUnique({ where: { slug: 'pate' } })).toBeNull();
    // A category that still holds a product the seed does not own is left alone.
    expect(await prisma.category.findUnique({ where: { slug: 'phu-kien' } })).not.toBeNull();
  });

  it('covers the storefront states: several variants, a real discount, out of stock', async () => {
    await seedPetshopCatalog(prisma);
    const variants = await prisma.productVariant.findMany({ select: { productId: true, price: true, compareAtPrice: true, stockQuantity: true } });
    const perProduct = new Map<string, number>();
    for (const v of variants) perProduct.set(v.productId, (perProduct.get(v.productId) ?? 0) + 1);
    expect([...perProduct.values()].some((n) => n > 1)).toBe(true);
    expect(variants.some((v) => v.compareAtPrice !== null && v.compareAtPrice > v.price)).toBe(true);
    expect(variants.some((v) => v.stockQuantity === 0)).toBe(true);
  });

  it('can run twice without duplicating rows or touching stock', async () => {
    await seedPetshopCatalog(prisma);
    const before = await pool.query(`SELECT (SELECT count(*) FROM "Product") p, (SELECT count(*) FROM "ProductVariant") v,
      (SELECT count(*) FROM "Category") c, (SELECT count(*) FROM "InventoryMovement") m, (SELECT sum("stockQuantity") FROM "ProductVariant") s`);
    await seedPetshopCatalog(prisma);
    const after = await pool.query(`SELECT (SELECT count(*) FROM "Product") p, (SELECT count(*) FROM "ProductVariant") v,
      (SELECT count(*) FROM "Category") c, (SELECT count(*) FROM "InventoryMovement") m, (SELECT sum("stockQuantity") FROM "ProductVariant") s`);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('records opening stock in the ledger for every variant', async () => {
    await seedPetshopCatalog(prisma);
    const { rows } = await pool.query(`
      SELECT v."sku", v."stockQuantity", COALESCE(sum(m."delta"), 0)::int AS ledger
      FROM "ProductVariant" v LEFT JOIN "InventoryMovement" m ON m."variantId" = v."id"
      GROUP BY v."id" HAVING v."stockQuantity" <> COALESCE(sum(m."delta"), 0)`);
    expect(rows).toEqual([]);
  });
});
