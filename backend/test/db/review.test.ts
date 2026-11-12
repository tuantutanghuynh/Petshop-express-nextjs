import { describe, expect, it } from 'vitest';
import { ORDER_STATUS } from '../../constants/order';
import { PRODUCT_STATUS } from '../../constants/product';
import prisma from '../../services/prisma';
import { LEAK, call } from './helpers/http';
import { createAdmin, createUser } from './helpers/factories';
import { IMG, countersMatch, orderWith, productForReview } from './helpers/reviews';

// Reviews from verified buyers (spec 2026-11-10, ADR-027): who may write one, what it may contain,
// editing, and what the public sees.

const body = (productId: string, extra: Record<string, unknown> = {}) => ({ productId, rating: 5, content: 'Mèo nhà mình rất thích, ăn hết bát.', ...extra });
const create = (token: string, b: Record<string, unknown>) => call('post', '/api/v1/reviews', { token, brand: null }).send(b);
const edit = (token: string, id: string, b: Record<string, unknown>) => call('patch', `/api/v1/reviews/${id}`, { token, brand: null }).send(b);
const eligibility = (token: string, productId: string) => call('get', `/api/v1/reviews/eligibility?productId=${productId}`, { token, brand: null });
const publicList = (slug: string, q = '') => call('get', `/api/v1/products/${slug}/reviews${q}`, { brand: null });
const approve = async (id: string) => {
  const admin = await createAdmin();
  return call('post', `/api/v1/reviews/admin/${id}/approve`, { token: admin.token, brand: null }).send({});
};

async function buyer(fullName = 'Nguyễn Văn Tú') {
  const product = await productForReview();
  const user = await createUser({ fullName });
  await orderWith(user.id, product.variants[0].id);
  return { product, user };
}

describe('who may review', () => {
  it('needs a completed order with the product', async () => {
    const product = await productForReview();
    const stranger = await createUser();
    const pending = await createUser();
    await orderWith(pending.id, product.variants[0].id, ORDER_STATUS.PROCESSING);
    const done = await createUser();
    await orderWith(done.id, product.variants[0].id);
    expect((await eligibility(stranger.token, product.id)).body.data).toEqual({ canReview: false, review: null });
    expect((await eligibility(pending.token, product.id)).body.data.canReview).toBe(false);
    expect((await eligibility(done.token, product.id)).body.data).toEqual({ canReview: true, review: null });
    expect((await create(stranger.token, body(product.id))).status).toBe(403);
    expect((await create(stranger.token, body(product.id))).body.error.code).toBe('NOT_PURCHASED');
    expect((await create(pending.token, body(product.id))).status).toBe(403);
  });

  it('is 401 without a session', async () => {
    const product = await productForReview();
    expect((await call('post', '/api/v1/reviews', { brand: null }).send(body(product.id))).status).toBe(401);
    expect((await call('get', `/api/v1/reviews/eligibility?productId=${product.id}`, { brand: null })).status).toBe(401);
  });
});

describe('writing a review', () => {
  it('creates a pending review the public does not see yet', async () => {
    const { product, user } = await buyer();
    const res = await create(user.token, body(product.id, { images: [IMG(1), IMG(2)] }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ rating: 5, status: 'PENDING', images: [IMG(1), IMG(2)] });
    expect((await publicList(product.slug)).body.data).toEqual([]);
    expect((await eligibility(user.token, product.id)).body.data).toMatchObject({ canReview: true, review: { id: res.body.data.id, status: 'PENDING' } });
  });

  it('allows one review per product per customer', async () => {
    const { product, user } = await buyer();
    await create(user.token, body(product.id));
    const again = await create(user.token, body(product.id));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('REVIEW_EXISTS');
  });

  it.each([
    ['0 stars', { rating: 0 }, 'rating'],
    ['6 stars', { rating: 6 }, 'rating'],
    ['half a star', { rating: 4.5 }, 'rating'],
    ['too short a text', { content: 'Tốt' }, 'content'],
    ['too long a text', { content: 'x'.repeat(2001) }, 'content'],
    ['4 photos', { images: [IMG(1), IMG(2), IMG(3), IMG(4)] }, 'images'],
    ['a photo from elsewhere', { images: ['https://evil.example/a.jpg'] }, 'images[0]'],
    ['a photo on another Cloudinary account', { images: ['https://res.cloudinary.com/someone-else/image/upload/a.jpg'] }, 'images[0]'],
    ['a plain http photo', { images: ['http://res.cloudinary.com/test-cloud/image/upload/a.jpg'] }, 'images[0]'],
  ])('refuses %s (422)', async (_name, extra, field) => {
    const { product, user } = await buyer();
    const res = await create(user.token, body(product.id, extra));
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(field);
    expect(JSON.stringify(res.body)).not.toMatch(LEAK);
  });
});

