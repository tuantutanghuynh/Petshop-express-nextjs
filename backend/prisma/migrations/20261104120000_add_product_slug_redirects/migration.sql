-- Former product slugs for 308 redirects (ADR-018). Additive: a new table only.
-- Rollback: DROP TABLE "ProductSlugRedirect";
CREATE TABLE "ProductSlugRedirect" (
    "oldSlug" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductSlugRedirect_pkey" PRIMARY KEY ("oldSlug")
);
CREATE INDEX "ProductSlugRedirect_productId_idx" ON "ProductSlugRedirect"("productId");
ALTER TABLE "ProductSlugRedirect" ADD CONSTRAINT "ProductSlugRedirect_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
