import crypto from 'crypto';
import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../services/prisma';
import ApiError from '../utils/ApiError';
import asyncHandler from '../utils/asyncHandler';
import { sendSuccess } from '../utils/ApiResponse';
import { PRODUCT_STATUS } from '../constants/product';

// Upper bound for one cart line, matching the `max: 99` rule in routes/cart.route.ts.
const MAX_LINE_QUANTITY = 99;

// The shopping cart, one per user per brand. A cart row stores only which variant and how many —
// never a price. Prices are read back from the database on every display and again when the order
// is placed, so a cart left open for a week can never lock in yesterday's price.

// Loads the caller's cart for the current brand, or an empty shell if they have none yet, and
// recomputes every line total from today's prices. Each line carries its own warnings instead of
// failing the whole request: a cart holding one sold-out item should still render, with that item
// flagged, rather than returning an error and showing the customer nothing. Availability is
// `stockQuantity - reservedQuantity`, because units held for someone else's pending order are not
// ours to sell. `hasIssues` lets the storefront disable the checkout button without re-scanning
// every line itself.
export const getCart = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !req.brand) throw new ApiError(401, 'UNAUTHENTICATED', 'Chưa xác thực');

  const cart = await prisma.cart.findUnique({
    where: { userId_brandSlug: { userId: req.user.id, brandSlug: req.brand.slug } },
    include: {
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          variant: {
            include: { product: { include: { images: { orderBy: { position: 'asc' }, take: 1 } } } },
          },
        },
      },
    },
  });

  if (!cart) {
    return sendSuccess(res, { id: null, brandSlug: req.brand.slug, items: [], subtotal: 0, hasIssues: false });
  }

  const items = cart.items.map((item) => {
    const { variant } = item;
    const available = variant.stockQuantity - variant.reservedQuantity;
    const warnings: string[] = [];

    if (variant.product.status !== PRODUCT_STATUS.ACTIVE) warnings.push('UNAVAILABLE');
    else if (available <= 0) warnings.push('OUT_OF_STOCK');
    else if (item.quantity > available) warnings.push('INSUFFICIENT_STOCK');

    return {
      id: item.id,
      quantity: item.quantity,
      unitPrice: variant.price,
      lineTotal: variant.price * item.quantity,
      available,
      warnings,
      variant: {
        id: variant.id,
        sku: variant.sku,
        variantAttributes: variant.variantAttributes,
        imageUrl: variant.imageUrl || variant.product.images[0]?.url || null,
      },
      product: {
        id: variant.product.id,
        name: variant.product.name,
        slug: variant.product.slug,
      },
    };
  });

  sendSuccess(res, {
    id: cart.id,
    brandSlug: cart.brandSlug,
    items,
    subtotal: items.reduce((sum, i) => sum + i.lineTotal, 0),
    hasIssues: items.some((i) => i.warnings.length > 0),
  });
});

