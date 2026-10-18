import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

// Keeps Product.minPrice equal to the cheapest variant price (the sort key for "price" / "-price").
// Every write that adds, removes or reprices a variant calls lockProduct() first and
// refreshMinPrice() last, inside one transaction.
//
// Why the lock: two admins repricing two variants of the same product at the same moment would
// each compute MIN() without seeing the other's uncommitted change, and whichever committed last
// would store a minimum that ignores the other price. Locking the product row makes writes to one
// product's variants run one after another, so the second MIN() sees the first change.
// Tested with concurrent requests in test/db/catalog.search.test.ts.
export async function lockProduct(tx: Tx, productId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
}

export async function refreshMinPrice(tx: Tx, productId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Product" p
    SET "minPrice" = (SELECT MIN(v."price") FROM "ProductVariant" v WHERE v."productId" = p."id")
    WHERE p."id" = ${productId}`;
}
