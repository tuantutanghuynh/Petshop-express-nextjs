import prisma from './prisma';
import ApiError from '../utils/ApiError';
import { categorySubtreeIds } from '../utils/categoryTree';

// Ids a `categorySlug` filter covers: the category and every level below it. Used by the product,
// blog and gallery lists, so "Chó" lists the products filed under "Hạt cho chó" and the brand root
// lists the whole shop. One query for the whole (small) tree, the category found in memory — the
// same trade as resolveBrand: one round trip, nothing cached.
export async function categoryScopeIds(slug: string): Promise<string[]> {
  const all = await prisma.category.findMany({ select: { id: true, slug: true, parentId: true } });
  const category = all.find((c) => c.slug === slug);
  if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục');
  return categorySubtreeIds(all, category.id);
}
