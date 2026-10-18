import { describe, expect, it } from 'vitest';
import { pool, countRows } from './helpers/db';
import { call, LEAK } from './helpers/http';
import { ITER, statusHistogram } from './helpers/concurrency';
import { createAdmin, createBrand, createProduct, createUser, fillCart } from './helpers/factories';

// =============================================================================================
// Admin & content endpoints: products, variants, categories, blog, quote requests, settings,
// contact (skill: deep-test levels 0–8; the check-then-insert races from
// transaction-race-test L2 "duplicate insert").
//
// Spec sources: the header comments of each controller (409 SLUG_TAKEN / SKU_TAKEN instead of
// raw Prisma errors, scheduled posts hidden until publishedAt, quotes are brand-scoped and
// only NEW ones can be deleted, every response in the { data, meta, error } envelope —
// utils/ApiResponse.ts).
// =============================================================================================

describe('products (admin)', () => {
  const newProduct = (categoryId: string, slug: string, sku = `SKU-${slug}`) => ({
    categoryId,
    name: 'Hạt cho mèo con',
    slug,
    status: 'active',
    variants: [{ sku, price: 150_000, stockQuantity: 5 }],
  });

  it('L0 creates a product with its variants in one call (201), defaulting to draft when no status is sent', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    const { status: _s, ...noStatus } = newProduct(child.id, 'hat-meo-con');
    const res = await call('post', '/api/v1/products', { token: admin.token }).send(noStatus);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ slug: 'hat-meo-con', status: 'draft' });
    expect(res.body.data.variants[0]).toMatchObject({ sku: 'SKU-hat-meo-con', price: 150_000, stockQuantity: 5, reservedQuantity: 0 });
  });

  it('L4 duplicate slug and duplicate SKU are 409, duplicated SKUs inside one request are 422', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    await call('post', '/api/v1/products', { token: admin.token }).send(newProduct(child.id, 'a', 'SKU-1'));
    expect((await call('post', '/api/v1/products', { token: admin.token }).send(newProduct(child.id, 'a', 'SKU-2'))).body.error.code).toBe('SLUG_TAKEN');
    expect((await call('post', '/api/v1/products', { token: admin.token }).send(newProduct(child.id, 'b', 'SKU-1'))).body.error.code).toBe('SKU_TAKEN');
    const dup = await call('post', '/api/v1/products', { token: admin.token }).send({
      ...newProduct(child.id, 'c'),
      variants: [{ sku: 'X', price: 1 }, { sku: 'X', price: 2 }],
    });
    expect(dup.status).toBe(422);
  });

  it(`L6 the same slug created twice at once (double click on "Lưu") gives one 201 and one 409, never 500 — ${ITER}x`, async () => {
    // Check-then-insert: both requests see "slug free", both INSERT, the unique index rejects
    // one with P2002 — which errorHandler turns into a 500 instead of SLUG_TAKEN.
    const admin = await createAdmin();
    const { child } = await createBrand();
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const responses = await Promise.all([
        call('post', '/api/v1/products', { token: admin.token }).send(newProduct(child.id, `race-${i}`, `R-${i}-a`)),
        call('post', '/api/v1/products', { token: admin.token }).send(newProduct(child.id, `race-${i}`, `R-${i}-b`)),
      ]);
      const hist = statusHistogram(responses);
      if (hist[201] !== 1 || hist[409] !== 1) failures.push({ iteration: i, hist });
    }
    expect(failures).toEqual([]);
  });

  it.each([
    ['negative price', { price: -1 }],
    ['decimal price', { price: 1.5 }],
    ['price as text', { price: 'mười nghìn' }],
    ['price beyond the Int column (2^31)', { price: 2 ** 31 }],
  ])('L1/L2 rejects a variant with %s (4xx, not 500)', async (_n, override) => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    const res = await call('post', '/api/v1/products', { token: admin.token }).send({
      ...newProduct(child.id, 'gia-sai'),
      variants: [{ sku: 'S', ...override }],
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(JSON.stringify(res.body)).not.toMatch(LEAK);
  });

  it('L4 stock cannot be set below the units reserved for pending orders (sequential case)', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    const p = await createProduct(child.id, { variants: [{ stock: 10, reserved: 3 }] });
    // stock is set by physical count since ADR-007 (PATCH no longer accepts stockQuantity)
    const res = await call('post', `/api/v1/products/variants/${p.variants[0].id}/stock-movements`, { token: admin.token }).send({ type: 'STOCKTAKE', countedQuantity: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STOCK_BELOW_RESERVED');
  });

  it('L4 the last variant of a product cannot be removed', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    const p = await createProduct(child.id);
    expect((await call('delete', `/api/v1/products/variants/${p.variants[0].id}`, { token: admin.token })).status).toBe(400);
  });

  it('L4 deleting a product keeps past orders readable (the order lines are snapshots)', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    const p = await createProduct(child.id, { variants: [{ stock: 5, price: 99_000 }] });
    const u = await createUser();
    await fillCart(u.id, [{ variantId: p.variants[0].id, quantity: 1 }]);
    const order = (await call('post', '/api/v1/orders', { token: u.token }).send({ paymentMethod: 'COD', shippingAddress: { fullName: 'A', phone: '1', addressLine: 'B', city: 'C' } })).body.data;

    const del = await call('delete', `/api/v1/products/${p.id}`, { token: admin.token });
    expect(del.status).toBe(200);
    const mine = await call('get', `/api/v1/orders/${order.code}`, { token: u.token });
    expect(mine.body.data.items[0]).toMatchObject({ productName: p.name, unitPrice: 99_000, variantId: null });
  });

  it('L4 deleting a product that sits in a customer cart removes the cart line instead of failing', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    const p = await createProduct(child.id);
    const u = await createUser();
    await fillCart(u.id, [{ variantId: p.variants[0].id, quantity: 1 }]);
    expect((await call('delete', `/api/v1/products/${p.id}`, { token: admin.token })).status).toBe(200);
    expect(await countRows('CartItem')).toBe(0);
  });

  it('L3 drafts and archived products are invisible on the public detail endpoint (404, not 403)', async () => {
    const { child } = await createBrand();
    const draft = await createProduct(child.id, { status: 'draft' });
    expect((await call('get', `/api/v1/products/${draft.slug}`, { brand: null })).status).toBe(404);
  });
});

