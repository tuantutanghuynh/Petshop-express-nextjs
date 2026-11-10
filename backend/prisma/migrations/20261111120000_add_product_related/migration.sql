-- "Thường mua kèm" (spec 2026-11-10, ADR-026). Additive: one new table only.
-- Rollback: DROP TABLE "ProductRelated";
-- CreateTable
CREATE TABLE "ProductRelated" (
    "productId" TEXT NOT NULL,
    "relatedProductId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductRelated_pkey" PRIMARY KEY ("productId","relatedProductId")
);

-- CreateIndex
CREATE INDEX "ProductRelated_relatedProductId_idx" ON "ProductRelated"("relatedProductId");

-- AddForeignKey
ALTER TABLE "ProductRelated" ADD CONSTRAINT "ProductRelated_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRelated" ADD CONSTRAINT "ProductRelated_relatedProductId_fkey" FOREIGN KEY ("relatedProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A product never suggests itself, and positions start at 0.
ALTER TABLE "ProductRelated" ADD CONSTRAINT "ProductRelated_not_self_check" CHECK ("productId" <> "relatedProductId" AND "position" >= 0);