// Adds a variant to the cart, creating the cart on first use. Stock is checked leniently here —
// exceeding it is reported back as a warning rather than refused — because the real check belongs
// at checkout, where stock is actually reserved. Blocking now would be both too strict (the item
// may be restocked before they pay) and not strict enough (stock can sell out between now and
// checkout anyway), so only one of the two checks can be trusted, and it is the later one.
// Adding a variant that is already in the cart increments the existing line rather than creating a
// duplicate, which is what the unique index on (cartId, variantId) enforces.
export const addItem = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !req.brand) throw new ApiError(401, 'UNAUTHENTICATED', 'Chưa xác thực');
  const { variantId } = req.body;
  // The route accepts "2" as well as 2 (isInt); the raw INSERT below needs a real integer.
  const quantity = Number(req.body.quantity ?? 1);

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });
  if (!variant) throw new ApiError(404, 'VARIANT_NOT_FOUND', 'Không tìm thấy biến thể sản phẩm');

  if (variant.product.status !== PRODUCT_STATUS.ACTIVE) {
    throw new ApiError(409, 'PRODUCT_UNAVAILABLE', 'Sản phẩm hiện không bán');
  }

  // A variant from another brand must never land in this cart, or the petshop storefront could be
  // used to buy pottery by posting a guessed id.
  if (!req.brand.categoryIds.includes(variant.product.categoryId)) {
    throw new ApiError(404, 'VARIANT_NOT_FOUND', 'Không tìm thấy biến thể sản phẩm');
  }

  // Both writes are single `INSERT … ON CONFLICT` statements rather than Prisma's upsert. Prisma's
  // upsert is a SELECT followed by an INSERT, so a customer tapping "add" several times on a slow
  // connection sent concurrent first-adds that all saw "no cart yet", all inserted, and all but one
  // died on the unique index. ON CONFLICT lets PostgreSQL resolve that race inside one statement.
  const [cart] = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "Cart" ("id", "userId", "brandSlug", "updatedAt")
    VALUES (${crypto.randomUUID()}, ${req.user.id}, ${req.brand.slug}, now())
    ON CONFLICT ("userId", "brandSlug") DO UPDATE SET "updatedAt" = now()
    RETURNING "id"`;

  // LEAST keeps the 99-per-line cap on the accumulated quantity too. The route only caps a single
  // request, so "add 99" twice used to produce a line of 198.
  const [item] = await prisma.$queryRaw<{ id: string; quantity: number }[]>`
    INSERT INTO "CartItem" ("id", "cartId", "variantId", "quantity")
    VALUES (${crypto.randomUUID()}, ${cart.id}, ${variantId}, ${quantity})
    ON CONFLICT ("cartId", "variantId")
      DO UPDATE SET "quantity" = LEAST("CartItem"."quantity" + EXCLUDED."quantity", ${MAX_LINE_QUANTITY})
    RETURNING "id", "quantity"`;

  const available = variant.stockQuantity - variant.reservedQuantity;
  const warning = item.quantity > available ? 'INSUFFICIENT_STOCK' : null;

  sendSuccess(res, { id: item.id, quantity: item.quantity, available, warning }, null, 201);
});

// Sets a line to an exact quantity, used by the stepper control in the cart page. The line is
// fetched through its cart so a crafted id belonging to somebody else's cart answers 404 rather
// than letting one customer edit another's basket. Quantity is replaced, not incremented, because
// the client sends the value it wants to end up with; incrementing here would double up whenever a
// request is retried after a flaky connection.
// Locks the caller's cart row for the rest of the transaction — the lock createOrder takes before
// reading the cart. Every write to an existing cart line goes through it, so line edits and a
// checkout of the same cart are serialised instead of interleaved.
async function lockCart(tx: Prisma.TransactionClient, userId: string, brandSlug: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Cart" WHERE "userId" = ${userId} AND "brandSlug" = ${brandSlug} FOR UPDATE`;
}

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !req.brand) throw new ApiError(401, 'UNAUTHENTICATED', 'Chưa xác thực');
  const { quantity } = req.body;
  const id = req.params.id as string;
  const { userId, brandSlug } = { userId: req.user.id, brandSlug: req.brand.slug };

  const { item, updated } = await prisma.$transaction(async (tx) => {
    // Take the same cart row lock checkout takes. Without it, a quantity change landing while a
    // checkout runs was applied to a line the checkout had already read: the order kept the old
    // quantity, the line was then deleted with the cart, and the customer's "3" simply vanished.
    // With the lock this waits for the checkout; if the line became part of the order it is gone,
    // and the honest answer is 404 rather than a 200 nobody will ever see the effect of.
    await lockCart(tx, userId, brandSlug);
    const item = await tx.cartItem.findFirst({
      where: { id, cart: { userId, brandSlug } },
      include: { variant: true },
    });
    if (!item) throw new ApiError(404, 'CART_ITEM_NOT_FOUND', 'Không tìm thấy sản phẩm trong giỏ');
    const updated = await tx.cartItem.update({ where: { id: item.id }, data: { quantity } });
    return { item, updated };
  });

  const available = item.variant.stockQuantity - item.variant.reservedQuantity;
  const warning = updated.quantity > available ? 'INSUFFICIENT_STOCK' : null;

  sendSuccess(res, { id: updated.id, quantity: updated.quantity, available, warning });
});

// Removes one line from the cart. Like `updateItem`, the lookup is scoped to the caller's own cart
// so the id alone is not enough to delete somebody else's line. Deleting the last item leaves an
// empty cart row rather than removing it, which keeps the next `addItem` from having to recreate
// one and costs a single unused row per user.
export const removeItem = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !req.brand) throw new ApiError(401, 'UNAUTHENTICATED', 'Chưa xác thực');
  const id = req.params.id as string;
  const { userId, brandSlug } = { userId: req.user.id, brandSlug: req.brand.slug };

  await prisma.$transaction(async (tx) => {
    // Same lock as updateItem: a removal racing a checkout either happens before the checkout reads
    // the cart (the item is not ordered) or after it (the line is gone → 404). Previously it could
    // answer "removed" while the item still went into the order.
    await lockCart(tx, userId, brandSlug);
    const { count } = await tx.cartItem.deleteMany({ where: { id, cart: { userId, brandSlug } } });
    if (count === 0) throw new ApiError(404, 'CART_ITEM_NOT_FOUND', 'Không tìm thấy sản phẩm trong giỏ');
  });

  sendSuccess(res, { message: 'Đã xoá khỏi giỏ hàng' });
});

export default { getCart, addItem, updateItem, removeItem };