describe('blog', () => {
  const post = (slug: string, extra: Record<string, unknown> = {}) => ({ title: 'Lịch tẩy giun cho mèo', slug, content: '# Nội dung', ...extra });

  it('L0 a published post is public; a draft and a post scheduled for tomorrow are 404', async () => {
    const admin = await createAdmin();
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await call('post', '/api/v1/blog', { token: admin.token, brand: null }).send(post('live', { status: 'published' }));
    await call('post', '/api/v1/blog', { token: admin.token, brand: null }).send(post('draft'));
    await call('post', '/api/v1/blog', { token: admin.token, brand: null }).send(post('later', { status: 'published', publishedAt: tomorrow }));

    expect((await call('get', '/api/v1/blog/live', { brand: null })).status).toBe(200);
    expect((await call('get', '/api/v1/blog/draft', { brand: null })).status).toBe(404);
    expect((await call('get', '/api/v1/blog/later', { brand: null })).status).toBe(404);
    expect((await call('get', '/api/v1/blog', { brand: null })).body.meta.total).toBe(1);
    const scheduled = await call('get', '/api/v1/blog/admin/list?status=scheduled', { token: admin.token, brand: null });
    expect(scheduled.body.data.map((p: { slug: string }) => p.slug)).toEqual(['later']);
  });

  it('L8 the author is taken from the token, never from the request body; the public payload has no email', async () => {
    const admin = await createAdmin();
    const other = await createUser();
    const res = await call('post', '/api/v1/blog', { token: admin.token, brand: null }).send(post('who', { status: 'published', authorId: other.id }));
    expect(res.body.data.authorId).toBe(admin.id);
    const pub = await call('get', '/api/v1/blog/who', { brand: null });
    expect(Object.keys(pub.body.data.author).sort()).toEqual(['fullName', 'id']);
  });

  it('L4 moving a published post back to draft clears publishedAt so it leaves the public list', async () => {
    const admin = await createAdmin();
    const id = (await call('post', '/api/v1/blog', { token: admin.token, brand: null }).send(post('back', { status: 'published' }))).body.data.id;
    const res = await call('patch', `/api/v1/blog/${id}`, { token: admin.token, brand: null }).send({ status: 'draft' });
    expect(res.body.data.publishedAt).toBeNull();
    expect((await call('get', '/api/v1/blog/back', { brand: null })).status).toBe(404);
  });

  it('L2 an invalid publishedAt ("2026-02-30", "ngày mai") is rejected with 4xx, not stored as Invalid Date / 500', async () => {
    const admin = await createAdmin();
    for (const publishedAt of ['2026-02-30T00:00:00Z', 'ngày mai']) {
      const res = await call('post', '/api/v1/blog', { token: admin.token, brand: null }).send(post(`bad-${publishedAt.length}`, { status: 'published', publishedAt }));
      expect(res.status, publishedAt).toBeGreaterThanOrEqual(400);
      expect(res.status, publishedAt).toBeLessThan(500);
    }
  });

  it(`L6 two posts with the same slug saved at once → one 201, one 409 (not 500) — ${ITER}x`, async () => {
    const admin = await createAdmin();
    const failures: unknown[] = [];
    for (let i = 0; i < ITER; i += 1) {
      const responses = await Promise.all([
        call('post', '/api/v1/blog', { token: admin.token, brand: null }).send(post(`dup-${i}`)),
        call('post', '/api/v1/blog', { token: admin.token, brand: null }).send(post(`dup-${i}`)),
      ]);
      const hist = statusHistogram(responses);
      if (hist[201] !== 1 || hist[409] !== 1) failures.push({ iteration: i, hist });
    }
    expect(failures).toEqual([]);
  });

  it('L1 deleting an unknown post is 404; a slug containing ../ is just a slug (404)', async () => {
    const admin = await createAdmin();
    expect((await call('delete', '/api/v1/blog/00000000-0000-0000-0000-000000000000', { token: admin.token, brand: null })).status).toBe(404);
    expect((await call('get', `/api/v1/blog/${encodeURIComponent('../../etc/passwd')}`, { brand: null })).status).toBe(404);
  });
});

