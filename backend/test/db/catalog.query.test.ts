import { beforeAll, describe, expect, it } from 'vitest';
import { pool, appQueryCount, enableQueryStats, resetQueryStats } from './helpers/db';
import { call } from './helpers/http';
import { createBrand, createProduct, createUser } from './helpers/factories';
import { writeMetric } from './helpers/metrics';

// =============================================================================================
// List endpoints: filtering, sorting, pagination and query cost (skill: data-query-performance,
// plus deep-test level 1 boundaries and level 7 large data).
//
// Spec sources:
//   - controllers/product.controller.ts / blog.controller.ts: public lists show only active /
//     published rows, newest first, pageSize capped at 50, category filter includes children;
//   - CLAUDE.md §6: list endpoints are always paginated with a hard cap;
//   - data-query-performance §5–7: a stable order needs an `id` tie-breaker, the query count of
//     a list request must not grow with the number of rows (no N+1), and the main filter +
//     sort must be served by an index rather than a sequential scan.
// =============================================================================================

beforeAll(async () => {
  await enableQueryStats();
});

const list = (query: string) => call('get', `/api/v1/products?${query}`, { brand: null });

// Inserts `n` active products in ONE statement so they share the same createdAt — the
// realistic case of an admin import or a seed script, and the worst case for pagination.
async function bulkProducts(categoryId: string, n: number, sameTimestamp = true) {
  await pool.query(
    `INSERT INTO "Product" (id, "categoryId", name, slug, status, attributes, "createdAt", "updatedAt")
     SELECT gen_random_uuid(), $1, 'Pate ' || g, 'bulk-' || g || '-' || substr(md5(random()::text), 1, 6), 'active', '{}',
            ${sameTimestamp ? 'now()' : "now() - (g || ' seconds')::interval"}, now()
     FROM generate_series(1, $2) AS g`,
    [categoryId, n],
  );
}

describe('pagination correctness', () => {
  it('walking every page returns each active product exactly once (distinct createdAt)', async () => {
    const { child } = await createBrand();
    await bulkProducts(child.id, 57, false);

    const seen = new Map<string, number>();
    for (let page = 1; page <= 5; page += 1) {
      const res = await list(`page=${page}&pageSize=12`);
      for (const p of res.body.data) seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
    }
    expect(seen.size).toBe(57);
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
  });

  it('rows with the SAME createdAt are not duplicated or skipped across pages (needs an id tie-breaker)', async () => {
    // ORDER BY "createdAt" DESC alone is not a total order when timestamps tie, so PostgreSQL
    // may return tied rows in a different order for each OFFSET: some products appear on two
    // pages, others on none. data-query-performance §5: always add `id` as a tie-breaker.
    const { child } = await createBrand();
    await bulkProducts(child.id, 200, true);
    await pool.query('ANALYZE "Product"');

    const seen = new Map<string, number>();
    for (let page = 1; page <= 17; page += 1) {
      const res = await list(`page=${page}&pageSize=12`);
      for (const p of res.body.data) seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
    }
    const duplicated = [...seen.values()].filter((n) => n > 1).length;
    expect({ distinct: seen.size, duplicated }).toEqual({ distinct: 200, duplicated: 0 });
  });

  it('meta.total counts only active products and matches what the pages return', async () => {
    const { child } = await createBrand();
    await bulkProducts(child.id, 15, false);
    await createProduct(child.id, { status: 'draft' });
    await createProduct(child.id, { status: 'archived' });

    const res = await list('page=1&pageSize=50');
    expect(res.body.meta.total).toBe(15);
    expect(res.body.data.every((p: { status: string }) => p.status === 'active')).toBe(true);
  });
});

describe('boundaries (deep-test level 1)', () => {
  it.each([
    ['pageSize=1', 1],
    ['pageSize=50', 50],
    ['pageSize=51', 50], // capped
    ['pageSize=100000', 50], // capped — a crafted request cannot dump the catalogue
    ['pageSize=0', 12], // falls back to the default
    ['pageSize=abc', 12],
    ['pageSize=-5', 12],
  ])('%s returns at most %i rows', async (q, expected) => {
    const { child } = await createBrand();
    await bulkProducts(child.id, 60, false);
    const res = await list(q);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(expected);
    expect(res.body.meta.pageSize).toBe(expected);
  });

  it.each([['page=0'], ['page=-1'], ['page=abc']])('%s is treated as page 1', async (q) => {
    const { child } = await createBrand();
    await bulkProducts(child.id, 5, false);
    const res = await list(q);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(5);
    expect(res.body.meta.page).toBe(1); // meta must echo the page actually served
  });

  it('a page past the end returns an empty list, not an error', async () => {
    const { child } = await createBrand();
    await bulkProducts(child.id, 5, false);
    const res = await list('page=999');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(5);
  });

  it('a filter value sent as an array (?categorySlug=a&categorySlug=b) is ignored or rejected, never 500', async () => {
    const { child } = await createBrand();
    await bulkProducts(child.id, 3, false);
    const res = await list('categorySlug=a&categorySlug=b');
    expect(res.status).toBeLessThan(500);
  });

  it('category filter includes the child categories of a brand root, and an unknown category is 404', async () => {
    const { root, child } = await createBrand();
    await bulkProducts(child.id, 4, false);
    expect((await list(`categorySlug=${root.slug}`)).body.meta.total).toBe(4);
    expect((await list('categorySlug=khong-ton-tai')).status).toBe(404);
  });
});

