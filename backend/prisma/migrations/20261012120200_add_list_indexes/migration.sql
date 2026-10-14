-- Indexes for the two busiest public list queries (declared in schema.prisma as @@index).
-- Measured in test/db/catalog.query.test.ts: with 20 000 rows both queries did a sequential scan of
-- the whole table plus a sort on every storefront / blog page view.
--
--   Product:  WHERE status = 'active' ORDER BY "createdAt" DESC, id DESC LIMIT n
--   BlogPost: WHERE status = 'published' AND "publishedAt" <= now() ORDER BY "publishedAt" DESC, id DESC
--
-- `id` is the pagination tie-breaker, so the index can return rows already in final order.
-- No data is changed. On a large live table, run the same statements by hand with
-- CREATE INDEX CONCURRENTLY (outside a transaction) to avoid blocking writes, then mark this
-- migration applied with `prisma migrate resolve --applied 20261012120200_add_list_indexes`.
--
-- The live database also carries "BlogPost_status_publishedAt_idx" (status, publishedAt), created
-- outside any migration. The new index has the same leading columns, so the old one is redundant
-- and is dropped; IF EXISTS keeps this a no-op on databases built from migrations.
--
-- ROLLBACK:
--   DROP INDEX "BlogPost_status_publishedAt_id_idx";
--   DROP INDEX "Product_status_createdAt_id_idx";
--   CREATE INDEX "BlogPost_status_publishedAt_idx" ON "BlogPost"("status", "publishedAt");  -- live DB only

-- DropIndex
DROP INDEX IF EXISTS "BlogPost_status_publishedAt_idx";

-- CreateIndex
CREATE INDEX "BlogPost_status_publishedAt_id_idx" ON "BlogPost"("status", "publishedAt", "id");

-- CreateIndex
CREATE INDEX "Product_status_createdAt_id_idx" ON "Product"("status", "createdAt", "id");
