import { beforeAll, describe, expect, it } from 'vitest';
import { enableQueryStats, pool, resetQueryStats } from './helpers/db';
import { call } from './helpers/http';
import { createBrand, createProduct, createUser, fillCart } from './helpers/factories';
import prisma from '../../services/prisma';
import { categoryScopeIds } from '../../services/categoryScope.service';

// Resolving the shop (resolveBrand) and a category filter (categoryScopeIds) read the category
// table ONCE per request (the whole tree is small), instead of a lookup by slug followed by a
// read of the whole table. Fewer round trips to a database that may be far away, and nothing is
// cached, so a category written by any process — admin, seed script, another instance — is seen
// by the very next request. (Decision 2026-11-05: no in-memory cache, see docs/PROGRESS.md.)

beforeAll(async () => {
  await enableQueryStats();
});

async function categoryQueries(run: () => Promise<unknown>): Promise<number> {
  await resetQueryStats();
  await run();
  const { rows } = await pool.query<{ n: string }>(`
    SELECT COALESCE(sum(calls), 0)::text AS n FROM pg_stat_statements
    WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND query ~ '"Category"' AND query !~* 'pg_stat_statements|TRUNCATE'`);
  return Number(rows[0].n);
}

describe('category reads per request', () => {
  it('resolving the shop reads the category table once', async () => {
    const { child } = await createBrand();
    const u = await createUser();
    const p = await createProduct(child.id);
    await fillCart(u.id, [{ variantId: p.variants[0].id, quantity: 1 }]);
    expect(await categoryQueries(async () => expect((await call('get', '/api/v1/cart', { token: u.token })).status).toBe(200))).toBe(1);
  });

  it('a category filter reads the category table once', async () => {
    // Called directly: the product list itself also loads each product's category.
    const { root, child } = await createBrand();
    let ids: string[] = [];
    expect(await categoryQueries(async () => { ids = await categoryScopeIds(root.slug); })).toBe(1);
    expect(ids.sort()).toEqual([root.id, child.id].sort());
  });
});

describe('answers are unchanged', () => {
  it('refuses an unknown shop and a category that is not a shop root', async () => {
    const { child } = await createBrand();
    const u = await createUser();
    expect((await call('get', '/api/v1/cart', { token: u.token, brand: 'khong-co' })).body.error.code).toBe('BRAND_NOT_FOUND');
    expect((await call('get', '/api/v1/cart', { token: u.token, brand: child.slug })).body.error.code).toBe('BRAND_NOT_FOUND');
  });

  it('refuses an unknown category filter', async () => {
    await createBrand();
    expect((await call('get', '/api/v1/products?categorySlug=khong-co')).body.error.code).toBe('CATEGORY_NOT_FOUND');
  });

  it('sees a category created by another process on the very next request', async () => {
    const { child } = await createBrand();
    expect((await call('get', `/api/v1/products?categorySlug=${child.slug}`)).status).toBe(200);
    // Written straight to the database, the way a seed script in another process would.
    const fresh = await prisma.category.create({ data: { slug: 'moi-tao', name: 'Mới tạo', parentId: child.id } });
    const res = await call('get', `/api/v1/products?categorySlug=${fresh.slug}`);
    expect(res.status).toBe(200);
  });
});