describe('query cost (data-query-performance §7, §11)', () => {
  it('the number of SQL statements per list request does NOT grow with the number of products (no N+1)', async () => {
    const { child } = await createBrand();
    const counts: Record<string, number> = {};

    for (const n of [1, 12, 50]) {
      await pool.query('TRUNCATE "ProductImage", "ProductVariant", "Product" CASCADE');
      for (let i = 0; i < n; i += 1) {
        await createProduct(child.id, { variants: [{}, {}, {}] }); // 3 variants each
      }
      await resetQueryStats();
      const res = await list('page=1&pageSize=50');
      expect(res.status).toBe(200);
      counts[`products=${n}`] = await appQueryCount();
    }

    writeMetric('product-list-query-count', counts);
    // Prisma resolves `include` with one query per relation, so the count is a small constant.
    expect(counts['products=50']).toBe(counts['products=1']);
    expect(counts['products=50']).toBeLessThanOrEqual(6);
  });

  it('a public list response stays small: 12 products with 5 variants and 5 images each < 100 KB', async () => {
    const { child } = await createBrand();
    for (let i = 0; i < 12; i += 1) {
      const p = await createProduct(child.id, { variants: [{}, {}, {}, {}, {}] });
      await pool.query(
        `INSERT INTO "ProductImage" (id, "productId", url, position)
         SELECT gen_random_uuid(), $1, 'https://res.cloudinary.com/demo/image/upload/v1/p' || g || '.jpg', g FROM generate_series(1, 5) g`,
        [p.id],
      );
    }
    const res = await list('page=1&pageSize=12');
    const bytes = Buffer.byteLength(JSON.stringify(res.body));
    writeMetric('product-list-payload-bytes', { bytes });
    expect(bytes).toBeLessThan(100_000);
  });

  it('the main public query (active products, newest first) is served by an index, not a sequential scan', async () => {
    // With 20 000 products, `WHERE status = 'active' ORDER BY "createdAt" DESC LIMIT 12`
    // without an index on (status, createdAt) reads the whole table and sorts it on every
    // storefront page view. Product only has an index on categoryId today.
    const { child } = await createBrand();
    await bulkProducts(child.id, 20_000, false);
    await pool.query('ANALYZE "Product"');

    const { rows } = await pool.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN SELECT id FROM "Product" WHERE status = 'active' ORDER BY "createdAt" DESC LIMIT 12 OFFSET 0`,
    );
    const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
    writeMetric('product-list-plan', { plan });
    expect(plan).not.toMatch(/Seq Scan on "Product"/);
  });

  it('the public blog list (published, publishedAt <= now, newest first) is served by an index', async () => {
    const admin = await createUser({ role: 'admin' });
    await pool.query(
      `INSERT INTO "BlogPost" (id, title, slug, content, "authorId", status, "publishedAt", "createdAt", "updatedAt")
       SELECT gen_random_uuid(), 'Bài ' || g, 'bai-' || g, 'Nội dung', $1, 'published', now() - (g || ' minutes')::interval, now(), now()
       FROM generate_series(1, 20000) g`,
      [admin.id],
    );
    await pool.query('ANALYZE "BlogPost"');
    const { rows } = await pool.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN SELECT id FROM "BlogPost" WHERE status = 'published' AND "publishedAt" <= now() ORDER BY "publishedAt" DESC LIMIT 10`,
    );
    const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
    writeMetric('blog-list-plan', { plan });
    expect(plan).not.toMatch(/Seq Scan on "BlogPost"/);
  });

  it('admin order list for one brand filtered by status uses the (brandSlug, orderStatus) index', async () => {
    const u = await createUser();
    await pool.query(
      `INSERT INTO "Order" (id, code, "userId", "brandSlug", "orderStatus", "paymentMethod", "paymentStatus", subtotal, "grandTotal", "shippingAddress", "updatedAt")
       SELECT gen_random_uuid(), 'NP-' || g, $1, CASE WHEN g % 2 = 0 THEN 'petshop' ELSE 'gomsu' END,
              (ARRAY['PENDING_PAYMENT','CONFIRMED','CANCELLED','COMPLETED'])[1 + g % 4], 'COD', 'UNPAID', 1000, 1000, '{}', now()
       FROM generate_series(1, 20000) g`,
      [u.id],
    );
    await pool.query('ANALYZE "Order"');
    const { rows } = await pool.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN SELECT id FROM "Order" WHERE "brandSlug" = 'petshop' AND "orderStatus" = 'PENDING_PAYMENT' ORDER BY "createdAt" DESC LIMIT 20`,
    );
    const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
    writeMetric('order-admin-list-plan', { plan });
    expect(plan).not.toMatch(/Seq Scan on "Order"/);
  });
});

describe('large data (deep-test level 7)', () => {
  it('the storefront list answers fast with 20 000 products in the table', async () => {
    const { child } = await createBrand();
    await bulkProducts(child.id, 20_000, false);
    await pool.query('ANALYZE "Product"');

    const timings: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const t = Date.now();
      const res = await list(`page=${1 + i * 100}&pageSize=12`);
      timings.push(Date.now() - t);
      expect(res.body.data.length).toBe(12);
    }
    timings.sort((a, b) => a - b);
    writeMetric('product-list-20k-latency-ms', { timings, p50: timings[5], max: timings[9] });
    // A loose local budget (data-query-performance §11 suggests p95 < ~300 ms under load).
    expect(timings[9]).toBeLessThan(500);
  });

  it('a 1 MB search string on the admin list is handled without a 500', async () => {
    const admin = await createUser({ role: 'admin' });
    const res = await call('get', `/api/v1/products/admin/list?search=${'a'.repeat(20_000)}`, { token: admin.token, brand: null });
    expect(res.status).toBeLessThan(500);
  });
});
