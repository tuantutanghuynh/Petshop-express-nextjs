import { describe, expect, it } from 'vitest';
import { pool, countRows } from './helpers/db';
import { call, LEAK } from './helpers/http';
import { ITER, statusHistogram } from './helpers/concurrency';
import { createBrand, createProduct, createUser, fillCart } from './helpers/factories';

// =============================================================================================
// Cart API (skill: deep-test levels 0–8).
//
// Spec sources: routes/cart.route.ts (quantity 1–99 per line, auth + brand on every route),
// controllers/cart.controller.ts header comments (prices never stored, warnings instead of
// errors for stock problems, lines scoped to the caller's own cart, variants from another
// brand must look like they do not exist).
// =============================================================================================

async function shop(stock = 10, price = 75_000) {
  const { child } = await createBrand();
  const product = await createProduct(child.id, { variants: [{ stock, price }] });
  return { product, variant: product.variants[0] };
}

const add = (token: string, body: Record<string, unknown>, brand?: string | null) =>
  call('post', '/api/v1/cart/items', { token, brand }).send(body);

describe('L0 happy path', () => {
  it('a new customer gets an empty cart shell instead of 404', async () => {
    await createBrand();
    const u = await createUser();
    const res = await call('get', '/api/v1/cart', { token: u.token });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: null, brandSlug: 'petshop', items: [], subtotal: 0, hasIssues: false });
  });

  it('adding a variant creates the cart, defaults quantity to 1 and adding again increments', async () => {
    const { variant } = await shop();
    const u = await createUser();
    expect((await add(u.token, { variantId: variant.id })).body.data.quantity).toBe(1);
    expect((await add(u.token, { variantId: variant.id, quantity: 2 })).body.data.quantity).toBe(3);
    expect(await countRows('CartItem')).toBe(1); // one line, not two
  });

  it('GET recomputes totals from TODAY’S price, not the price when the item was added', async () => {
    const { variant } = await shop(10, 75_000);
    const u = await createUser();
    await fillCart(u.id, [{ variantId: variant.id, quantity: 2 }]);
    await pool.query(`UPDATE "ProductVariant" SET price = 90000 WHERE id = $1`, [variant.id]);

    const res = await call('get', '/api/v1/cart', { token: u.token });
    expect(res.body.data.items[0]).toMatchObject({ unitPrice: 90_000, lineTotal: 180_000 });
    expect(res.body.data.subtotal).toBe(180_000);
  });

  it('PATCH replaces the quantity (idempotent on retry) and DELETE removes the line', async () => {
    const { variant } = await shop();
    const u = await createUser();
    const lineId = (await add(u.token, { variantId: variant.id })).body.data.id;
    const patch = () => call('patch', `/api/v1/cart/items/${lineId}`, { token: u.token }).send({ quantity: 4 });
    await patch();
    expect((await patch()).body.data.quantity).toBe(4); // retrying does not double it
    expect((await call('delete', `/api/v1/cart/items/${lineId}`, { token: u.token })).status).toBe(200);
    expect(await countRows('CartItem')).toBe(0);
  });
});

describe('L1 boundaries & L4 stock warnings', () => {
  it.each([[1], [99]])('accepts quantity %i', async (quantity) => {
    const { variant } = await shop(200);
    const u = await createUser();
    expect((await add(u.token, { variantId: variant.id, quantity })).status).toBe(201);
  });

  it.each([[0], [100], [-1], [1.5], ['abc'], [null]])('rejects quantity %j with 422', async (quantity) => {
    const { variant } = await shop();
    const u = await createUser();
    const res = await add(u.token, { variantId: variant.id, quantity });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).not.toMatch(LEAK);
  });

  it('the 99-per-line cap also holds when the same variant is added twice (99 + 99)', async () => {
    // The route caps each REQUEST at 99, but addItem increments the existing line without a
    // cap, so two adds produce a line of 198 — the overflow the route comment warns about.
    const { variant } = await shop(500);
    const u = await createUser();
    await add(u.token, { variantId: variant.id, quantity: 99 });
    await add(u.token, { variantId: variant.id, quantity: 99 });
    const { rows } = await pool.query<{ quantity: number }>(`SELECT quantity FROM "CartItem"`);
    expect(rows[0].quantity).toBeLessThanOrEqual(99);
  });

  it('exceeding available stock is a WARNING on the line, not a refusal', async () => {
    const { variant } = await shop(2);
    const u = await createUser();
    const res = await add(u.token, { variantId: variant.id, quantity: 5 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ quantity: 5, available: 2, warning: 'INSUFFICIENT_STOCK' });
  });

  it('GET flags OUT_OF_STOCK / UNAVAILABLE lines and sets hasIssues, while still rendering the cart', async () => {
    const { child } = await createBrand();
    const soldOut = await createProduct(child.id, { variants: [{ stock: 3, reserved: 3 }] });
    const archived = await createProduct(child.id, { variants: [{ stock: 5 }] });
    const u = await createUser();
    await fillCart(u.id, [
      { variantId: soldOut.variants[0].id, quantity: 1 },
      { variantId: archived.variants[0].id, quantity: 1 },
    ]);
    await pool.query(`UPDATE "Product" SET status = 'archived' WHERE id = $1`, [archived.id]);

    const res = await call('get', '/api/v1/cart', { token: u.token });
    expect(res.status).toBe(200);
    const warnings = res.body.data.items.map((i: { warnings: string[] }) => i.warnings[0]).sort();
    expect(warnings).toEqual(['OUT_OF_STOCK', 'UNAVAILABLE']);
    expect(res.body.data.hasIssues).toBe(true);
  });
});