describe('editing', () => {
  it('sends an approved review back to the queue and takes it out of the stars', async () => {
    const { product, user } = await buyer();
    const { id } = (await create(user.token, body(product.id, { rating: 4 }))).body.data;
    await approve(id);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } }))).toMatchObject({ reviewCount: 1, ratingSum: 4 });
    const res = await edit(user.token, id, { rating: 2, content: 'Sau hai tuần thì mèo chán, không ăn nữa.' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ rating: 2, status: 'PENDING' });
    const { stored, actual } = await countersMatch(product.id);
    expect(stored).toEqual(actual);
    expect(stored).toEqual({ reviewCount: 0, ratingSum: 0 });
    expect((await publicList(product.slug)).body.data).toEqual([]);
  });

  it('only the author can edit (404 for anyone else)', async () => {
    const { product, user } = await buyer();
    const { id } = (await create(user.token, body(product.id))).body.data;
    const other = await createUser();
    expect((await edit(other.token, id, { rating: 1 })).status).toBe(404);
  });

  it('validates the edit like a new review', async () => {
    const { product, user } = await buyer();
    const { id } = (await create(user.token, body(product.id))).body.data;
    expect((await edit(user.token, id, { rating: 9 })).status).toBe(422);
  });

  it('lists my reviews', async () => {
    const { product, user } = await buyer();
    await create(user.token, body(product.id));
    const res = await call('get', '/api/v1/reviews/mine', { token: user.token, brand: null });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ productId: product.id, status: 'PENDING', product: { name: 'Hạt mèo', slug: product.slug } });
  });
});

describe('public list', () => {
  async function approvedReviews() {
    const product = await productForReview();
    const ratings = [5, 4, 5, 2];
    for (const [i, rating] of ratings.entries()) {
      const user = await createUser({ fullName: `Người Mua ${['An', 'Bình', 'Chi', 'Dũng'][i]}` });
      await orderWith(user.id, product.variants[0].id);
      const { id } = (await create(user.token, body(product.id, { rating, ...(i === 1 && { images: [IMG(1)] }) }))).body.data;
      await prisma.productReview.update({ where: { id }, data: { createdAt: new Date(Date.UTC(2026, 10, 1 + i)) } });
      await approve(id);
    }
    return product;
  }

  it('shows approved reviews newest first with a summary, never the email', async () => {
    const product = await approvedReviews();
    const res = await publicList(product.slug);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { authorName: string }) => r.authorName)).toEqual(['Dũng', 'Chi', 'Bình', 'An']);
    expect(res.body.meta).toMatchObject({ page: 1, total: 4, summary: { count: 4, average: 4, distribution: { 1: 0, 2: 1, 3: 0, 4: 1, 5: 2 }, withImages: 1 } });
    expect(Object.keys(res.body.data[0]).sort()).toEqual(['adminReply', 'adminReplyAt', 'authorName', 'content', 'createdAt', 'id', 'images', 'rating', 'updatedAt'].sort());
    expect(JSON.stringify(res.body)).not.toContain('@example.com');
  });

  it('filters by stars and by photos, and sorts by stars', async () => {
    const product = await approvedReviews();
    expect((await publicList(product.slug, '?rating=5')).body.data.map((r: { rating: number }) => r.rating)).toEqual([5, 5]);
    expect((await publicList(product.slug, '?hasImages=true')).body.data.map((r: { authorName: string }) => r.authorName)).toEqual(['Bình']);
    expect((await publicList(product.slug, '?sort=lowest')).body.data[0].rating).toBe(2);
    expect((await publicList(product.slug, '?sort=highest')).body.data.map((r: { rating: number }) => r.rating)).toEqual([5, 5, 4, 2]);
    expect((await publicList(product.slug, '?pageSize=2&page=2')).body.data).toHaveLength(2);
    expect((await publicList(product.slug, '?rating=7')).status).toBe(422);
    expect((await publicList(product.slug, '?sort=hack')).status).toBe(422);
  });

  it('carries the counters on the product detail', async () => {
    const product = await approvedReviews();
    const detail = (await call('get', `/api/v1/products/${product.slug}`, { brand: null })).body.data;
    expect(detail).toMatchObject({ reviewCount: 4, ratingSum: 16 });
  });

  it('is 404 for a product that is not on sale', async () => {
    const product = await productForReview();
    await prisma.product.update({ where: { id: product.id }, data: { status: PRODUCT_STATUS.DRAFT } });
    expect((await publicList(product.slug)).status).toBe(404);
  });

  it('falls back to "Khách hàng" without a name', async () => {
    const product = await productForReview();
    const user = await createUser({ fullName: '   ' });
    await orderWith(user.id, product.variants[0].id);
    const { id } = (await create(user.token, body(product.id))).body.data;
    await approve(id);
    expect((await publicList(product.slug)).body.data[0].authorName).toBe('Khách hàng');
  });
});

describe('order detail for the review button', () => {
  it('tells which product each line is (null once its variant is gone), without the variant itself', async () => {
    const { product, user } = await buyer();
    const order = await prisma.order.findFirstOrThrow({ where: { userId: user.id } });
    const res = await call('get', `/api/v1/orders/${order.code}`, { token: user.token });
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].product).toEqual({ id: product.id, slug: product.slug });
    expect(res.body.data.items[0]).not.toHaveProperty('variant');
    await prisma.orderItem.updateMany({ where: { orderId: order.id }, data: { variantId: null } });
    expect((await call('get', `/api/v1/orders/${order.code}`, { token: user.token })).body.data.items[0].product).toBeNull();
  });
});
