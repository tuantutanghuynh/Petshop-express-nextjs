import type { PrismaClient } from '@prisma/client';

// The petshop category tree (spec 2026-10-20): species → groups → leaves. Slugs are global
// (Category.slug is unique), so names shared by Chó and Mèo get a suffix. This file is data plus a
// pure planner; seedCategoryTree.ts prints the plan and only writes with --apply. It creates and
// updates by slug and never deletes, so it is safe to run on production.

export type TreeNode = { slug: string; name: string; children?: TreeNode[] };
export type PlannedCategory = { slug: string; name: string; parentSlug: string; sortOrder: number };
export type ExistingCategory = { slug: string; name: string; parentSlug: string | null; sortOrder: number };
export type PlanStep = { action: 'create' | 'update' | 'keep'; category: PlannedCategory };

export const ROOT_SLUG = 'petshop';
const ROOT_NAME = 'Siêu thị của chó mèo';

const leaves = (pairs: [string, string][]): TreeNode[] => pairs.map(([slug, name]) => ({ slug, name }));

export const CATEGORY_TREE: TreeNode[] = [
  {
    slug: 'cho', name: 'Chó', children: [
      { slug: 'cho-thuc-an', name: 'Thức ăn', children: leaves([
        ['hat-cho-cho', 'Hạt cho chó'], ['pate-cho-cho', 'Pate cho chó'], ['banh-thuong-cho-cho', 'Bánh thưởng'],
        ['thuc-an-cao-cap-cho-cho', 'Thức ăn cao cấp'], ['thuc-an-cho-cho-con', 'Thức ăn cho chó con'],
        ['thuc-an-thu-y-cho-cho', 'Thức ăn thú y'], ['sua-cho-cho-meo', 'Sữa cho chó mèo'],
      ]) },
      { slug: 'cho-do-choi', name: 'Đồ chơi', children: leaves([
        ['thu-nhoi-bong', 'Thú nhồi bông'], ['xuong-gam', 'Xương gặm'], ['banh-quy-gam', 'Bánh quy gặm'],
      ]) },
      { slug: 'cho-phu-kien-nha', name: 'Phụ kiện & nhà', children: leaves([
        ['vong-co-day-dat', 'Vòng cổ & dây dắt'], ['nem-chuong', 'Nệm & chuồng'],
        ['dung-cu-an-uong-cho-cho', 'Dụng cụ ăn uống'], ['ta-khay-ve-sinh', 'Tã & khay vệ sinh'],
      ]) },
      { slug: 'cho-ve-sinh-suc-khoe', name: 'Vệ sinh & sức khỏe', children: leaves([
        ['sua-tam-cho-cho', 'Sữa tắm cho chó'], ['tri-ve-ran-xo-giun', 'Trị ve rận & xổ giun'],
        ['ve-sinh-rang-mieng', 'Vệ sinh răng miệng'], ['ve-sinh-tai-mat-cho-cho', 'Vệ sinh tai mắt'],
        ['vitamin-bo-sung-cho-cho', 'Vitamin & bổ sung'],
      ]) },
    ],
  },
  {
    slug: 'meo', name: 'Mèo', children: [
      { slug: 'meo-thuc-an', name: 'Thức ăn', children: leaves([
        ['hat-cho-meo', 'Hạt cho mèo'], ['pate-cho-meo', 'Pate cho mèo'], ['banh-thuong-cho-meo', 'Bánh thưởng cho mèo'],
        ['sup-thuong-cho-meo', 'Súp thưởng cho mèo'], ['thuc-an-cho-meo-con', 'Thức ăn cho mèo con'],
        ['thuc-an-thu-y-cho-meo', 'Thức ăn thú y'],
      ]) },
      { slug: 'meo-do-choi-phu-kien', name: 'Đồ chơi & phụ kiện', children: leaves([
        ['do-choi-cho-meo', 'Đồ chơi cho mèo'], ['ban-cao-mong', 'Bàn cào móng'],
        ['balo-tui-van-chuyen', 'Balo & túi vận chuyển'], ['dung-cu-an-uong-cho-meo', 'Dụng cụ ăn uống'],
      ]) },
      { slug: 'meo-ve-sinh', name: 'Vệ sinh', children: leaves([
        ['sua-tam-cho-meo', 'Sữa tắm cho mèo'], ['ve-sinh-tai-mat-cho-meo', 'Vệ sinh tai mắt'], ['cham-soc-ve-sinh', 'Chăm sóc vệ sinh'],
      ]) },
      { slug: 'meo-cat-khay', name: 'Cát & khay vệ sinh', children: leaves([['cat-ve-sinh', 'Cát vệ sinh']]) },
      { slug: 'meo-suc-khoe', name: 'Sức khỏe', children: leaves([
        ['vitamin-bo-sung-cho-meo', 'Vitamin & bổ sung'], ['cham-soc-suc-khoe', 'Chăm sóc sức khỏe'],
      ]) },
    ],
  },
];

