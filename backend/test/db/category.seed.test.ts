import { describe, expect, it } from 'vitest';
import prisma from '../../services/prisma';
import { applyCategoryTree, readCategoryTreePlan } from '../../scripts/categoryTree';

// `npm run seed:category-tree -- --apply` may run on production, so it must be repeatable and must
// keep existing rows (same id: products and links stay attached) while fixing names and parents.
describe('applyCategoryTree', () => {
  it('creates the whole tree once and is a no-op the second time', async () => {
    const first = await applyCategoryTree(prisma);
    expect(first.every((s) => s.action === 'create')).toBe(true);
    expect(await prisma.category.count()).toBe(1 + 46);
    const second = await readCategoryTreePlan(prisma);
    expect(second.every((s) => s.action === 'keep')).toBe(true);
  });

  it('renames and re-parents existing rows in place', async () => {
    const root = await prisma.category.create({ data: { slug: 'petshop', name: 'Siêu thị của chó mèo' } });
    const old = await prisma.category.create({ data: { slug: 'cho', name: 'Cho chó', parentId: root.id } });
    const misplaced = await prisma.category.create({ data: { slug: 'hat-cho-cho', name: 'Hạt', parentId: root.id } });
    await applyCategoryTree(prisma);
    const cho = await prisma.category.findUniqueOrThrow({ where: { slug: 'cho' } });
    expect(cho.id).toBe(old.id);
    expect(cho.name).toBe('Chó');
    const hat = await prisma.category.findUniqueOrThrow({ where: { slug: 'hat-cho-cho' } });
    const group = await prisma.category.findUniqueOrThrow({ where: { slug: 'cho-thuc-an' } });
    expect(hat.id).toBe(misplaced.id);
    expect(hat.parentId).toBe(group.id);
  });
});
