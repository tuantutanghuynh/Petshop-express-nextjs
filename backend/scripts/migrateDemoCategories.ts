import { assertLocalDatabase } from './localDbGuard';

// One-off for an existing LOCAL database seeded before the category tree: builds the tree, moves the
// demo products onto their leaves and deletes the four old flat demo categories once empty.
// `npm run db:migrate-demo-categories`. The guard runs before Prisma is imported.
async function main(): Promise<void> {
  await import('dotenv/config');
  assertLocalDatabase(process.env.DATABASE_URL);
  const { default: prisma } = await import('../services/prisma');
  const { applyCategoryTree } = await import('./categoryTree');
  const { attachDemoAttributes, moveDemoProducts, removeOldDemoCategories } = await import('./petshopCatalog');
  try {
    await applyCategoryTree(prisma);
    await attachDemoAttributes(prisma);
    const moved = await moveDemoProducts(prisma);
    const removed = await removeOldDemoCategories(prisma);
    console.log(`Moved ${moved} demo products; removed categories: ${removed.join(', ') || 'none'}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
