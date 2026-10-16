-- Idempotent checkout: the client sends an Idempotency-Key header per checkout attempt, and a
-- repeated attempt with the same key returns the order it already created (instead of answering
-- CART_EMPTY because the first attempt emptied the cart).
--
-- Additive only: a nullable column and a unique index. Existing orders keep NULL, and PostgreSQL
-- treats NULLs as distinct, so they never collide. Safe on a table with data.
--
-- ROLLBACK:
--   DROP INDEX "Order_userId_idempotencyKey_key";
--   ALTER TABLE "Order" DROP COLUMN "idempotencyKey";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_userId_idempotencyKey_key" ON "Order"("userId", "idempotencyKey");
