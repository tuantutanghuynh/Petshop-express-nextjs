import prisma from '../services/prisma';
import { logger } from '../utils/logger';
import {
  ORDER_STATUS,
  PAYMENT_STATUS,
  SWEEP_INTERVAL_MINUTES,
} from '../constants/order';

// Background cleanup for bank-transfer orders nobody paid for. Placing such an order holds stock in
// `reservedQuantity`, and without this job that counter only ever goes up: after a few weeks the
// shop would report everything sold out while the shelves are still full. The reservation mechanism
// is only half a design — this file is the other half.

// Cancels every expired order and gives its held units back, returning how many it handled so the
// caller (or a test) can see whether it did anything.
//
// Each order is claimed with a conditional UPDATE before its stock is touched. That condition is
// what makes the job safe to run twice at once: if the server ever runs as two instances, both will
// find the same expired order, but only one of them will update a row. The other sees zero rows
// affected and moves on, instead of releasing the same reservation a second time and inflating
// available stock beyond what physically exists.
//
// Orders are processed one transaction each rather than all in one. A single failing row then
// cancels only itself; batching them would mean one bad order blocks every other order's stock from
// coming back.
export async function releaseExpiredOrders(): Promise<number> {
  const expired = await prisma.order.findMany({
    where: {
      orderStatus: ORDER_STATUS.PENDING_PAYMENT,
      expiresAt: { lt: new Date() },
    },
    include: { items: true },
  });

  let released = 0;

  for (const order of expired) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.$executeRaw`
        UPDATE "Order"
        SET "orderStatus" = ${ORDER_STATUS.CANCELLED},
            "paymentStatus" = ${PAYMENT_STATUS.EXPIRED},
            "expiresAt" = NULL,
            "updatedAt" = NOW()
        WHERE "id" = ${order.id}
          AND "orderStatus" = ${ORDER_STATUS.PENDING_PAYMENT}`;

      if (claimed !== 1) return; // another instance, or an admin, got here first

      for (const item of order.items) {
        if (!item.variantId) continue; // variant deleted; the order's snapshot still stands
        await tx.$executeRaw`
          UPDATE "ProductVariant"
          SET "reservedQuantity" = "reservedQuantity" - ${item.quantity}
          WHERE "id" = ${item.variantId}`;
      }

      released += 1;
    });
  }

  return released;
}

// Starts the periodic sweep and returns the timer so callers can stop it. `unref()` keeps this timer
// from holding the process alive on its own, so a script that finishes its work still exits instead
// of hanging until the next tick.
//
// Errors are caught and logged rather than left to bubble: an unhandled rejection inside a timer
// callback terminates the process in modern Node, which would turn a momentary database hiccup into
// a dead server.
export function startExpiredOrderSweeper(): NodeJS.Timeout {
  const run = () => {
    releaseExpiredOrders()
      .then((n) => {
        if (n > 0) logger.info({ released: n }, `[sweeper] Đã huỷ ${n} đơn quá hạn và hoàn kho`);
      })
      .catch((err: Error) => logger.error({ err }, '[sweeper] Lỗi khi dọn đơn quá hạn'));
  };

  run();
  const timer = setInterval(run, SWEEP_INTERVAL_MINUTES * 60 * 1000);
  timer.unref();
  return timer;
}

export default { releaseExpiredOrders, startExpiredOrderSweeper };
