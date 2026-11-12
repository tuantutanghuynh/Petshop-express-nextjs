import { describe, expect, it } from 'vitest';
import { call } from './helpers/http';
import { ITER, runConcurrently } from './helpers/concurrency';
import { createAdmin, createUser } from './helpers/factories';
import { countersMatch, orderWith, productForReview } from './helpers/reviews';

// =============================================================================================
// Race tests for review moderation (skill: transaction-race-test).
// Write paths: approve / hide (admin), edit (customer) — each an optimistic conditional UPDATE
// (`WHERE status = s0 AND rating = r0`) plus the product counter delta in one transaction.
// Invariant R1: Product.reviewCount / ratingSum = count / sum of its APPROVED reviews, always.
// Invariant R2: a move that lost the race answers 409, never 500, and changes nothing.
// =============================================================================================

async function pending(rating = 4) {
  const product = await productForReview();
  const user = await createUser();
  await orderWith(user.id, product.variants[0].id);
  const res = await call('post', '/api/v1/reviews', { token: user.token, brand: null }).send({ productId: product.id, rating, content: 'Hàng tốt, đóng gói kỹ.' });
  return { product, user, id: res.body.data.id as string };
}
const act = (token: string, id: string, action: 'approve' | 'hide') => call('post', `/api/v1/reviews/admin/${id}/${action}`, { token, brand: null }).send({});

describe('L3: the same review approved many times at once', () => {
  for (let i = 0; i < ITER; i++) {
    it(`counts it once — run ${i + 1}`, async () => {
      const admin = await createAdmin();
      const r = await pending(5);
      const { ok } = await runConcurrently(8, () => act(admin.token, r.id, 'approve'));
      const statuses = ok.map((res) => res.status).sort();
      expect(statuses.filter((s) => s === 200)).toHaveLength(1);
      expect(statuses.every((s) => s === 200 || s === 409)).toBe(true); // R2
      const { stored, actual } = await countersMatch(r.product.id);
      expect(stored).toEqual(actual); // R1
      expect(stored).toEqual({ reviewCount: 1, ratingSum: 5 });
    });
  }
});

describe('L2: approve, hide and a customer edit racing', () => {
  for (let i = 0; i < ITER; i++) {
    it(`counters always match the final state — run ${i + 1}`, async () => {
      const admin = await createAdmin();
      const r = await pending(4);
      await act(admin.token, r.id, 'approve');
      const { ok } = await runConcurrently(3, (k) =>
        k === 0
          ? act(admin.token, r.id, 'hide')
          : k === 1
            ? call('patch', `/api/v1/reviews/${r.id}`, { token: r.user.token, brand: null }).send({ rating: 1, content: 'Đổi ý: mèo không ăn nữa.' })
            : act(admin.token, r.id, 'approve'),
      );
      expect(ok.every((res) => [200, 409].includes(res.status))).toBe(true); // R2
      const { stored, actual } = await countersMatch(r.product.id);
      expect(stored).toEqual(actual); // R1
    });
  }
});
