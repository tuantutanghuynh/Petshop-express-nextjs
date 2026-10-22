import crypto from 'crypto';
import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../services/prisma';
import ApiError from '../utils/ApiError';
import asyncHandler from '../utils/asyncHandler';
import { sendSuccess } from '../utils/ApiResponse';
import { claimForSale, recordSale, restockCancelled, sellReserved } from '../services/inventory.service';
import { parsePagination } from '../utils/pagination';
import { escapeLike } from '../utils/searchText';
import { PRODUCT_STATUS, MAX_DB_INT } from '../constants/product';
import {
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  ORDER_TRANSITIONS,
  PAYMENT_WINDOW_HOURS,
  SHIPPING_FEE_NOT_CALCULATED,
} from '../constants/order';

// Checkout and order management. This file owns the two things that must never go wrong in a shop:
// money is always recalculated from the database rather than trusted from the client, and stock is
// changed with a conditional UPDATE so two customers buying the last item cannot both succeed.

// Builds a human-readable order code such as NP-260918-K3F9A2. The date makes support lookups easy;
// the random tail exists so a customer cannot guess someone else's code by adding one to their own,
// which a sequential counter would allow — and which would also leak how many orders the shop
// takes per day. Six base-36 characters give about two billion combinations per day, and the unique
// index on the column is the real guarantee if two ever collide.
function generateOrderCode(): string {
  const d = new Date();
  const date = [
    String(d.getFullYear()).slice(2),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('');
  const tail = crypto.randomBytes(4).readUInt32BE(0).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  return `NP-${date}-${tail}`;
}

// Moves an order to a new status, refusing any transition the state machine does not allow. Every
// status change goes through here rather than assigning `orderStatus` directly, because a stray
// assignment could send a CANCELLED order back to CONFIRMED — resurrecting an order whose stock has
// already been returned to the shelf, and selling goods that are no longer held for anyone.
function assertTransition(from: string, to: string): void {
  const allowed = ORDER_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new ApiError(409, 'INVALID_STATE_TRANSITION', `Không thể chuyển đơn từ ${from} sang ${to}`);
  }
}

// The error for an order whose status changed between our read and our write. 409 rather than 500:
// nothing is broken, someone simply got there first, and reloading the order shows what happened.
function orderChangedConcurrently(): ApiError {
  return new ApiError(409, 'ORDER_STATE_CHANGED', 'Đơn hàng vừa được cập nhật bởi thao tác khác, vui lòng tải lại');
}

