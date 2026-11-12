import type { Prisma, ReviewStatus } from '@prisma/client';
import ApiError from '../utils/ApiError';
import prisma from './prisma';
import { reviewChanged } from './review.service';

// Moderating reviews (spec 2026-11-10, ADR-027). Hide for what a review says (spam, abuse, a phone
// number), never because it is negative: the stars must stay honest.
//
// Product.reviewCount / ratingSum count APPROVED reviews only. Every move reads the status and rating,
// then runs an UPDATE that matches exactly those values (optimistic) and applies the counter delta
// in the same transaction. Two admins clicking at once, or an admin and the customer editing, can
// therefore never count a review twice: the loser matches no row and gets 409 REVIEW_CHANGED.

const notFound = () => new ApiError(404, 'REVIEW_NOT_FOUND', 'Không tìm thấy đánh giá');

const ADMIN_ROW = {
  id: true, rating: true, content: true, images: true, status: true, adminReply: true, adminReplyAt: true, approvedAt: true, createdAt: true, updatedAt: true,
  product: { select: { id: true, name: true, slug: true } },
  user: { select: { id: true, fullName: true, email: true } },
} as const;

async function move(id: string, allowedFrom: ReviewStatus[], to: ReviewStatus, now: Date) {
  const current = await prisma.productReview.findUnique({ where: { id }, select: { status: true, rating: true, productId: true } });
  if (!current) throw notFound();
  if (!allowedFrom.includes(current.status)) throw reviewChanged();
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.productReview.updateMany({
      where: { id, status: current.status, rating: current.rating },
      data: { status: to, ...(to === 'APPROVED' && { approvedAt: now }) },
    });
    if (count !== 1) throw reviewChanged();
    const sign = to === 'APPROVED' ? 1 : current.status === 'APPROVED' ? -1 : 0;
    if (sign !== 0) {
      await tx.product.update({ where: { id: current.productId }, data: { reviewCount: { increment: sign }, ratingSum: { increment: sign * current.rating } } });
    }
    return tx.productReview.findUniqueOrThrow({ where: { id }, select: ADMIN_ROW });
  });
}

export const approveReview = (id: string, now = new Date()) => move(id, ['PENDING', 'HIDDEN'], 'APPROVED', now);
export const hideReview = (id: string, now = new Date()) => move(id, ['PENDING', 'APPROVED'], 'HIDDEN', now);

// Public under the review once it is approved. null clears it.
export async function replyToReview(id: string, reply: string | null, now = new Date()) {
  const text = reply?.trim() || null;
  const { count } = await prisma.productReview.updateMany({ where: { id }, data: { adminReply: text, adminReplyAt: text ? now : null } });
  if (count === 0) throw notFound();
  return prisma.productReview.findUniqueOrThrow({ where: { id }, select: ADMIN_ROW });
}

export async function adminReviews(q: { status?: ReviewStatus; rating?: number; take: number; skip: number }) {
  const where: Prisma.ProductReviewWhereInput = { ...(q.status && { status: q.status }), ...(q.rating !== undefined && { rating: q.rating }) };
  const [items, total] = await Promise.all([
    // Oldest first: the queue is worked through in the order reviews arrived.
    prisma.productReview.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: q.skip, take: q.take, select: ADMIN_ROW }),
    prisma.productReview.count({ where }),
  ]);
  return { items, total };
}

export async function pendingReviewCount(): Promise<number> {
  return prisma.productReview.count({ where: { status: 'PENDING' } });
}