describe('L2 invalid input & L3 access control', () => {
  it('missing X-Brand-Slug → 400 BRAND_REQUIRED; unknown brand → 404', async () => {
    const u = await createUser();
    expect((await call('get', '/api/v1/cart', { token: u.token, brand: null })).body.error.code).toBe('BRAND_REQUIRED');
    expect((await call('get', '/api/v1/cart', { token: u.token, brand: 'khong-co' })).status).toBe(404);
  });

  it('an unknown variant id answers 404 (including SQL-ish garbage)', async () => {
    await createBrand();
    const u = await createUser();
    for (const variantId of ['00000000-0000-0000-0000-000000000000', "' OR 1=1 --"]) {
      const res = await add(u.token, { variantId });
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toMatch(LEAK);
    }
  });

  it('a variant id posted as an array or object is rejected cleanly (4xx, not 500)', async () => {
    await createBrand();
    const u = await createUser();
    for (const variantId of [['a', 'b'], { id: 'x' }]) {
      const res = await add(u.token, { variantId });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
  });

  it('an archived product cannot be added (409)', async () => {
    const { child } = await createBrand();
    const p = await createProduct(child.id, { status: 'archived' });
    const u = await createUser();
    expect((await add(u.token, { variantId: p.variants[0].id })).status).toBe(409);
  });

  it("a variant belonging to another brand looks like it does not exist (404)", async () => {
    await createBrand('petshop');
    const other = await createBrand('gomsu');
    const pottery = await createProduct(other.child.id);
    const u = await createUser();
    expect((await add(u.token, { variantId: pottery.variants[0].id })).status).toBe(404);
  });

  it("IDOR: one customer cannot read, change or delete another customer's cart line", async () => {
    const { variant } = await shop();
    const owner = await createUser();
    const stranger = await createUser();
    const lineId = (await add(owner.token, { variantId: variant.id })).body.data.id;

    expect((await call('patch', `/api/v1/cart/items/${lineId}`, { token: stranger.token }).send({ quantity: 9 })).status).toBe(404);
    expect((await call('delete', `/api/v1/cart/items/${lineId}`, { token: stranger.token })).status).toBe(404);
    expect((await call('get', '/api/v1/cart', { token: stranger.token })).body.data.items).toEqual([]);
    const { rows } = await pool.query<{ quantity: number }>(`SELECT quantity FROM "CartItem" WHERE id = $1`, [lineId]);
    expect(rows[0].quantity).toBe(1);
  });

  it('carts are separate per brand for the same user', async () => {
    const { variant } = await shop();
    await createBrand('gomsu');
    const u = await createUser();
    await add(u.token, { variantId: variant.id });
    expect((await call('get', '/api/v1/cart', { token: u.token, brand: 'gomsu' })).body.data.items).toEqual([]);
  });
});

describe('L6 concurrency', () => {
  it(`10 simultaneous "add to cart" for a customer with NO cart yet all succeed and sum up — ${ITER}x`, async () => {
    // Two upserts race: cart.upsert (unique userId+brandSlug) and cartItem.upsert (unique
    // cartId+variantId). Prisma's upsert is SELECT-then-INSERT, so concurrent first adds can
    // collide on the unique index (P2002) and answer 500 instead of adding the item.
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const { variant } = await shop(100);
      const u = await createUser();
      const responses = await Promise.all(Array.from({ length: 10 }, () => add(u.token, { variantId: variant.id })));
      const hist = statusHistogram(responses);
      const { rows } = await pool.query<{ q: number | null; carts: string }>(
        `SELECT (SELECT sum(quantity) FROM "CartItem" ci JOIN "Cart" c ON c.id = ci."cartId" WHERE c."userId" = $1)::int AS q,
                (SELECT count(*) FROM "Cart" WHERE "userId" = $1)::text AS carts`,
        [u.id],
      );
      if (hist[201] !== 10 || rows[0].q !== 10 || rows[0].carts !== '1') failures.push({ iteration: i, hist, ...rows[0] });
    }
    expect(failures).toEqual([]);
  });

  it('concurrent increments on an EXISTING line are not lost (atomic `increment`)', async () => {
    const { variant } = await shop(100);
    const u = await createUser();
    await add(u.token, { variantId: variant.id, quantity: 1 });
    await Promise.all(Array.from({ length: 20 }, () => add(u.token, { variantId: variant.id, quantity: 1 })));
    const { rows } = await pool.query<{ quantity: number }>(`SELECT quantity FROM "CartItem"`);
    expect(rows[0].quantity).toBe(21);
  });
});