// Places an order from the caller's cart. Everything happens inside one transaction: prices are
// re-read, stock is claimed, the order and its snapshot lines are written, and the cart is emptied.
// Any failure rolls all of it back, so there is never a half-created order or stock held by an
// order that does not exist.
//
// The two payment methods claim stock differently, and this is the decision the whole design rests
// on. A bank transfer only *reserves* the units — the customer has PAYMENT_WINDOW_HOURS to pay, and
// until then the goods are off the shelf but still counted as in stock. COD deducts immediately,
// because that order is final and the parcel is packed straight away.
//
// Prices come from the database, never from the request. A client that posts its own totals is
// either out of date or lying, and there is no way to tell which.
export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !req.brand) throw new ApiError(401, 'UNAUTHENTICATED', 'Chưa xác thực');
  const { paymentMethod, note } = req.body;
  // Snapshot only the fields the route validates. Storing `req.body.shippingAddress` as sent let a
  // client park arbitrary JSON (up to the 10 MB body limit) inside every order row.
  const { fullName, phone, addressLine, city } = req.body.shippingAddress;
  const shippingAddress = { fullName, phone, addressLine, city };
  const userId = req.user.id;
  const brandSlug = req.brand.slug;
  const isCod = paymentMethod === PAYMENT_METHOD.COD;
  const idempotencyKey = req.get('Idempotency-Key') || null;

  const { order, replayed } = await prisma.$transaction(
    async (tx) => {
      // Lock the caller's cart row before reading its lines. A double click (or a client retrying
      // after a timeout) sends two checkouts for the same cart; reading the cart outside the
      // transaction let both see the full cart and both create an order. With the row lock the
      // second request waits here until the first commits, then reads an empty cart and stops.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Cart" WHERE "userId" = ${userId} AND "brandSlug" = ${brandSlug} FOR UPDATE`;

      // Same checkout attempt seen again (same Idempotency-Key): hand back the order it already
      // created. Checked after the lock, so a concurrent duplicate waits for the first request to
      // commit and then finds its order here, instead of hitting the emptied cart and answering
      // CART_EMPTY for a checkout that actually succeeded. Scoped to the caller, so a key cannot be
      // used to read somebody else's order. The key identifies the attempt, not the cart contents:
      // whatever the repeat carries, the answer is the order that attempt produced.
      if (idempotencyKey) {
        const existing = await tx.order.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
          include: { items: true },
        });
        if (existing) return { order: existing, replayed: true };
      }

      const cartItems = locked.length
        ? await tx.cartItem.findMany({
            where: { cartId: locked[0].id },
            include: { variant: { include: { product: true } } },
          })
        : [];

      if (cartItems.length === 0) {
        throw new ApiError(422, 'CART_EMPTY', 'Giỏ hàng đang trống');
      }

      const unavailable = cartItems.find((i) => i.variant.product.status !== PRODUCT_STATUS.ACTIVE);
      if (unavailable) {
        throw new ApiError(409, 'PRODUCT_UNAVAILABLE', `Sản phẩm "${unavailable.variant.product.name}" hiện không bán`);
      }

      // Claim stock in a fixed order (by variant id) so two orders containing the same products
      // always lock rows in the same sequence. Without this, order A holding variant 1 while order B
      // holds variant 2 — each waiting for the other — is a deadlock the database can only resolve by
      // killing one of them.
      const items = [...cartItems].sort((a, b) => (a.variantId < b.variantId ? -1 : 1));

      // Checked before any stock is claimed. Each price fits the INTEGER column and each line is
      // capped at 99 units, but their product does not have to fit: 30.000.000₫ × 99 overflows
      // "subtotal", the INSERT failed after stock had been claimed, and the customer got a 500.
      const subtotal = items.reduce((sum, i) => sum + i.variant.price * i.quantity, 0);
      if (subtotal + SHIPPING_FEE_NOT_CALCULATED > MAX_DB_INT) {
        throw new ApiError(422, 'ORDER_TOO_LARGE', 'Giá trị đơn hàng vượt giới hạn, vui lòng tách thành nhiều đơn hoặc liên hệ shop');
      }

      for (const item of items) {
        // The availability check lives inside the UPDATE rather than in a separate SELECT. Reading
        // the stock first and deciding afterwards leaves a gap in which another request can do the
        // same thing, and both then write — which is exactly how a shop sells one vase twice. Here
        // the database evaluates the condition while holding the row lock, so of two concurrent
        // requests for the last unit, one updates a row and the other updates none.
        // COD takes the units off the shelf (a stock movement, recorded below once the order exists);
        // a bank transfer only holds them, which is not a movement of physical stock.
        const claimed = isCod
          ? await claimForSale(tx, item.variantId, item.quantity)
          : (await tx.$executeRaw`
              UPDATE "ProductVariant"
              SET "reservedQuantity" = "reservedQuantity" + ${item.quantity}
              WHERE "id" = ${item.variantId}
                AND "stockQuantity" - "reservedQuantity" >= ${item.quantity}`) === 1;

        if (!claimed) {
          throw new ApiError(
            409,
            'OUT_OF_STOCK',
            `Sản phẩm "${item.variant.product.name}" không đủ hàng`
          );
        }
      }

      const shippingFee = SHIPPING_FEE_NOT_CALCULATED;

      const created = await tx.order.create({
        data: {
          code: generateOrderCode(),
          userId,
          brandSlug,
          orderStatus: isCod ? ORDER_STATUS.CONFIRMED : ORDER_STATUS.PENDING_PAYMENT,
          paymentMethod,
          paymentStatus: isCod ? PAYMENT_STATUS.UNPAID : PAYMENT_STATUS.PENDING,
          subtotal,
          shippingFee,
          grandTotal: subtotal + shippingFee,
          shippingAddress,
          note: note || null,
          // A COD order is already final, so it never expires. A bank transfer holds stock, so it
          // must have a deadline or the reservation would sit there forever.
          expiresAt: isCod ? null : new Date(Date.now() + PAYMENT_WINDOW_HOURS * 3600 * 1000),
          idempotencyKey,
          items: {
            create: items.map((i) => ({
              variantId: i.variantId,
              // Snapshots, not references. A year from now the product may be renamed, repriced or
              // deleted; this order must still show what was actually bought and for how much.
              productName: i.variant.product.name,
              sku: i.variant.sku,
              unitPrice: i.variant.price,
              quantity: i.quantity,
              lineTotal: i.variant.price * i.quantity,
            })),
          },
        },
        include: { items: true },
      });

      if (isCod) {
        for (const item of items) await recordSale(tx, item.variantId, item.quantity, created.id);
      }

      await tx.cartItem.deleteMany({ where: { cartId: locked[0].id } });

      return { order: created, replayed: false };
    },
    { timeout: 15000 }
  );

  // 201 when this request created the order, 200 when it replayed an earlier attempt — the body
  // is the same order either way, so a client can treat both as success.
  sendSuccess(res, order, null, replayed ? 200 : 201);
});

