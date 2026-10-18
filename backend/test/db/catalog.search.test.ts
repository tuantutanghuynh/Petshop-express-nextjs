import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import prisma from '../../services/prisma';
import { toSearchText } from '../../utils/searchText';
import { pool } from './helpers/db';
import { call } from './helpers/http';
import { BRAND, createAdmin, createBrand, createProduct } from './helpers/factories';
import { runConcurrently } from './helpers/concurrency';

// Public search (q) and sort for GET /api/v1/products, and the two derived columns behind them:
//   searchName — accent-free lower-case name, so "pate meo" finds "Pate mèo";
//   minPrice   — cheapest variant price, the sort key for "price" / "-price".
// Invariant checked after every write path: minPrice = MIN(variant.price) of the product.

async function minPriceOf(productId: string) {
  const { rows } = await pool.query(
    `SELECT p."minPrice" AS stored, (SELECT MIN(v."price") FROM "ProductVariant" v WHERE v."productId" = p."id") AS actual
     FROM "Product" p WHERE p."id" = $1`, [productId]);
  return rows[0] as { stored: number | null; actual: number | null };
}

async function adminCreate(token: string, categoryId: string, name: string, slug: string, prices: number[]) {
  const res = await call('post', '/api/v1/products', { token }).send({
    categoryId, name, slug, status: 'active',
    variants: prices.map((price, i) => ({ sku: `${slug}-${i}`, price, stockQuantity: 5 })),
  });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; variants: { id: string; price: number }[] };
}

describe('search text backfill', () => {
  it('the SQL in the migration gives exactly what toSearchText gives', async () => {
    const dir = path.join(__dirname, '../../prisma/migrations');
    const file = readdirSync(dir).find((d) => d.endsWith('_add_product_search_and_min_price'));
    const sql = readFileSync(path.join(dir, file!, 'migration.sql'), 'utf8');
    const expr = /SET "searchName" = ([\s\S]*?\));\n/.exec(sql)![1].replaceAll('"name"', 'x');
    const samples = ['Pate mèo vị cá ngừ', '  ĐỆM NGỦ  êm ', 'Sữa tắm Ưu đãi', 'Hạt cho chó trưởng thành', 'Xương gặm Ỷ Ỹ', 'Crème brûlée'];
    for (const s of samples) {
      const { rows } = await pool.query(`SELECT ${expr} AS out FROM (VALUES ($1::text)) t(x)`, [s]);
      expect(rows[0].out, s).toBe(toSearchText(s));
    }
  });
});

describe('derived columns on every write path', () => {
  it('create fills searchName and minPrice', async () => {
    const { child } = await createBrand();
    const admin = await createAdmin();
    const p = await adminCreate(admin.token, child.id, 'Pate Mèo Vị Cá', 'pate-meo-vi-ca', [28000, 18000]);
    const row = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.searchName).toBe('pate meo vi ca');
    expect(row.minPrice).toBe(18000);
  });

  it('renaming updates searchName', async () => {
    const { child } = await createBrand();
    const admin = await createAdmin();
    const p = await adminCreate(admin.token, child.id, 'Pate mèo', 'pate-a', [10000]);
    expect((await call('patch', `/api/v1/products/${p.id}`, { token: admin.token }).send({ name: 'Hạt chó' })).status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).searchName).toBe('hat cho');
  });

  it('price change, new variant and removed variant all keep minPrice right', async () => {
    const { child } = await createBrand();
    const admin = await createAdmin();
    const p = await adminCreate(admin.token, child.id, 'Cát mèo', 'cat-meo', [50000, 30000]);
    const cheap = p.variants.find((v) => v.price === 30000)!;

    await call('patch', `/api/v1/products/variants/${cheap.id}`, { token: admin.token }).send({ price: 60000 });
    expect(await minPriceOf(p.id)).toEqual({ stored: 50000, actual: 50000 });

    const added = await call('post', `/api/v1/products/${p.id}/variants`, { token: admin.token }).send({ sku: 'cat-meo-new', price: 20000, stockQuantity: 1 });
    expect(added.status).toBe(201);
    expect(await minPriceOf(p.id)).toEqual({ stored: 20000, actual: 20000 });

    expect((await call('delete', `/api/v1/products/variants/${added.body.data.id}`, { token: admin.token })).status).toBe(200);
    expect(await minPriceOf(p.id)).toEqual({ stored: 50000, actual: 50000 });
  });

  it('concurrent price changes on two variants still leave the true minimum (race)', async () => {
    const { child } = await createBrand();
    const admin = await createAdmin();
    for (let round = 0; round < 10; round += 1) {
      const p = await adminCreate(admin.token, child.id, `Đệm ${round}`, `dem-${round}`, [40000, 40000]);
      const [a, b] = p.variants;
      // Both lower their own variant at the same moment; the product must end at 10000.
      await runConcurrently(2, (i) =>
        call('patch', `/api/v1/products/variants/${i === 0 ? a.id : b.id}`, { token: admin.token }).send({ price: i === 0 ? 10000 : 20000 }),
      );
      expect(await minPriceOf(p.id), `round ${round}`).toEqual({ stored: 10000, actual: 10000 });
    }
  });
});

