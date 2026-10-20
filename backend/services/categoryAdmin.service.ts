import type { Category } from '@prisma/client';
import prisma from './prisma';
import ApiError from '../utils/ApiError';
import { MAX_CATEGORY_DEPTH, categoryDepth, categorySubtreeIds, sameMembers, subtreeHeight } from '../utils/categoryTree';

// Category administration within one storefront (spec 2026-10-20 admin categories). `shopIds` is
// req.brand.categoryIds: the brand root first, then every category below it. The root itself and
// other storefronts' rows answer 404, so the admin cannot even learn they exist.
type Scope = { shopIds: string[] };
type Fields = { name?: string; slug?: string; description?: string | null; parentId?: string };

const notFound = () => new ApiError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục');
const rootOf = (s: Scope) => s.shopIds[0];
const links = () => prisma.category.findMany({ select: { id: true, parentId: true } });

function assertEditable(s: Scope, id: string) {
  if (id === rootOf(s) || !s.shopIds.includes(id)) throw notFound();
}

async function assertSlugFree(slug: string, ownId?: string) {
  const [used, redirect] = await Promise.all([
    prisma.category.findUnique({ where: { slug }, select: { id: true } }),
    prisma.categorySlugRedirect.findUnique({ where: { oldSlug: slug }, select: { categoryId: true } }),
  ]);
  if ((used && used.id !== ownId) || (redirect && redirect.categoryId !== ownId)) {
    throw new ApiError(409, 'SLUG_TAKEN', 'Slug này đang được dùng (hoặc là URL cũ của danh mục khác)');
  }
}

async function nextSortOrder(parentId: string): Promise<number> {
  const last = await prisma.category.aggregate({ where: { parentId }, _max: { sortOrder: true } });
  return (last._max.sortOrder ?? -1) + 1;
}

// Category has no `children` relation in the schema (only parentId), so the child count is taken
// from the listed rows themselves — the list is the whole shop tree.
export async function listShopCategories(s: Scope) {
  const rows = await prisma.category.findMany({
    where: { id: { in: s.shopIds } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true, blogPosts: true, galleryItems: true } } },
  });
  return rows.map((r) => ({ ...r, _count: { ...r._count, children: rows.filter((c) => c.parentId === r.id).length } }));
}

export async function createShopCategory(s: Scope, f: Required<Pick<Fields, 'name' | 'slug' | 'parentId'>> & Pick<Fields, 'description'>): Promise<Category> {
  if (!s.shopIds.includes(f.parentId)) throw notFound();
  const all = await links();
  if (categoryDepth(all, f.parentId, rootOf(s)) + 1 > MAX_CATEGORY_DEPTH) {
    throw new ApiError(409, 'CATEGORY_TOO_DEEP', `Danh mục chỉ được sâu tối đa ${MAX_CATEGORY_DEPTH} tầng`);
  }
  await assertSlugFree(f.slug);
  return prisma.category.create({
    data: { name: f.name, slug: f.slug, description: f.description || null, parentId: f.parentId, sortOrder: await nextSortOrder(f.parentId) },
  });
}

export async function updateShopCategory(s: Scope, id: string, f: Fields): Promise<Category> {
  assertEditable(s, id);
  const current = await prisma.category.findUniqueOrThrow({ where: { id } });
  const data: { name?: string; description?: string | null; parentId?: string; sortOrder?: number; slug?: string } = {};
  if (f.name !== undefined) data.name = f.name;
  if (f.description !== undefined) data.description = f.description || null;

  if (f.parentId !== undefined && f.parentId !== current.parentId) {
    if (!s.shopIds.includes(f.parentId)) throw notFound();
    const all = await links();
    if (categorySubtreeIds(all, id).includes(f.parentId)) {
      throw new ApiError(409, 'CATEGORY_CYCLE', 'Không thể chuyển danh mục vào chính nó hoặc danh mục con của nó');
    }
    if (categoryDepth(all, f.parentId, rootOf(s)) + 1 + subtreeHeight(all, id) > MAX_CATEGORY_DEPTH) {
      throw new ApiError(409, 'CATEGORY_TOO_DEEP', `Danh mục chỉ được sâu tối đa ${MAX_CATEGORY_DEPTH} tầng`);
    }
    data.parentId = f.parentId;
    data.sortOrder = await nextSortOrder(f.parentId);
  }

  if (f.slug === undefined || f.slug === current.slug) return prisma.category.update({ where: { id }, data });
  const newSlug = f.slug;
  await assertSlugFree(newSlug, id);
  // One transaction: the new slug, the old one kept as a redirect, and a redirect that pointed this
  // category's former slug back at it dropped when the owner returns to that slug.
  return prisma.$transaction(async (tx) => {
    await tx.categorySlugRedirect.deleteMany({ where: { oldSlug: newSlug, categoryId: id } });
    await tx.categorySlugRedirect.create({ data: { oldSlug: current.slug, categoryId: id } });
    return tx.category.update({ where: { id }, data: { ...data, slug: newSlug } });
  });
}

export async function deleteShopCategory(s: Scope, id: string): Promise<void> {
  assertEditable(s, id);
  const [counts, children] = await Promise.all([
    prisma.category.findUniqueOrThrow({ where: { id }, select: { _count: { select: { products: true, blogPosts: true, galleryItems: true } } } }),
    prisma.category.count({ where: { parentId: id } }),
  ]);
  const c = { children, ...counts._count };
  if (c.children + c.products + c.blogPosts + c.galleryItems > 0) {
    throw new ApiError(409, 'CATEGORY_NOT_EMPTY', 'Danh mục còn dữ liệu, chưa xoá được', c);
  }
  await prisma.$transaction([
    prisma.categoryAttribute.deleteMany({ where: { categoryId: id } }),
    prisma.category.delete({ where: { id } }), // slug redirects go with it (onDelete: Cascade)
  ]);
}

export async function reorderShopCategories(s: Scope, parentId: string, ids: string[]): Promise<void> {
  if (!s.shopIds.includes(parentId)) throw notFound();
  const siblings = await prisma.category.findMany({ where: { parentId }, select: { id: true } });
  if (!sameMembers(ids, siblings.map((c) => c.id))) {
    throw new ApiError(422, 'REORDER_MISMATCH', 'Danh sách sắp xếp không khớp các danh mục cùng cấp — tải lại trang rồi thử lại');
  }
  await prisma.$transaction(ids.map((id, index) => prisma.category.update({ where: { id }, data: { sortOrder: index } })));
}

export async function resolveCategorySlug(oldSlug: string): Promise<string> {
  const row = await prisma.categorySlugRedirect.findUnique({ where: { oldSlug }, select: { category: { select: { slug: true } } } });
  if (!row) throw notFound();
  return row.category.slug;
}
