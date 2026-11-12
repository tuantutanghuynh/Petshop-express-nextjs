-- Product reviews (spec 2026-11-10, ADR-027). Additive: a new enum and table, two columns with defaults.
-- Rollback: DROP TABLE "ProductReview"; DROP TYPE "ReviewStatus";
--           ALTER TABLE "Product" DROP COLUMN "reviewCount", DROP COLUMN "ratingSum";
-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'HIDDEN');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "ratingSum" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProductReview" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "images" JSONB NOT NULL DEFAULT '[]',
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "adminReply" TEXT,
    "adminReplyAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductReview_productId_status_createdAt_idx" ON "ProductReview"("productId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductReview_status_createdAt_idx" ON "ProductReview"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductReview_userId_idx" ON "ProductReview"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReview_productId_userId_key" ON "ProductReview"("productId", "userId");

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Stars 1–5; counters never negative (a double decrement fails loudly).
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "Product" ADD CONSTRAINT "Product_review_counts_check" CHECK ("reviewCount" >= 0 AND "ratingSum" >= 0);