describe('GET /products?q=', () => {
  it('finds products with or without diacritics, in any case', async () => {
    const { child } = await createBrand();
    await createProduct(child.id, { name: 'Pate mèo vị cá ngừ', slug: 'pate-ca-ngu' });
    await createProduct(child.id, { name: 'Hạt cho chó', slug: 'hat-cho' });
    for (const q of ['pate meo', 'PATE MÈO', 'cá ngừ', '  ca   ngu ']) {
      const res = await call('get', `/api/v1/products?categorySlug=${BRAND}&q=${encodeURIComponent(q)}`);
      expect(res.status, q).toBe(200);
      expect(res.body.data.map((p: { slug: string }) => p.slug), q).toEqual(['pate-ca-ngu']);
      expect(res.body.meta.total).toBe(1);
    }
  });

  it('treats % and _ as plain characters, not wildcards', async () => {
    const { child } = await createBrand();
    await createProduct(child.id, { name: 'Pate mèo', slug: 'pate-x' });
    const res = await call('get', `/api/v1/products?q=${encodeURIComponent('%%')}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it.each([['a'], ['x'.repeat(101)], ['  ']])('rejects q=%j with 422', async (q) => {
    const res = await call('get', `/api/v1/products?q=${encodeURIComponent(q)}`);
    expect(res.status).toBe(422);
  });
});

describe('GET /products?sort=', () => {
  it('sorts by cheapest variant both ways, stable across pages', async () => {
    const { child } = await createBrand();
    const prices = [30000, 10000, 20000, 10000, 50000];
    for (const [i, price] of prices.entries()) await createProduct(child.id, { slug: `p-${i}`, variants: [{ price }, { price: price + 5000 }] });

    const page = async (sort: string, n: number) =>
      (await call('get', `/api/v1/products?categorySlug=${BRAND}&sort=${sort}&pageSize=2&page=${n}`)).body.data.map(
        (p: { variants: { price: number }[] }) => p.variants[0].price,
      );
    const asc = [...(await page('price', 1)), ...(await page('price', 2)), ...(await page('price', 3))];
    expect(asc).toEqual([10000, 10000, 20000, 30000, 50000]);
    const desc = [...(await page('-price', 1)), ...(await page('-price', 2)), ...(await page('-price', 3))];
    expect(desc).toEqual([50000, 30000, 20000, 10000, 10000]);
  });

  it.each([['name'], ['createdAt'], ['price;drop'], ['']])('rejects sort=%j with 422', async (sort) => {
    expect((await call('get', `/api/v1/products?sort=${encodeURIComponent(sort)}`)).status).toBe(422);
  });

  it('the price sort uses the (status, minPrice, id) index, not a full sort of the table', async () => {
    const { child } = await createBrand();
    for (let i = 0; i < 200; i += 1) await createProduct(child.id, { slug: `bulk-${i}`, variants: [{ price: 1000 + i }] });
    await pool.query('ANALYZE "Product"');
    await pool.query('SET enable_seqscan = off'); // tiny test tables would otherwise always seq scan
    const { rows } = await pool.query(`EXPLAIN SELECT id FROM "Product" WHERE status = 'active' ORDER BY "minPrice" ASC NULLS LAST, id ASC LIMIT 24`);
    await pool.query('RESET enable_seqscan');
    const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
    expect(plan).toMatch(/Product_status_minPrice_id_idx/);
  });
});
