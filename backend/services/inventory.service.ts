import type { Prisma } from '@prisma/client';
import ApiError from '../utils/ApiError';
import { MAX_DB_INT } from '../constants/product';
import { MOVEMENT_REASON } from '../constants/inventory';

// The only code that changes a variant's physical stock (ADR-007). Every function runs inside the
// caller's transaction and writes the stock change and its ledger row together, so they commit or
// roll back as one: sum(delta) per variant == stockQuantity, always.
//
// Two shapes of write, on purpose:
//   - orders use a CONDITIONAL delta (`stock = stock + delta WHERE …`): one statement, no prior
//     read, so concurrent checkouts can never oversell and never overwrite each other;
//   - admin adjustments lock the row first (`FOR UPDATE`), because they must report WHY they were
//     refused (below the reserved units, above the column limit) and a stocktake needs the current
//     value to compute its delta. The lock is what makes the read-then-write safe here.

type Tx = Prisma.TransactionClient;

type MovementInput = {
  variantId: string;
  delta: number;
  reason: string;
  userId?: string | null;
  orderId?: string | null;
  note?: string | null;
};

// Appends one ledger row. quantityAfter and sku come from the variant row as it is NOW inside this
// transaction, i.e. right after the stock change. Inserted while the variant row is locked by that
// change, so `seq` follows the true order of changes to this variant.
async function writeMovement(tx: Tx, m: MovementInput): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "InventoryMovement" ("id", "variantId", "sku", "delta", "quantityAfter", "reason", "note", "userId", "orderId")
    SELECT gen_random_uuid()::text, v."id", v."sku", ${m.delta}, v."stockQuantity", ${m.reason}, ${m.note ?? null}, ${m.userId ?? null}, ${m.orderId ?? null}
    FROM "ProductVariant" v WHERE v."id" = ${m.variantId}`;
}

// Records the stock a variant was created with (product creation / new variant).
export async function recordOpening(tx: Tx, variantId: string, userId: string | null): Promise<void> {
  const v = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { stockQuantity: true } });
  await writeMovement(tx, { variantId, delta: v.stockQuantity, reason: MOVEMENT_REASON.OPENING, userId });
}

// COD checkout, step 1: takes `quantity` units off the shelf only if that many are free
// (stock − reserved). Returns false when they are not, so the caller can refuse the order.
// The ledger row is written by recordSale once the order exists (it references the order), still
// inside the same transaction and while this UPDATE keeps the variant row locked.
export async function claimForSale(tx: Tx, variantId: string, quantity: number): Promise<boolean> {
  const changed = await tx.$executeRaw`
    UPDATE "ProductVariant" SET "stockQuantity" = "stockQuantity" - ${quantity}
    WHERE "id" = ${variantId} AND "stockQuantity" - "reservedQuantity" >= ${quantity}`;
  return changed === 1;
}

// COD checkout, step 2: the ledger row for a claim made by claimForSale.
export async function recordSale(tx: Tx, variantId: string, quantity: number, orderId: string): Promise<void> {
  await writeMovement(tx, { variantId, delta: -quantity, reason: MOVEMENT_REASON.SALE, orderId });
}

// Confirmed bank transfer: the held units become a real sale — reservation and stock both drop.
export async function sellReserved(tx: Tx, variantId: string, quantity: number, orderId: string, userId: string | null): Promise<void> {
  await tx.$executeRaw`
    UPDATE "ProductVariant"
    SET "stockQuantity" = "stockQuantity" - ${quantity}, "reservedQuantity" = "reservedQuantity" - ${quantity}
    WHERE "id" = ${variantId}`;
  await writeMovement(tx, { variantId, delta: -quantity, reason: MOVEMENT_REASON.SALE, orderId, userId });
}

// Cancelled order whose stock had already left: the units go back on the shelf.
export async function restockCancelled(tx: Tx, variantId: string, quantity: number, orderId: string, userId: string | null): Promise<void> {
  await tx.$executeRaw`
    UPDATE "ProductVariant" SET "stockQuantity" = "stockQuantity" + ${quantity} WHERE "id" = ${variantId}`;
  await writeMovement(tx, { variantId, delta: quantity, reason: MOVEMENT_REASON.CANCEL_RESTOCK, orderId, userId });
}

type AdminMovement =
  | { type: 'ADJUST'; delta: number; reason: string; note?: string | null }
  | { type: 'STOCKTAKE'; countedQuantity: number; note?: string | null };

// Admin adjustment by delta or by physical count. Locks the variant row, computes the new stock,
// refuses anything below the units promised to pending orders, then writes stock + ledger.
export async function adjustStockByAdmin(tx: Tx, variantId: string, input: AdminMovement, userId: string) {
  const [row] = await tx.$queryRaw<{ stockQuantity: number; reservedQuantity: number }[]>`
    SELECT "stockQuantity", "reservedQuantity" FROM "ProductVariant" WHERE "id" = ${variantId} FOR UPDATE`;
  if (!row) throw new ApiError(404, 'VARIANT_NOT_FOUND', 'Không tìm thấy biến thể');

  const isCount = input.type === 'STOCKTAKE';
  const newStock = isCount ? input.countedQuantity : row.stockQuantity + input.delta;
  const delta = newStock - row.stockQuantity;

  if (newStock < row.reservedQuantity) {
    throw new ApiError(
      409,
      'STOCK_BELOW_RESERVED',
      `Không thể đặt tồn kho thấp hơn ${row.reservedQuantity} đang giữ cho đơn chờ thanh toán`
    );
  }
  if (newStock > MAX_DB_INT) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Tồn kho vượt giới hạn cho phép');
  }

  await tx.productVariant.update({ where: { id: variantId }, data: { stockQuantity: newStock } });
  await writeMovement(tx, {
    variantId,
    delta,
    reason: isCount ? MOVEMENT_REASON.STOCKTAKE : input.reason,
    note: input.note ?? null,
    userId,
  });

  return tx.productVariant.findUniqueOrThrow({ where: { id: variantId } });
}

export default { recordOpening, claimForSale, recordSale, sellReserved, restockCancelled, adjustStockByAdmin };
