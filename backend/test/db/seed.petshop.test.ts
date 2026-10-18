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
    expect(cats.body.data.filter((c: { parentId: string | null }) => c.parentId === root.id).length).toBeGreaterThanOrEqual(5);
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