// Lists the caller's own orders, newest first. The `userId` filter is not a convenience — it is the
// access control. Without it any logged-in customer could page through every order in the shop.
export const listMyOrders = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !req.brand) throw new ApiError(401, 'UNAUTHENTICATED', 'Chưa xác thực');
  const { page, take, skip } = parsePagination(req.query, 10, 50);

  const where: Prisma.OrderWhereInput = { userId: req.user.id, brandSlug: req.brand.slug };

  const [items, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { items: true }, skip, take }),
    prisma.order.count({ where }),
  ]);

  sendSuccess(res, items, { page, pageSize: take, total });
});

// Fetches one of the caller's orders by its code. The lookup filters on `userId` as well as `code`,
// so knowing or guessing somebody else's code is not enough to read their order — the commonest
// form of broken access control in a shop, and the reason order codes have a random tail too.
export const getMyOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Chưa xác thực');
  const code = req.params.code as string;
  const order = await prisma.order.findFirst({
    where: { code, userId: req.user.id },
    include: { items: true },
  });
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng');
  sendSuccess(res, order);
});

// Admin listing across all customers for one brand, filterable by order and payment status and
// searchable (?q=) by code, phone or account. This is the screen the shop works from every morning
// to see which transfers have arrived.
export const adminList = asyncHandler(async (req: Request, res: Response) => {
  if (!req.brand) throw new ApiError(400, 'BRAND_REQUIRED', 'Thiếu thông tin thương hiệu');
  const { orderStatus, paymentStatus, q } = req.query;
  const { page, take, skip } = parsePagination(req.query, 20, 100);

  const where: Prisma.OrderWhereInput = { brandSlug: req.brand.slug };
  if (orderStatus && typeof orderStatus === 'string') where.orderStatus = orderStatus;
  if (paymentStatus && typeof paymentStatus === 'string') where.paymentStatus = paymentStatus;
  // ?q= finds the order a customer calls about: by code (any case), by phone, or by the account's
  // name / email. Validated by the route; escapeLike because Prisma does not escape % and _.
  // The phone is stored as typed ("0912 345 678"), so it is compared digits-to-digits in SQL — only
  // with ≥ 3 digits, or "1" would match every order. Parameterized query; ids then join the filter.
  if (typeof q === 'string') {
    const term = escapeLike(q.trim());
    const digits = q.replace(/\D/g, '');
    const phoneMatches = digits.length >= 3
      ? await prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Order"
          WHERE "brandSlug" = ${req.brand.slug}
            AND regexp_replace("shippingAddress"->>'phone', '[^0-9]', '', 'g') LIKE ${`%${digits}%`}`
      : [];
    where.OR = [
      { code: { contains: term, mode: 'insensitive' } },
      ...(phoneMatches.length > 0 ? [{ id: { in: phoneMatches.map((r) => r.id) } }] : []),
      { user: { fullName: { contains: term, mode: 'insensitive' } } },
      { user: { email: { contains: term, mode: 'insensitive' } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { items: true, user: { select: { id: true, email: true, fullName: true } } },
      skip,
      take,
    }),
    prisma.order.count({ where }),
  ]);

  sendSuccess(res, items, { page, pageSize: take, total });
});

// Marks a bank-transfer order as paid once the shop has seen the money arrive, converting the held
// units into a real deduction: `reservedQuantity` goes down and `stockQuantity` goes down with it.
// Until now the goods were only set aside; this is the moment they actually leave the shelf.
//
// This is the exact seam where VNPay will plug in later. The gateway's webhook will call this same
// logic instead of an admin pressing a button — which is why the bank-transfer flow was built first
// rather than starting with COD.
export const confirmPayment = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng');

  if (order.paymentStatus === PAYMENT_STATUS.PAID) {
    throw new ApiError(409, 'ALREADY_PAID', 'Đơn hàng đã được thanh toán');
  }
  assertTransition(order.orderStatus, ORDER_STATUS.CONFIRMED);

  const updated = await prisma.$transaction(async (tx) => {
    // The checks above ran on a snapshot read outside this transaction, so by now another request
    // may already have confirmed or cancelled the order — or the expiry sweeper may have released
    // it. Claim the order first with a conditional UPDATE: only the request that still finds it in
    // the state we read gets a row back, and only that one may touch stock. Without this, a double
    // click deducted stock twice and a confirm racing the sweeper resurrected a cancelled order.
    const claimed = await tx.order.updateMany({
      where: { id: order.id, orderStatus: order.orderStatus, paymentStatus: { not: PAYMENT_STATUS.PAID } },
      data: {
        orderStatus: ORDER_STATUS.CONFIRMED,
        paymentStatus: PAYMENT_STATUS.PAID,
        paidAt: new Date(),
        expiresAt: null,
      },
    });
    if (claimed.count !== 1) throw orderChangedConcurrently();

    for (const item of order.items) {
      if (!item.variantId) continue; // variant đã bị xoá; snapshot vẫn giữ nguyên thông tin đơn
      await sellReserved(tx, item.variantId, item.quantity, order.id, req.user?.id ?? null);
    }

    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
  });

  sendSuccess(res, updated);
});

// Cancels an order and puts its stock back. Which counter to restore depends on where the order got
// to: an unpaid order was only holding units, so the reservation is released; a confirmed order had
// already been deducted, so the units return to `stockQuantity`. Getting this backwards is how a
// shop ends up with phantom inventory it cannot sell, or with stock it does not physically have.
export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng');

  assertTransition(order.orderStatus, ORDER_STATUS.CANCELLED);

  const wasHoldingReservation = order.orderStatus === ORDER_STATUS.PENDING_PAYMENT;

  const updated = await prisma.$transaction(async (tx) => {
    // Same claim as in confirmPayment: which counter to restore was decided from the status we read,
    // so the cancel is only valid if the order is STILL in that status. A second cancel, a confirm
    // that slipped in between, or the sweeper expiring the order all make this update match no row,
    // and then nothing is given back — otherwise the same units would be released twice.
    const claimed = await tx.order.updateMany({
      where: { id: order.id, orderStatus: order.orderStatus },
      data: { orderStatus: ORDER_STATUS.CANCELLED, expiresAt: null },
    });
    if (claimed.count !== 1) throw orderChangedConcurrently();

    for (const item of order.items) {
      if (!item.variantId) continue;
      if (wasHoldingReservation) {
        // releasing a hold is not a stock movement
        await tx.$executeRaw`
          UPDATE "ProductVariant"
          SET "reservedQuantity" = "reservedQuantity" - ${item.quantity}
          WHERE "id" = ${item.variantId}`;
      } else {
        await restockCancelled(tx, item.variantId, item.quantity, order.id, req.user?.id ?? null);
      }
    }

    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
  });

  sendSuccess(res, updated);
});

// Moves a confirmed order along fulfilment: CONFIRMED → PROCESSING (packed / handed to the courier)
// → COMPLETED (delivered). Stock is not touched — it left the shelf when the order was confirmed.
//
// Completing a COD order is also the moment its money arrives (the courier collected the cash), so
// it becomes PAID with paidAt stamped; a bank transfer was already PAID and keeps its original
// paidAt. Same concurrency rule as confirm / cancel: the write only applies if the order is still
// in the status we validated, so two admins pressing at once cannot both "win".
//
// The lookup is scoped to the brand in X-Brand-Slug: an order of another storefront answers 404.
export const updateFulfilmentStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.brand) throw new ApiError(400, 'BRAND_REQUIRED', 'Thiếu thông tin thương hiệu');
  const id = req.params.id as string;
  const nextStatus = req.body.status as string;

  const order = await prisma.order.findFirst({ where: { id, brandSlug: req.brand.slug } });
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng');

  assertTransition(order.orderStatus, nextStatus);

  const collectsCodCash = nextStatus === ORDER_STATUS.COMPLETED && order.paymentStatus === PAYMENT_STATUS.UNPAID;

  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: order.id, orderStatus: order.orderStatus },
      data: {
        orderStatus: nextStatus,
        ...(collectsCodCash && { paymentStatus: PAYMENT_STATUS.PAID, paidAt: new Date() }),
      },
    });
    if (claimed.count !== 1) throw orderChangedConcurrently();
    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
  });

  sendSuccess(res, updated);
});

export default { createOrder, listMyOrders, getMyOrder, adminList, confirmPayment, cancelOrder, updateFulfilmentStatus };
