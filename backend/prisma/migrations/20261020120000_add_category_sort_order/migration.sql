-- Display order among sibling categories. Additive: existing rows get 0. Rollback: drop the column.
ALTER TABLE "Category" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