describe('quote requests', () => {
  async function variant() {
    const { child } = await createBrand();
    return (await createProduct(child.id, { variants: [{ price: 45_000 }] })).variants[0];
  }
  const submit = (body: Record<string, unknown>, opts: { token?: string; brand?: string | null } = {}) =>
    call('post', '/api/v1/quote-requests', opts).send(body);
  const base = (variantId: string) => ({ customerName: 'Lê Minh', phone: '0912345678', address: 'Q.3, TP.HCM', items: [{ variantId, quantity: 2 }] });

  it('L0 a guest can submit; prices are snapshotted from the DB, quantities clamped to 1–99', async () => {
    const v = await variant();
    const res = await submit({ ...base(v.id), items: [{ variantId: v.id, quantity: 500, unitPrice: 1 }] });
    expect(res.status).toBe(201);
    const { rows } = await pool.query(`SELECT items, "userId" FROM "QuoteRequest"`);
    expect(rows[0].userId).toBeNull();
    expect(rows[0].items[0]).toMatchObject({ unitPrice: 45_000, quantity: 99, lineTotal: 45_000 * 99 });
  });

  it('L3 a logged-in customer’s quote is attached to them; an expired token is treated as a guest (not 401)', async () => {
    const v = await variant();
    const u = await createUser();
    await submit(base(v.id), { token: u.token });
    // a correctly signed token that expired 10 seconds ago
    const jwt = await import('jsonwebtoken');
    const expired = jwt.default.sign({ sub: u.id, role: 'customer' }, process.env.JWT_ACCESS_SECRET as string, { expiresIn: -10 });
    expect((await submit(base(v.id), { token: expired })).status).toBe(201);
    const { rows } = await pool.query<{ userId: string | null }>(`SELECT "userId" FROM "QuoteRequest" ORDER BY "createdAt"`);
    expect(rows.map((r) => r.userId)).toEqual([u.id, null]);
  });

  it('L8 the honeypot field makes a bot believe it succeeded while nothing is stored', async () => {
    const v = await variant();
    const res = await submit({ ...base(v.id), website_url: 'http://spam' });
    expect(res.status).toBe(201);
    expect(await countRows('QuoteRequest')).toBe(0);
  });

  it.each([
    ['no phone', { phone: '' }],
    ['phone only spaces', { phone: '   ' }],
    ['no items', { items: [] }],
    ['51 items', { items: Array.from({ length: 51 }, () => ({ variantId: 'x', quantity: 1 })) }],
    ['items is not an array', { items: 'abc' }],
  ])('L2 rejects %s with 400', async (_n, override) => {
    const v = await variant();
    const res = await submit({ ...base(v.id), ...override });
    expect(res.status).toBe(400);
    expect(await countRows('QuoteRequest')).toBe(0);
  });

  it('L2 a customerName sent as a number/array is rejected cleanly, not 500', async () => {
    const v = await variant();
    for (const customerName of [123, ['a']]) {
      const res = await submit({ ...base(v.id), customerName });
      expect(res.status).toBeLessThan(500);
    }
  });

  it('L3 brand isolation: admin of petshop cannot update or delete a gomsu quote (404)', async () => {
    const v = await variant();
    await createBrand('gomsu');
    const admin = await createAdmin();
    const id = (await submit(base(v.id), { brand: 'gomsu' })).body.data.id;
    expect((await call('patch', `/api/v1/quote-requests/admin/${id}/status`, { token: admin.token }).send({ status: 'CONTACTED' })).status).toBe(404);
    expect((await call('delete', `/api/v1/quote-requests/admin/${id}`, { token: admin.token })).status).toBe(404);
  });

  it('L4 closing requires a non-negative integer finalAmount; only NEW quotes can be deleted', async () => {
    const v = await variant();
    const admin = await createAdmin();
    const id = (await submit(base(v.id))).body.data.id;
    const patch = (body: Record<string, unknown>) => call('patch', `/api/v1/quote-requests/admin/${id}/status`, { token: admin.token }).send(body);
    expect((await patch({ status: 'CLOSED' })).status).toBe(400);
    expect((await patch({ status: 'CLOSED', finalAmount: -1 })).status).toBe(400);
    expect((await patch({ status: 'CLOSED', finalAmount: 10.5 })).status).toBe(400);
    expect((await patch({ status: 'CLOSED', finalAmount: 320_000 })).status).toBe(200);
    expect((await call('delete', `/api/v1/quote-requests/admin/${id}`, { token: admin.token })).status).toBe(409);
  });

  it('L4 status must be one of NEW / CONTACTED / CLOSED — inherited object keys like "toString" are refused', async () => {
    // updateStatus validates with `status in QUOTE_STATUS`; the `in` operator also sees
    // Object.prototype members, so "toString" / "constructor" pass the check and are written
    // to the status column.
    const v = await variant();
    const admin = await createAdmin();
    const id = (await submit(base(v.id))).body.data.id;
    const res = await call('patch', `/api/v1/quote-requests/admin/${id}/status`, { token: admin.token }).send({ status: 'toString' });
    expect(res.status).toBe(400);
    const { rows } = await pool.query(`SELECT status FROM "QuoteRequest" WHERE id = $1`, [id]);
    expect(rows[0].status).toBe('NEW');
  });

  it('L0 stats: revenue = sum of finalAmount of closed quotes; conversion = closed / total', async () => {
    const v = await variant();
    const admin = await createAdmin();
    const ids = [];
    for (let i = 0; i < 4; i += 1) ids.push((await submit(base(v.id))).body.data.id);
    for (const [id, amount] of [[ids[0], 100_000], [ids[1], 300_000]] as const) {
      await call('patch', `/api/v1/quote-requests/admin/${id}/status`, { token: admin.token }).send({ status: 'CLOSED', finalAmount: amount });
    }
    const res = await call('get', '/api/v1/quote-requests/admin/stats', { token: admin.token });
    expect(res.body.data).toEqual({ totalRequests: 4, closedCount: 2, revenue: 400_000, averageOrderValue: 200_000, conversionRate: 50 });
  });

  it('L2 stats with an invalid date range (?from=abc) answers 4xx, not 500', async () => {
    const admin = await createAdmin();
    await createBrand();
    const res = await call('get', '/api/v1/quote-requests/admin/stats?from=abc', { token: admin.token });
    expect(res.status).toBeLessThan(500);
  });

  it('L3 "my quotes" hides finalAmount and only lists the caller’s own', async () => {
    const v = await variant();
    const me = await createUser();
    const other = await createUser();
    await submit(base(v.id), { token: me.token });
    await submit(base(v.id), { token: other.token });
    const res = await call('get', '/api/v1/quote-requests/mine', { token: me.token });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).not.toHaveProperty('finalAmount');
  });
});

