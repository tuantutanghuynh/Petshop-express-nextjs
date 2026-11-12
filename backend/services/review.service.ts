import { Prisma } from '@prisma/client';
import { ORDER_STATUS } from '../constants/order';
import { PRODUCT_STATUS } from '../constants/product';
import { REVIEW_AUTHOR_FALLBACK, type ReviewSort } from '../constants/review';
import ApiError from '../utils/ApiError';
import prisma from './prisma';

// Reviews from verified buyers (spec 2026-11-10, ADR-027): who may write, writing, editing, and the
// public list. Approving / hiding (and the product's star counters) live in reviewModeration.service.ts.

export type ReviewInput = { productId: string; rating: number; content: string; images?: string[] };
export type ReviewPatch = Partial<Omit<ReviewInput, 'productId'>>;

const OWN_ROW = { id: true, productId: true, rating: true, content: true, images: true, status: true, adminReply: true, adminReplyAt: true, createdAt: true, updatedAt: true } as const;

export const reviewChanged = () => new ApiError(409, 'REVIEW_CHANGED', 'Đánh giá vừa được thay đổi. Tải lại trang rồi thử lại.');
const reviewNotFound = () => new ApiError(404, 'REVIEW_NOT_FOUND', 'Không tìm thấy đánh giá');
const productNotFound = () => new ApiError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm');

// The last word of the name the customer gave ("Nguyễn Văn Tú" → "Tú"): personal enough to be
// believable, never the full name, email or phone.
export function authorName(fullName: string | null): string {
  return fullName?.trim().split(/\s+/).pop() || REVIEW_AUTHOR_FALLBACK;
}

// A completed order containing any variant of the product. (A deleted variant leaves its order
// line without a product, so such a purchase cannot be traced — accepted, ADR-027.)
export async function hasPurchased(userId: string, productId: string): Promise<boolean> {
  const n = await prisma.orderItem.count({ where: { order: { userId, orderStatus: ORDER_STATUS.COMPLETED }, variant: { productId } } });
  return n > 0;
}

export async function eligibility(userId: string, productId: string) {
  const [canReview, review] = await Promise.all([
    hasPurchased(userId, productId),
    prisma.productReview.findUnique({ where: { productId_userId: { productId, userId } }, select: OWN_ROW }),
  ]);
  return { canReview, review };
}

export async function createReview(userId: string, input: ReviewInput) {
  const product = await prisma.product.findUnique({ where: { id: input.productId }, select: { id: true } });
  if (!product) throw productNotFound();
  if (!(await hasPurchased(userId, input.productId))) throw new ApiError(403, 'NOT_PURCHASED', 'Chỉ khách đã mua và nhận hàng mới đánh giá được sản phẩm này');
  try {
    return await prisma.productReview.create({
      data: { productId: input.productId, userId, rating: input.rating, content: input.content, images: input.images ?? [] },
      select: OWN_ROW,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ApiError(409, 'REVIEW_EXISTS', 'Bạn đã đánh giá sản phẩm này. Hãy sửa đánh giá cũ.');
    }
    throw err;
  }
}

export async function myReviews(userId: string) {
  return prisma.productReview.findMany({
    where: { userId },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: { ...OWN_ROW, product: { select: { name: true, slug: true } } },
  });
}

// An edit goes back to the queue: the old approved text disappears and its stars leave the product
// until the new text is approved. Optimistic: the UPDATE only matches the status and rating just
// read, so a moderation landing in between makes this 409 instead of corrupting the counters.
export async function editReview(userId: string, id: string, patch: ReviewPatch) {
  const current = await prisma.productReview.findFirst({ where: { id, userId }, select: { status: true, rating: true, productId: true } });
  if (!current) throw reviewNotFound();
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.productReview.updateMany({
      where: { id, userId, status: current.status, rating: current.rating },
      data: {
        ...(patch.rating !== undefined && { rating: patch.rating }),
        ...(patch.content !== undefined && { content: patch.content }),
        ...(patch.images !== undefined && { images: patch.images }),
        status: 'PENDING',
        approvedAt: null,
      },
    });
    if (count !== 1) throw reviewChanged();
    if (current.status === 'APPROVED') {
      await tx.product.update({ where: { id: current.productId }, data: { reviewCount: { decrement: 1 }, ratingSum: { decrement: current.rating } } });
    }
    return tx.productReview.findUniqueOrThrow({ where: { id }, select: OWN_ROW });
  });
}

const ORDER: Record<ReviewSort, Prisma.ProductReviewOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
  highest: [{ rating: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  lowest: [{ rating: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
};

export type PublicQuery = { rating?: number; hasImages?: boolean; sort: ReviewSort; take: number; skip: number };

// Approved reviews of a product on sale, plus the summary the page shows above them (always over
// all approved reviews, whatever the filter).
export async function publicReviews(slug: string, q: PublicQuery) {
  const product = await prisma.product.findUnique({ where: { slug }, select: { id: true, status: true } });
  if (!product || product.status !== PRODUCT_STATUS.ACTIVE) throw productNotFound();
  const approved: Prisma.ProductReviewWhereInput = { productId: product.id, status: 'APPROVED' };
  const withImages: Prisma.ProductReviewWhereInput = { NOT: { images: { equals: [] } } };
  const where: Prisma.ProductReviewWhereInput = {
    ...approved,
    ...(q.rating !== undefined && { rating: q.rating }),
    ...(q.hasImages && withImages),
  };
  const [rows, total, groups, imageCount] = await Promise.all([
    prisma.productReview.findMany({
      where, orderBy: ORDER[q.sort], skip: q.skip, take: q.take,
      select: { id: true, rating: true, content: true, images: true, adminReply: true, adminReplyAt: true, createdAt: true, updatedAt: true, user: { select: { fullName: true } } },
    }),
    prisma.productReview.count({ where }),
    prisma.productReview.groupBy({ by: ['rating'], where: approved, _count: { _all: true } }),
    prisma.productReview.count({ where: { ...approved, ...withImages } }),
  ]);
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const g of groups) distribution[g.rating as 1 | 2 | 3 | 4 | 5] = g._count._all;
  const count = Object.values(distribution).reduce((a, b) => a + b, 0);
  const sum = Object.entries(distribution).reduce((a, [stars, n]) => a + Number(stars) * n, 0);
  const items = rows.map(({ user, ...r }) => ({ ...r, authorName: authorName(user.fullName) }));
  return { items, total, summary: { count, average: count ? Math.round((sum / count) * 10) / 10 : 0, distribution, withImages: imageCount } };
}
