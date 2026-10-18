-- Derived columns for the public product list (ADR-011).
--   searchName: accent-free lower-case name, so "pate meo" finds "Pate mèo".
--   minPrice:   cheapest variant price, so the list can be sorted by price.
-- Expand-only: two nullable columns and one index; nothing is dropped or rewritten.
-- Rollback: DROP INDEX "Product_status_minPrice_id_idx";
--           ALTER TABLE "Product" DROP COLUMN "searchName", DROP COLUMN "minPrice";

ALTER TABLE "Product" ADD COLUMN "searchName" TEXT,
                      ADD COLUMN "minPrice" INTEGER;

-- Backfill existing rows. The application fills both columns on every write from now on
-- (services/catalog.service.ts). This SQL must produce exactly what utils/searchText.ts
-- toSearchText() produces (checked by test/db/catalog.search.test.ts): NFC, lower case, the
-- Vietnamese letters below mapped to their base letter, whitespace collapsed, trimmed.
-- No extension is needed (unaccent is not available everywhere and cannot be indexed directly).
UPDATE "Product"
SET "searchName" = btrim(regexp_replace(
      translate(lower(normalize("name", NFC)),
        'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđçñüöäëïÿîû',
        'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydcnuoaeiyiu'),
      '\s+', ' ', 'g'));

UPDATE "Product" p
SET "minPrice" = (SELECT MIN(v."price") FROM "ProductVariant" v WHERE v."productId" = p."id");

CREATE INDEX "Product_status_minPrice_id_idx" ON "Product"("status", "minPrice", "id");