describe('settings & contact', () => {
  it('L0 admin upserts settings and anyone can read them, optionally filtered by key', async () => {
    const admin = await createAdmin();
    await call('patch', '/api/v1/settings', { token: admin.token, brand: null }).send({ settings: { hero: 'a.jpg', quote: 'Yêu thương' } });
    const all = await call('get', '/api/v1/settings', { brand: null });
    expect(all.body.data).toEqual({ hero: 'a.jpg', quote: 'Yêu thương' });
    expect((await call('get', '/api/v1/settings?keys=hero', { brand: null })).body.data).toEqual({ hero: 'a.jpg' });
  });

  it('L2 an invalid settings body answers in the standard { data, meta, error } envelope', async () => {
    // updateSettings answers `{ success: false, message }` by hand — the only endpoint that
    // breaks the envelope the frontend relies on (json.error?.message).
    const admin = await createAdmin();
    const res = await call('patch', '/api/v1/settings', { token: admin.token, brand: null }).send({ settings: 'oops' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body).toMatchObject({ data: null, error: { code: expect.any(String), message: expect.any(String) } });
  });

  it('L3 a customer cannot change settings', async () => {
    const u = await createUser();
    expect((await call('patch', '/api/v1/settings', { token: u.token, brand: null }).send({ settings: { a: 'b' } })).status).toBe(403);
  });

  it('L0/L2 contact form stores a message, requires name/email/message', async () => {
    const ok = await call('post', '/api/v1/contact', { brand: null }).send({ name: 'Hà', email: 'ha@example.com', message: 'Shop có pate không?' });
    expect(ok.status).toBe(201);
    const bad = await call('post', '/api/v1/contact', { brand: null }).send({ name: 'Hà' });
    expect(bad.status).toBe(400);
    expect(await countRows('ContactMessage')).toBe(1);
  });

  it('L2 contact fields sent as objects are rejected cleanly (4xx), not 500', async () => {
    const res = await call('post', '/api/v1/contact', { brand: null }).send({ name: { $ne: 1 }, email: ['a'], message: 'x' });
    expect(res.status).toBeLessThan(500);
  });

  it('L4 marking an unknown message as read is 404; isRead filter works', async () => {
    const admin = await createAdmin();
    await call('post', '/api/v1/contact', { brand: null }).send({ name: 'A', email: 'a@x.vn', message: 'm' });
    expect((await call('patch', '/api/v1/contact/admin/00000000-0000-0000-0000-000000000000/read', { token: admin.token, brand: null })).status).toBe(404);
    expect((await call('get', '/api/v1/contact/admin/list?isRead=false', { token: admin.token, brand: null })).body.meta.total).toBe(1);
  });
});

describe('categories', () => {
  it('L4 duplicate category slug → 409; attribute keys are slugified and unique per category', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    expect((await call('post', '/api/v1/categories', { token: admin.token, brand: null }).send({ name: 'X', slug: child.slug })).status).toBe(409);
    const attr = (label: string) => call('post', `/api/v1/categories/${child.id}/attributes`, { token: admin.token, brand: null }).send({ attributeLabel: label });
    expect((await attr('Trọng lượng')).body.data.attributeKey).toBe('trong_luong');
    expect((await attr('Trọng  lượng!')).status).toBe(409); // same key after slugify
    expect((await attr('!!!')).status).toBe(400);
  });
});