// Pre-order: every parent comes before its children, so writing in this order always finds the
// parent row already there.
export function flattenTree(rootSlug: string, nodes: TreeNode[]): PlannedCategory[] {
  return nodes.flatMap((node, i) => [
    { slug: node.slug, name: node.name, parentSlug: rootSlug, sortOrder: i },
    ...flattenTree(node.slug, node.children ?? []),
  ]);
}

export function planCategoryTree(existing: ExistingCategory[], wanted: PlannedCategory[]): PlanStep[] {
  const bySlug = new Map(existing.map((c) => [c.slug, c]));
  return wanted.map((category) => {
    const current = bySlug.get(category.slug);
    if (!current) return { action: 'create', category };
    const same = current.name === category.name && current.parentSlug === category.parentSlug && current.sortOrder === category.sortOrder;
    return { action: same ? 'keep' : 'update', category };
  });
}

async function readExisting(db: PrismaClient): Promise<ExistingCategory[]> {
  const rows = await db.category.findMany({ select: { id: true, slug: true, name: true, parentId: true, sortOrder: true } });
  const slugById = new Map(rows.map((r) => [r.id, r.slug]));
  return rows.map((r) => ({ slug: r.slug, name: r.name, sortOrder: r.sortOrder, parentSlug: r.parentId ? slugById.get(r.parentId) ?? null : null }));
}

export async function readCategoryTreePlan(db: PrismaClient): Promise<PlanStep[]> {
  return planCategoryTree(await readExisting(db), flattenTree(ROOT_SLUG, CATEGORY_TREE));
}

// Writes the plan in one transaction, parents before children (flattenTree order). The root is
// created when missing (a fresh database) and otherwise left exactly as it is.
export async function applyCategoryTree(db: PrismaClient): Promise<PlanStep[]> {
  const plan = await readCategoryTreePlan(db);
  await db.$transaction(async (tx) => {
    const root = await tx.category.upsert({ where: { slug: ROOT_SLUG }, create: { slug: ROOT_SLUG, name: ROOT_NAME }, update: {} });
    const idBySlug = new Map([[ROOT_SLUG, root.id]]);
    for (const { action, category: c } of plan) {
      const parentId = idBySlug.get(c.parentSlug);
      if (!parentId) throw new Error(`Category tree error: parent ${c.parentSlug} of ${c.slug} is missing`);
      const data = { name: c.name, parentId, sortOrder: c.sortOrder };
      const row = action === 'keep'
        ? await tx.category.findUniqueOrThrow({ where: { slug: c.slug }, select: { id: true } })
        : await tx.category.upsert({ where: { slug: c.slug }, create: { slug: c.slug, ...data }, update: data, select: { id: true } });
      idBySlug.set(c.slug, row.id);
    }
  });
  return plan;
}
