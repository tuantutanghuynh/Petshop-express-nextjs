import { assertLocalDatabase } from './localDbGuard';

// Local demo catalogue: `npm run db:seed:petshop`. The guard runs BEFORE Prisma is imported, so a
// non-local DATABASE_URL is refused before any connection is opened.
async function main(): Promise<void> {
  await import('dotenv/config');
  assertLocalDatabase(process.env.DATABASE_URL);
  const { default: prisma } = await import('../services/prisma');
  const { seedPetshopCatalog } = await import('./petshopCatalog');
  try {
    const { created, skipped } = await seedPetshopCatalog(prisma);
    console.log(`Petshop demo catalogue: ${created} products created, ${skipped} already present.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