describe('gallery', () => {
  it('L0 admin creates, reads, updates and deletes an item; the public list is ordered by position', async () => {
    const admin = await createAdmin();
    const mk = (position: number) =>
      call('post', '/api/v1/gallery', { token: admin.token, brand: null }).send({ imageUrl: `https://cdn.example/p${position}.jpg`, altText: `Mèo ${position}`, position });
    const second = (await mk(2)).body.data;
    await mk(1);
    const list = await call('get', '/api/v1/gallery', { brand: null });
    expect(list.body.data.map((g: { position: number }) => g.position)).toEqual([1, 2]);

    const upd = await call('put', `/api/v1/gallery/${second.id}`, { token: admin.token, brand: null }).send({ imageUrl: 'https://cdn.example/new.jpg', altText: 'Mèo mới' });
    expect(upd.body.data).toMatchObject({ imageUrl: 'https://cdn.example/new.jpg', altText: 'Mèo mới', position: 2 });
    expect((await call('delete', `/api/v1/gallery/${second.id}`, { token: admin.token, brand: null })).status).toBe(200);
    expect((await call('get', `/api/v1/gallery/${second.id}`, { brand: null })).status).toBe(404);
  });

  it('L1 pageSize is capped at 50 and an unknown categorySlug is 404', async () => {
    expect((await call('get', '/api/v1/gallery?pageSize=999', { brand: null })).body.meta.pageSize).toBe(50);
    expect((await call('get', '/api/v1/gallery?categorySlug=nope', { brand: null })).status).toBe(404);
  });

  it('L8 deleting an item whose imageUrl contains ../ must not delete files outside public/uploads (path traversal)', async () => {
    // remove() strips "/uploads/" and passes the rest to path.join(...public/uploads, rest),
    // then fs.unlink — so "/uploads/../../anything" walks out of the uploads folder. The canary
    // file below is created by this test in its own scratch folder, so the worst case is that
    // the test deletes its own file.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'petshop-canary-'));
    const canary = path.join(dir, 'canary.txt');
    fs.writeFileSync(canary, 'must survive');
    const uploadsDir = path.resolve(__dirname, '..', '..', 'public', 'uploads');
    const imageUrl = `/uploads/${path.relative(uploadsDir, canary)}`;

    const admin = await createAdmin();
    const item = (await call('post', '/api/v1/gallery', { token: admin.token, brand: null }).send({ imageUrl, altText: 'x' })).body.data;
    await call('delete', `/api/v1/gallery/${item.id}`, { token: admin.token, brand: null });

    const survived = fs.existsSync(canary);
    fs.rmSync(dir, { recursive: true, force: true });
    expect(survived, `file outside public/uploads was deleted via imageUrl=${imageUrl}`).toBe(true);
  });

  it('L3 customers cannot write to the gallery', async () => {
    const u = await createUser();
    expect((await call('post', '/api/v1/gallery', { token: u.token, brand: null }).send({ imageUrl: 'a', altText: 'b' })).status).toBe(403);
  });
});

