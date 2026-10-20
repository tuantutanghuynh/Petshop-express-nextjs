// `npm run seed:category-tree` prints what would change; `npm run seed:category-tree -- --apply`
// writes it. Allowed on any database (production included): it only creates or updates the
// categories of scripts/categoryTree.ts by slug, never deletes, never touches products.
async function main(): Promise<void> {
  await import('dotenv/config');
  const apply = process.argv.includes('--apply');
  const { default: prisma } = await import('../services/prisma');
  const { applyCategoryTree, readCategoryTreePlan } = await import('./categoryTree');
  try {
    const plan = apply ? await applyCategoryTree(prisma) : await readCategoryTreePlan(prisma);
    for (const step of plan) {
      if (step.action !== 'keep') console.log(`${step.action.padEnd(6)} ${step.category.parentSlug} › ${step.category.slug} (${step.category.name})`);
    }
    const count = (action: string) => plan.filter((s) => s.action === action).length;
    console.log(`${apply ? 'Applied' : 'Dry run'}: ${count('create')} create, ${count('update')} update, ${count('keep')} unchanged.${apply ? '' : ' Re-run with --apply to write.'}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
