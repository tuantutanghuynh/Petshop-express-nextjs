import type { Prisma } from '@prisma/client';
import prisma from './prisma';
import ApiError from '../utils/ApiError';
import { PRODUCT_STATUS } from '../constants/product';

// Shop-scoped access to products for the admin (spec 2026-11-04 admin products). The scope is the
// id list resolveBrand puts on req.brand: the brand root and every category under it. A product
// belongs to the shop when its category is in that list; anything else answers 404, so an admin of
// one storefront cannot even learn that another storefront's rows exist.
export type Scope = { shopIds: string[] };

const productNotFound = () => new ApiError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm');

export function assertCategoryInShop(s: Scope, categoryId: string): void {
  if (!s.shopIds.includes(categoryId)) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục');
}

export async function productInShop(s: Scope, id: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product || !s.shopIds.includes(product.categoryId)) throw productNotFound();
  return product;
}

// The owner's category is read in a separate select so the returned row is the plain variant.
export async function variantInShop(s: Scope, variantId: string) {
  const owner = await prisma.productVariant.findUnique({ where: { id: variantId }, select: { product: { select: { categoryId: true } } } });
  if (!owner || !s.shopIds.includes(owner.product.categoryId)) throw new ApiError(404, 'VARIANT_NOT_FOUND', 'Không tìm thấy biến thể');
  return prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
}

export async function imageInShop(s: Scope, imageId: string) {
  const owner = await prisma.productImage.findUnique({ where: { id: imageId }, select: { product: { select: { categoryId: true } } } });
  if (!owner || !s.shopIds.includes(owner.product.categoryId)) throw new ApiError(404, 'IMAGE_NOT_FOUND', 'Không tìm thấy ảnh');
  return prisma.productImage.findUniqueOrThrow({ where: { id: imageId } });
}

// A slug is free when no other product uses it now and it is not another product's former slug
// (that URL still redirects there).
export async function assertProductSlugFree(slug: string, ownId?: string): Promise<void> {
  const [used, redirect] = await Promise.all([
    prisma.product.findUnique({ where: { slug }, select: { id: true } }),
    prisma.productSlugRedirect.findUnique({ where: { oldSlug: slug }, select: { productId: true } }),
  ]);
  if ((used && used.id !== ownId) || (redirect && redirect.productId !== ownId)) {
    throw new ApiError(409, 'SLUG_TAKEN', 'Slug này đang được dùng (hoặc là URL cũ của sản phẩm khác)');
  }
}

// Inside the caller's transaction, before the product row gets newSlug: keep the current slug as a
// redirect, and drop the redirect that pointed newSlug back here when the owner returns to it.
export async function changeProductSlug(tx: Prisma.TransactionClient, product: { id: string; slug: string }, newSlug: string): Promise<void> {
  await tx.productSlugRedirect.deleteMany({ where: { oldSlug: newSlug, productId: product.id } });
  await tx.productSlugRedirect.create({ data: { oldSlug: product.slug, productId: product.id } });
}

export async function getShopProduct(s: Scope, id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { include: { attributes: { orderBy: { attributeLabel: 'asc' } } } },
      images: { orderBy: { position: 'asc' } },
      variants: { orderBy: { price: 'asc' } },
    },
  });
  if (!product || !s.shopIds.includes(product.categoryId)) throw productNotFound();
  return product;
}

// Public: the current slug behind a former one, only for a product on sale (a draft must not be
// discoverable through its old URL).
export async function resolveProductSlug(oldSlug: string): Promise<string> {
  const row = await prisma.productSlugRedirect.findUnique({ where: { oldSlug }, select: { product: { select: { slug: true, status: true } } } });
  if (!row || row.product.status !== PRODUCT_STATUS.ACTIVE) throw productNotFound();
  return row.product.slug;
}
