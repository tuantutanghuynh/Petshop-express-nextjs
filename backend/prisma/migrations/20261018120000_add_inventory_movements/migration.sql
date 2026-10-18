-- Inventory ledger (ADR-007): every change to a variant's physical stock is recorded as a delta.
--
-- Additive: one new table, its indexes and foreign keys (SET NULL, so history survives deletion of
-- a variant, user or order). Then an OPENING row per existing variant equal to its current stock,
-- so that from the first day sum(delta) per variant == stockQuantity holds.
--
-- ROLLBACK (no other table is changed):
--   DROP TABLE "InventoryMovement";  (also drops its sequence)

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "variantId" TEXT,
    "sku" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "userId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_seq_key" ON "InventoryMovement"("seq");

-- CreateIndex
CREATE INDEX "InventoryMovement_variantId_seq_idx" ON "InventoryMovement"("variantId", "seq");

-- CreateIndex
CREATE INDEX "InventoryMovement_orderId_idx" ON "InventoryMovement"("orderId");

-- CreateIndex
CREATE INDEX "InventoryMovement_userId_idx" ON "InventoryMovement"("userId");

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Opening balances for variants that already exist.
INSERT INTO "InventoryMovement" ("id", "variantId", "sku", "delta", "quantityAfter", "reason", "createdAt")
SELECT gen_random_uuid()::text, v."id", v."sku", v."stockQuantity", v."stockQuantity", 'OPENING', CURRENT_TIMESTAMP
FROM "ProductVariant" v;