describe('products (admin) — editing', () => {
  it('L0 PATCH /products/:id changes only the fields sent and never touches variants', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    const p = await createProduct(child.id, { variants: [{ stock: 7, price: 10_000 }] });
    const res = await call('patch', `/api/v1/products/${p.id}`, { token: admin.token, brand: null }).send({ name: 'Tên mới', stockQuantity: 0, price: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Tên mới');
    expect(res.body.data.slug).toBe(p.slug);
    expect(res.body.data.variants[0]).toMatchObject({ stockQuantity: 7, price: 10_000 });
  });

  it('L4 renaming a slug to one already taken is 409; keeping the same slug is fine', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    const a = await createProduct(child.id);
    const b = await createProduct(child.id);
    expect((await call('patch', `/api/v1/products/${b.id}`, { token: admin.token, brand: null }).send({ slug: a.slug })).status).toBe(409);
    expect((await call('patch', `/api/v1/products/${b.id}`, { token: admin.token, brand: null }).send({ slug: b.slug })).status).toBe(200);
  });

  it('L0 images: new ones go to the end, alt text defaults to the product name, unknown image is 404', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    const p = await createProduct(child.id, { name: 'Cát vệ sinh' });
    const add = (url: string) => call('post', `/api/v1/products/${p.id}/images`, { token: admin.token, brand: null }).send({ url });
    expect((await add('https://cdn/a.jpg')).body.data).toMatchObject({ position: 0, altText: 'Cát vệ sinh' });
    const second = (await add('https://cdn/b.jpg')).body.data;
    expect(second.position).toBe(1);
    expect((await call('patch', `/api/v1/products/images/${second.id}`, { token: admin.token, brand: null }).send({ position: 5 })).body.data.position).toBe(5);
    expect((await call('delete', `/api/v1/products/images/${second.id}`, { token: admin.token, brand: null })).status).toBe(200);
    expect((await call('delete', `/api/v1/products/images/${second.id}`, { token: admin.token, brand: null })).status).toBe(404);
  });

  it('L4 addVariant rejects a SKU already used by another product (409)', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    const a = await createProduct(child.id, { variants: [{ sku: 'TAKEN' }] });
    const b = await createProduct(child.id);
    expect((await call('post', `/api/v1/products/${b.id}/variants`, { token: admin.token, brand: null }).send({ sku: 'TAKEN', price: 1 })).status).toBe(409);
    expect(a.variants[0].sku).toBe('TAKEN');
  });

  it('L4 removing a variant that is NOT the last one works', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    const p = await createProduct(child.id, { variants: [{}, {}] });
    expect((await call('delete', `/api/v1/products/variants/${p.variants[0].id}`, { token: admin.token, brand: null })).status).toBe(200);
    expect(await countRows('ProductVariant')).toBe(1);
  });

  it('L3 admin list shows drafts, supports search, and caps pageSize at 100', async () => {
    const admin = await createAdmin();
    const { child } = await createBrand();
    await createProduct(child.id, { status: 'draft', name: 'Vòng cổ chó' });
    await createProduct(child.id, { name: 'Pate mèo' });
    const res = await call('get', '/api/v1/products/admin/list?search=vòng&pageSize=1000', { token: admin.token, brand: null });
    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(['Vòng cổ chó']);
    expect(res.body.meta.pageSize).toBe(100);
  });
});
