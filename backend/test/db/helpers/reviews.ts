import { ORDER_STATUS } from '../../../constants/order';
import prisma from '../../../services/prisma';
import { createBrand, createProduct } from './factories';

let n = 0;
// An order of `userId` containing one unit of `variantId`, in the given status (COMPLETED = may review).
export async function orderWith(userId: string, variantId: string, orderStatus: string = ORDER_STATUS.COMPLETED) {
  n += 1;
  return prisma.order.create({
    data: {
      code: `RV${Date.now()}${n}`, userId, brandSlug: 'petshop', orderStatus, paymentMethod: 'COD', subtotal: 50_000, grandTotal: 50_000,
      shippingAddress: { fullName: 'A', phone: '0900000000', address: 'x' },
      items: { create: [{ variantId, productName: 'P', sku: `S${n}`, unitPrice: 50_000, quantity: 1, lineTotal: 50_000 }] },
    },
  });
}

export async function productForReview(name = 'Hạt mèo') {
  const { child } = await createBrand();
  return createProduct(child.id, { name });
}

export const IMG = (i = 1) => `https://res.cloudinary.com/test-cloud/image/upload/v1/miniecom-petshop/reviews/p${i}.jpg`;

// Product counters must always equal what the approved reviews add up to.
export async function countersMatch(productId: string) {
  const [p, agg] = await Promise.all([
    prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { reviewCount: true, ratingSum: true } }),
    prisma.productReview.aggregate({ where: { productId, status: 'APPROVED' }, _count: true, _sum: { rating: true } }),
  ]);
  return { stored: p, actual: { reviewCount: agg._count, ratingSum: agg._sum.rating ?? 0 } };
}
