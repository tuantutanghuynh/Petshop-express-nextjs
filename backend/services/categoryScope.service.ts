import prisma from './prisma';
import ApiError from '../utils/ApiError';
import { categorySubtreeIds } from '../utils/categoryTree';

// Ids a `categorySlug` filter covers: the category and every level below it. Used by the product,
// blog and gallery lists, so "Chó" lists the products filed under "Hạt cho chó" and the brand root
// lists the whole shop.
export async function categoryScopeIds(slug: string): Promise<string[]> {
  const category = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
  if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục');
  const all = await prisma.category.findMany({ select: { id: true, parentId: true } });
  return categorySubtreeIds(all, category.id);
}
