-- Safety net for stock counters: the database refuses an impossible value even if application
-- code ever regresses into a race. Before this, the confirm/cancel races found by
-- test/db/order.race.test.ts drove "reservedQuantity" to -4 without any error.
--
--   stockQuantity    >= 0               we cannot own a negative number of units
--   reservedQuantity >= 0               we cannot hold a negative number of units for customers
--   reservedQuantity <= stockQuantity   we never promise more units than we own
--
-- Prisma's schema language cannot express CHECK constraints, so they live only here; `migrate diff`
-- and `db push` ignore them (no drift is reported).
--
-- BEFORE APPLYING on a database with data, this must return zero rows, otherwise the ALTER fails:
--   SELECT id, sku, "stockQuantity", "reservedQuantity" FROM "ProductVariant"
--   WHERE "stockQuantity" < 0 OR "reservedQuantity" < 0 OR "reservedQuantity" > "stockQuantity";
-- Rows found there are damage from the races fixed on 2026-10-12; see docs/DECISIONS.md (ADR-004)
-- for the repair query that recomputes "reservedQuantity" from pending orders.
--
-- No data is changed by this migration. ROLLBACK:
--   ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_stock_non_negative",
--     DROP CONSTRAINT "ProductVariant_reserved_non_negative",
--     DROP CONSTRAINT "ProductVariant_reserved_within_stock";

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_stock_non_negative" CHECK ("stockQuantity" >= 0),
  ADD CONSTRAINT "ProductVariant_reserved_non_negative" CHECK ("reservedQuantity" >= 0),
  ADD CONSTRAINT "ProductVariant_reserved_within_stock" CHECK ("reservedQuantity" <= "stockQuantity");
