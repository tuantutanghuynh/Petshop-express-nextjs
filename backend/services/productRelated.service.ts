import { PRODUCT_STATUS } from '../constants/product';
import ApiError from '../utils/ApiError';
import prisma from './prisma';
import { productInShop, type Scope } from './productAdmin.service';

// "Thường mua kèm" (spec 2026-11-10, ADR-026). One-way links the admin picks, in order. The route has
// already checked the list shape (≤ 4, unique, not the product itself); this checks the products.

export const MAX_RELATED = 4;

const invalidIds = (msg: string) => new ApiError(422, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ', [{ type: 'field', path: 'ids', location: 'body', msg }]);

export type RelatedRow = { id: string; name: string; slug: string; status: string };

// For the admin form: every linked product whatever its status, so a hidden one can be seen and removed.
export async function adminRelated(productId: string): Promise<RelatedRow[]> {
  const rows = await prisma.productRelated.findMany({
    where: { productId },
    orderBy: { position: 'asc' },
    select: { relatedProduct: { select: { id: true, name: true, slug: true, status: true } } },
  });
  return rows.map((r) => r.relatedProduct);
}

// Replaces the whole list in one transaction: a half-saved list never shows. Only products of the
// same shop can be suggested (another storefront's product would 404 on this one anyway).
export async function setRelated(scope: Scope, productId: string, ids: string[]): Promise<RelatedRow[]> {
  await productInShop(scope, productId);
  if (ids.length > 0) {
    const found = await prisma.product.count({ where: { id: { in: ids }, categoryId: { in: scope.shopIds } } });
    if (found !== ids.length) throw invalidIds('Có sản phẩm không tồn tại hoặc không thuộc cửa hàng này');
  }
  await prisma.$transaction([
    prisma.productRelated.deleteMany({ where: { productId } }),
    prisma.productRelated.createMany({ data: ids.map((relatedProductId, position) => ({ productId, relatedProductId, position })) }),
  ]);
  return adminRelated(productId);
}

// For the public detail: only products on sale, with what the "mua kèm" block shows — first image,
// variants by price (the cheapest in stock is the default choice).
export async function publicRelated(productId: string) {
  const rows = await prisma.productRelated.findMany({
    where: { productId, relatedProduct: { status: PRODUCT_STATUS.ACTIVE } },
    orderBy: { position: 'asc' },
    select: {
      relatedProduct: {
        select: {
          id: true, name: true, slug: true, brand: true,
          images: { orderBy: { position: 'asc' }, take: 1 },
          variants: { orderBy: { price: 'asc' } },
        },
      },
    },
  });
  return rows.map((r) => r.relatedProduct);
}
