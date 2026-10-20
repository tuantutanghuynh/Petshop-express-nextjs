-- Former category slugs for 308 redirects (ADR-017). Additive: a new table only.
-- Rollback: DROP TABLE "CategorySlugRedirect";
CREATE TABLE "CategorySlugRedirect" (
    "oldSlug" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CategorySlugRedirect_pkey" PRIMARY KEY ("oldSlug")
);
CREATE INDEX "CategorySlugRedirect_categoryId_idx" ON "CategorySlugRedirect"("categoryId");
ALTER TABLE "CategorySlugRedirect" ADD CONSTRAINT "CategorySlugRedirect_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
