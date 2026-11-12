import { describe, expect, it } from 'vitest';
import prisma from '../../services/prisma';
import { call } from './helpers/http';
import { createAdmin, createUser } from './helpers/factories';
import { countersMatch, orderWith, productForReview } from './helpers/reviews';

// Moderating reviews (spec 2026-11-10, ADR-027): approve, hide, reply; the product's star counters
// always equal what its approved reviews add up to.

async function pendingReview(rating = 4) {
  const product = await productForReview();
  const user = await createUser({ fullName: 'Trần Thị Mai' });
  await orderWith(user.id, product.variants[0].id);
  const res = await call('post', '/api/v1/reviews', { token: user.token, brand: null }).send({ productId: product.id, rating, content: 'Hàng đúng mô tả, giao nhanh.' });
  return { product, user, id: res.body.data.id as string };
}
const act = (token: string, id: string, action: 'approve' | 'hide') => call('post', `/api/v1/reviews/admin/${id}/${action}`, { token, brand: null }).send({});
const reply = (token: string, id: string, text: string | null) => call('patch', `/api/v1/reviews/admin/${id}/reply`, { token, brand: null }).send({ reply: text });
const product = (id: string) => prisma.product.findUniqueOrThrow({ where: { id }, select: { reviewCount: true, ratingSum: true } });

describe('approve and hide', () => {
  it('approving counts the stars, hiding takes them out, approving again puts them back', async () => {
    const admin = await createAdmin();
    const r = await pendingReview(4);
    expect((await act(admin.token, r.id, 'approve')).body.data).toMatchObject({ status: 'APPROVED' });
    expect(await product(r.product.id)).toEqual({ reviewCount: 1, ratingSum: 4 });
    expect((await act(admin.token, r.id, 'hide')).body.data.status).toBe('HIDDEN');
    expect(await product(r.product.id)).toEqual({ reviewCount: 0, ratingSum: 0 });
    await act(admin.token, r.id, 'approve');
    const { stored, actual } = await countersMatch(r.product.id);
    expect(stored).toEqual(actual);
    expect(stored).toEqual({ reviewCount: 1, ratingSum: 4 });
  });

  it('hiding a pending review changes no counter', async () => {
    const admin = await createAdmin();
    const r = await pendingReview();
    expect((await act(admin.token, r.id, 'hide')).body.data.status).toBe('HIDDEN');
    expect(await product(r.product.id)).toEqual({ reviewCount: 0, ratingSum: 0 });
  });

  it('refuses a move that does not apply (409) and an unknown review (404)', async () => {
    const admin = await createAdmin();
    const r = await pendingReview();
    await act(admin.token, r.id, 'approve');
    const twice = await act(admin.token, r.id, 'approve');
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('REVIEW_CHANGED');
    expect(await product(r.product.id)).toEqual({ reviewCount: 1, ratingSum: 4 });
    expect((await act(admin.token, '00000000-0000-0000-0000-000000000000', 'approve')).status).toBe(404);
  });

  it('is admin only', async () => {
    const r = await pendingReview();
    const customer = await createUser();
    expect((await call('post', `/api/v1/reviews/admin/${r.id}/approve`, { brand: null }).send({})).status).toBe(401);
    expect((await act(customer.token, r.id, 'approve')).status).toBe(403);
    expect((await call('get', '/api/v1/reviews/admin', { token: customer.token, brand: null })).status).toBe(403);
  });
});

describe('reply', () => {
  it('sets, shows publicly, and clears the shop reply', async () => {
    const admin = await createAdmin();
    const r = await pendingReview();
    await act(admin.token, r.id, 'approve');
    const res = await reply(admin.token, r.id, 'Cảm ơn bạn đã tin tưởng shop!');
    expect(res.body.data.adminReply).toBe('Cảm ơn bạn đã tin tưởng shop!');
    expect(res.body.data.adminReplyAt).not.toBeNull();
    const pub = await call('get', `/api/v1/products/${r.product.slug}/reviews`, { brand: null });
    expect(pub.body.data[0].adminReply).toBe('Cảm ơn bạn đã tin tưởng shop!');
    expect((await reply(admin.token, r.id, null)).body.data).toMatchObject({ adminReply: null, adminReplyAt: null });
    expect((await reply(admin.token, r.id, 'x'.repeat(1001))).status).toBe(422);
  });
});

describe('admin list', () => {
  it('lists by status with the product and the customer, and counts the queue', async () => {
    const admin = await createAdmin();
    const a = await pendingReview();
    const b = await pendingReview(2);
    await act(admin.token, b.id, 'approve');
    const pending = await call('get', '/api/v1/reviews/admin?status=PENDING', { token: admin.token, brand: null });
    expect(pending.body.data.map((x: { id: string }) => x.id)).toEqual([a.id]);
    expect(pending.body.data[0]).toMatchObject({ product: { name: 'Hạt mèo', slug: a.product.slug }, user: { fullName: 'Trần Thị Mai', email: a.user.email } });
    expect(pending.body.meta).toMatchObject({ total: 1 });
    expect((await call('get', '/api/v1/reviews/admin?rating=2', { token: admin.token, brand: null })).body.data.map((x: { id: string }) => x.id)).toEqual([b.id]);
    expect((await call('get', '/api/v1/reviews/admin/pending-count', { token: admin.token, brand: null })).body.data).toEqual({ pending: 1 });
    expect((await call('get', '/api/v1/reviews/admin?status=NOPE', { token: admin.token, brand: null })).status).toBe(422);
  });
});
