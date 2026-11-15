# Category Tree + Mega Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 3-level petshop category tree (Chó/Mèo → groups → leaves) with a desktop mega menu, a mobile accordion menu, owner-editable banner + featured brands per menu, and brand filtering on category pages.

**Architecture:** Backend keeps the flat `GET /categories` (now with `sortOrder`) and resolves "category + every descendant" in memory from one `findMany` (tiny table). A data-driven seed script writes the tree to any DB (dry run by default). The frontend builds the tree with pure helpers, renders the mega menu server-side (links in HTML) with a small client component for open/close, and reads banner/brands from `mega_menu_<slug>` settings.

**Tech Stack:** Express 5 + Prisma 7.9.1 + PostgreSQL 15, express-validator, Vitest/supertest (+ testcontainers DB suite); Next.js 16.3.4 App Router, React 19, Tailwind v4.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-20-category-tree-mega-menu-design.md` (tree slugs/names and demo mapping are copied from it below).
- Migration is additive only (`sortOrder INTEGER NOT NULL DEFAULT 0`). Claude writes it; **the user runs it** on the dev DB (`npx prisma migrate deploy`). The DB test suite replays migrations in a throwaway container.
- `seed:category-tree` only creates/updates categories by slug, never deletes, never touches products; prints a plan and writes only with `--apply`.
- Demo-data scripts keep `assertLocalDatabase`.
- `brand` query: string, trimmed length 1–100, single value; otherwise 422 `VALIDATION_ERROR`. Match `equals` + `mode: 'insensitive'`.
- `mega_menu_<slug>` JSON: `{ banner: { image, title, href }, brands: [{ name, logo }] }`; ≤ 8 brands; name 1–60 chars; images https only; href via `isSafeHref`.
- `?thuong-hieu=` pages: `robots: { index: false, follow: true }`, canonical = category path.
- No `any`, no `eslint-disable`, no `!` non-null escapes added. Code/comments English, UI Vietnamese. Mobile rules: 44px targets, Vietnamese headings line-height ≥ 1.3, no `100vw`.
- Commits: short plain lines, no attribution, user approves before commit/push; never commit `docs/`, the PDF or the user's guide `.md` files.

---

### Task 1: Backend — `sortOrder` column and subtree category filter

**Files:**
- Modify: `backend/prisma/schema.prisma` (model Category)
- Create: `backend/prisma/migrations/20261020120000_add_category_sort_order/migration.sql`
- Create: `backend/utils/categoryTree.ts`
- Create: `backend/services/categoryScope.service.ts`
- Modify: `backend/controllers/category.controller.ts` (`list`)
- Modify: `backend/controllers/product.controller.ts` (`list`, `adminList`), `backend/controllers/blog.controller.ts` (2 places), `backend/controllers/gallery.controller.ts` (1 place)
- Test: `backend/test/categoryTree.test.ts` (DB-free), `backend/test/db/category.tree.test.ts` (DB suite)

**Interfaces:**
- Produces: `categorySubtreeIds(all: { id: string; parentId: string | null }[], rootId: string): string[]` (root first, breadth-first, cycle-safe); `categoryScopeIds(slug: string): Promise<string[]>` (throws `ApiError(404, 'CATEGORY_NOT_FOUND', …)`).

- [ ] **Step 1: Failing unit test**

```ts
// backend/test/categoryTree.test.ts
import { describe, expect, it } from 'vitest';
import { categorySubtreeIds } from '../utils/categoryTree';

// Category filters must reach every level below the chosen category (Chó → Thức ăn → Hạt cho chó),
// not just direct children, and a bad parentId loop must not hang the request.
const rows = [
  { id: 'root', parentId: null },
  { id: 'cho', parentId: 'root' },
  { id: 'cho-thuc-an', parentId: 'cho' },
  { id: 'hat-cho-cho', parentId: 'cho-thuc-an' },
  { id: 'meo', parentId: 'root' },
  { id: 'other', parentId: null },
];

describe('categorySubtreeIds', () => {
  it('returns the category and every descendant, root first', () => {
    expect(categorySubtreeIds(rows, 'cho')).toEqual(['cho', 'cho-thuc-an', 'hat-cho-cho']);
    expect(categorySubtreeIds(rows, 'root').sort()).toEqual(['cho', 'cho-thuc-an', 'hat-cho-cho', 'meo', 'root']);
  });

  it('returns just the id for a leaf', () => {
    expect(categorySubtreeIds(rows, 'hat-cho-cho')).toEqual(['hat-cho-cho']);
  });

  it('stops on a parent loop instead of running forever', () => {
    const loop = [{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }];
    expect(categorySubtreeIds(loop, 'a')).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `cd backend && npx vitest run test/categoryTree.test.ts` → cannot resolve `../utils/categoryTree`.

- [ ] **Step 3: Implement**

```ts
// backend/utils/categoryTree.ts
// Category plus all of its descendants. The table holds a few dozen rows, so the caller loads every
// (id, parentId) pair once and the walk happens in memory — simpler than a recursive SQL query and
// one round trip whatever the depth. `seen` guards against a parentId loop written by hand.
export function categorySubtreeIds(all: { id: string; parentId: string | null }[], rootId: string): string[] {
  const children = new Map<string, string[]>();
  for (const c of all) {
    if (c.parentId) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c.id]);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const queue = [rootId];
  for (let i = 0; i < queue.length; i += 1) {
    const id = queue[i];
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    queue.push(...(children.get(id) ?? []));
  }
  return out;
}
```

```ts
// backend/services/categoryScope.service.ts
import prisma from './prisma';
import ApiError from '../utils/ApiError';
import { categorySubtreeIds } from '../utils/categoryTree';

// Ids a `categorySlug` filter covers: the category and every level below it. Used by product, blog
// and gallery lists, so "Chó" lists the products filed under "Hạt cho chó" and the brand root
// lists the whole shop.
export async function categoryScopeIds(slug: string): Promise<string[]> {
  const category = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
  if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục');
  const all = await prisma.category.findMany({ select: { id: true, parentId: true } });
  return categorySubtreeIds(all, category.id);
}
```

Replace each of the 5 blocks of the form
```ts
const category = await prisma.category.findUnique({ where: { slug: categorySlug } });
if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', …);
const children = await prisma.category.findMany({ where: { parentId: category.id } });
const categoryIds = [category.id, ...children.map(…)];
where.categoryId = { in: categoryIds };
```
with `where.categoryId = { in: await categoryScopeIds(categorySlug) };` and update the comments that say "child categories" to "every descendant". Remove now-unused imports.

Schema + migration:
```prisma
// in model Category, after description:
  // Display order among siblings (menus, chips); ties fall back to the name.
  sortOrder    Int                 @default(0)
```
```sql
-- backend/prisma/migrations/20261020120000_add_category_sort_order/migration.sql
-- Display order among sibling categories. Additive: existing rows get 0. Rollback: drop the column.
ALTER TABLE "Category" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
```
`category.controller.ts` `list`: `findMany({ include: { attributes: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })`. Then `npx prisma generate`.

- [ ] **Step 4: Run unit test + typecheck** — `npx vitest run test/categoryTree.test.ts` PASS (3); `npm run typecheck` clean.

- [ ] **Step 5: DB test (grandchildren, ordering)**

```ts
// backend/test/db/category.tree.test.ts
import { describe, expect, it } from 'vitest';
import prisma from '../../services/prisma';
import { call } from './helpers/http';
import { createProduct } from './helpers/factories';

// Three levels under the brand root: a product filed on a leaf must show on the leaf, its group,
// its species and the brand root listing.
async function threeLevels() {
  const root = await prisma.category.create({ data: { slug: 'petshop', name: 'Shop' } });
  const cho = await prisma.category.create({ data: { slug: 'cho', name: 'Chó', parentId: root.id, sortOrder: 0 } });
  const group = await prisma.category.create({ data: { slug: 'cho-thuc-an', name: 'Thức ăn', parentId: cho.id } });
  const leaf = await prisma.category.create({ data: { slug: 'hat-cho-cho', name: 'Hạt cho chó', parentId: group.id } });
  await prisma.category.create({ data: { slug: 'meo', name: 'Mèo', parentId: root.id, sortOrder: 1 } });
  return { leaf };
}

describe('category subtree filter', () => {
  it('lists a leaf product at every ancestor level', async () => {
    const { leaf } = await threeLevels();
    await createProduct({ categoryId: leaf.id });
    for (const slug of ['hat-cho-cho', 'cho-thuc-an', 'cho', 'petshop']) {
      const res = await call('get', `/api/v1/products?categorySlug=${slug}`, { brand: null });
      expect(res.status, slug).toBe(200);
      expect(res.body.meta.total, slug).toBe(1);
    }
    const other = await call('get', '/api/v1/products?categorySlug=meo', { brand: null });
    expect(other.body.meta.total).toBe(0);
  });

  it('returns categories ordered by sortOrder', async () => {
    await threeLevels();
    await prisma.category.update({ where: { slug: 'cho' }, data: { sortOrder: 5 } });
    const res = await call('get', '/api/v1/categories', { brand: null });
    const species = res.body.data.filter((c: { slug: string }) => ['cho', 'meo'].includes(c.slug)).map((c: { slug: string }) => c.slug);
    expect(species).toEqual(['meo', 'cho']);
  });
});
```
Before writing, open `test/db/helpers/factories.ts` and use `createProduct`'s real signature (adapt the call if it takes other options); keep the assertions.

Run: `npm run test:db -- test/db/category.tree.test.ts` → PASS. Then `npm test` and `npm run test:db` → all green (existing `catalog.query` tests still pass).

---

### Task 2: Backend — `brand` filter on `GET /products`

**Files:**
- Modify: `backend/routes/product.route.ts` (public list validators)
- Modify: `backend/controllers/product.controller.ts` (`list`)
- Test: `backend/test/products.validation.test.ts` (DB-free), add a case to `backend/test/db/category.tree.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/products?brand=<name>` (combinable with `categorySlug`, `q`, `sort`).

- [ ] **Step 1: Failing test (validation runs before any query)**

```ts
// backend/test/products.validation.test.ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app';

// ?brand= reaches a database filter, so it is checked first: one string of 1–100 characters.
describe('GET /products brand filter validation', () => {
  it.each([
    ['too long', `brand=${'a'.repeat(101)}`],
    ['blank', 'brand=%20%20'],
    ['repeated', 'brand=a&brand=b'],
  ])('refuses a %s brand with 422', async (_label, query) => {
    const res = await request(app).get(`/api/v1/products?${query}`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run test/products.validation.test.ts` → status is not 422 (request reaches the DB-less controller).

- [ ] **Step 3: Implement**

In the public `router.get('/', [...])` validator list, after `sort`:
```ts
    query('brand')
      .optional()
      .custom((v) => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 100)
      .withMessage('Thương hiệu phải có từ 1 đến 100 ký tự'),
```
Update the comment above the route to mention `brand`. In `list`:
```ts
  const { categorySlug, q, sort, brand } = req.query;
  …
  // Featured brands in the mega menu link to "?brand=Royal Canin"; Product.brand is free text typed
  // by the owner, so the match ignores case.
  if (typeof brand === 'string') where.brand = { equals: brand.trim(), mode: 'insensitive' };
```

- [ ] **Step 4: Run** — test PASS; `npm run typecheck`.

- [ ] **Step 5: DB case** — in `category.tree.test.ts` add:
```ts
  it('filters by brand, ignoring case, within a category', async () => {
    const { leaf } = await threeLevels();
    await createProduct({ categoryId: leaf.id, brand: 'Royal Canin' });
    await createProduct({ categoryId: leaf.id, brand: 'Other' });
    const res = await call('get', '/api/v1/products?categorySlug=cho&brand=royal%20canin', { brand: null });
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].brand).toBe('Royal Canin');
  });
```
(If `createProduct` has no `brand` option, add one to the factory: pass it through to `prisma.product.create` data.) Run `npm run test:db -- test/db/category.tree.test.ts` → PASS.

---

### Task 3: Backend — category tree seed (production-safe)

**Files:**
- Create: `backend/scripts/categoryTree.ts` (data + pure plan + apply)
- Create: `backend/scripts/seedCategoryTree.ts` (CLI)
- Modify: `backend/package.json` (script `seed:category-tree`)
- Test: `backend/test/categoryTree.plan.test.ts` (DB-free), `backend/test/db/category.seed.test.ts`

**Interfaces:**
- Produces:
  - `CATEGORY_TREE: TreeNode[]`, `type TreeNode = { slug: string; name: string; children?: TreeNode[] }`
  - `type PlannedCategory = { slug: string; name: string; parentSlug: string; sortOrder: number }`
  - `flattenTree(rootSlug: string, nodes: TreeNode[]): PlannedCategory[]` (pre-order: parents before children)
  - `type ExistingCategory = { slug: string; name: string; parentSlug: string | null; sortOrder: number }`
  - `type PlanStep = { action: 'create' | 'update' | 'keep'; category: PlannedCategory }`
  - `planCategoryTree(existing: ExistingCategory[], wanted: PlannedCategory[]): PlanStep[]`
  - `applyCategoryTree(db: PrismaClient): Promise<PlanStep[]>` (root `petshop` created if missing)
  - `readCategoryTreePlan(db: PrismaClient): Promise<PlanStep[]>`

- [ ] **Step 1: Failing test**

```ts
// backend/test/categoryTree.plan.test.ts
import { describe, expect, it } from 'vitest';
import { CATEGORY_TREE, flattenTree, planCategoryTree } from '../scripts/categoryTree';

describe('category tree data', () => {
  const flat = flattenTree('petshop', CATEGORY_TREE);

  it('has Chó and Mèo first, with the groups and leaves of the spec', () => {
    expect(flat.slice(0, 2).map((c) => c.slug)).toEqual(['cho', 'cho-thuc-an']);
    expect(flat.filter((c) => c.parentSlug === 'petshop').map((c) => c.name)).toEqual(['Chó', 'Mèo']);
    expect(flat.filter((c) => c.parentSlug === 'cho').length).toBe(4);
    expect(flat.filter((c) => c.parentSlug === 'meo').length).toBe(5);
    expect(flat.length).toBe(2 + 9 + 35);
  });

  it('uses unique, URL-safe slugs and lists parents before children', () => {
    const slugs = flat.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]{1,80}$/);
    const seen = new Set(['petshop']);
    for (const c of flat) {
      expect(seen.has(c.parentSlug), c.slug).toBe(true);
      seen.add(c.slug);
    }
  });

  it('numbers siblings in listed order', () => {
    expect(flat.filter((c) => c.parentSlug === 'cho-thuc-an').map((c) => c.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('planCategoryTree', () => {
  const wanted = [
    { slug: 'cho', name: 'Chó', parentSlug: 'petshop', sortOrder: 0 },
    { slug: 'meo', name: 'Mèo', parentSlug: 'petshop', sortOrder: 1 },
    { slug: 'cho-thuc-an', name: 'Thức ăn', parentSlug: 'cho', sortOrder: 0 },
  ];

  it('creates what is missing, updates what differs, keeps the rest', () => {
    const plan = planCategoryTree(
      [
        { slug: 'cho', name: 'Cho chó', parentSlug: 'petshop', sortOrder: 0 },
        { slug: 'meo', name: 'Mèo', parentSlug: 'petshop', sortOrder: 1 },
      ],
      wanted,
    );
    expect(plan.map((s) => `${s.action}:${s.category.slug}`)).toEqual(['update:cho', 'keep:meo', 'create:cho-thuc-an']);
  });

  it('moves a category whose parent differs', () => {
    const plan = planCategoryTree([{ slug: 'cho-thuc-an', name: 'Thức ăn', parentSlug: 'petshop', sortOrder: 0 }], wanted);
    expect(plan.find((s) => s.category.slug === 'cho-thuc-an')?.action).toBe('update');
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run test/categoryTree.plan.test.ts` → cannot resolve module.

- [ ] **Step 3: Implement**

```ts
// backend/scripts/categoryTree.ts
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

// Writes the plan in one transaction, parents before children (flattenTree order).
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
```

```ts
// backend/scripts/seedCategoryTree.ts
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
    for (const step of plan) if (step.action !== 'keep') console.log(`${step.action.padEnd(6)} ${step.category.parentSlug} › ${step.category.slug} (${step.category.name})`);
    const count = (a: string) => plan.filter((s) => s.action === a).length;
    console.log(`${apply ? 'Applied' : 'Dry run'}: ${count('create')} create, ${count('update')} update, ${count('keep')} unchanged.${apply ? '' : ' Re-run with --apply to write.'}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
```
`package.json` scripts: `"seed:category-tree": "tsx scripts/seedCategoryTree.ts"`.

- [ ] **Step 4: Run** — plan test PASS; typecheck.

- [ ] **Step 5: DB test**

```ts
// backend/test/db/category.seed.test.ts
import { describe, expect, it } from 'vitest';
import prisma from '../../services/prisma';
import { applyCategoryTree, readCategoryTreePlan } from '../../scripts/categoryTree';

describe('applyCategoryTree', () => {
  it('creates the whole tree once and is a no-op the second time', async () => {
    const first = await applyCategoryTree(prisma);
    expect(first.every((s) => s.action === 'create')).toBe(true);
    expect(await prisma.category.count()).toBe(1 + 46);
    const second = await readCategoryTreePlan(prisma);
    expect(second.every((s) => s.action === 'keep')).toBe(true);
  });

  it('renames and re-parents existing rows without touching their products', async () => {
    const root = await prisma.category.create({ data: { slug: 'petshop', name: 'Siêu thị của chó mèo' } });
    const old = await prisma.category.create({ data: { slug: 'cho', name: 'Cho chó', parentId: root.id } });
    await applyCategoryTree(prisma);
    const cho = await prisma.category.findUniqueOrThrow({ where: { slug: 'cho' } });
    expect(cho.id).toBe(old.id);
    expect(cho.name).toBe('Chó');
  });
});
```
Run `npm run test:db -- test/db/category.seed.test.ts` → PASS.

---

### Task 4: Backend — move the local demo catalogue onto the tree

**Files:**
- Modify: `backend/scripts/petshopCatalog.ts`
- Create: `backend/scripts/migrateDemoCategories.ts`
- Modify: `backend/package.json` (`db:migrate-demo-categories`)
- Modify: `backend/test/db/seed.petshop.test.ts` (root children are now exactly Chó, Mèo — spec change)

**Interfaces:**
- Consumes: `applyCategoryTree` (Task 3).
- Produces: `OLD_DEMO_CATEGORY_SLUGS = ['thuc-an-hat', 'pate', 'phu-kien', 'suc-khoe']`, `attachDemoAttributes(db)`, `moveDemoProducts(db): Promise<number>`, `removeOldDemoCategories(db): Promise<string[]>`.

- [ ] **Step 1: Update the test first** — in `seed.petshop.test.ts` replace the `>= 5` children assertion with:
```ts
    const species = cats.body.data.filter((c: { parentId: string | null }) => c.parentId === root.id).map((c: { slug: string }) => c.slug);
    expect(species).toEqual(['cho', 'meo']);
```
and add:
```ts
  it('files demo products on tree leaves and keeps the food spec table', async () => {
    await seedPetshopCatalog(prisma);
    const hat = await prisma.product.findUniqueOrThrow({ where: { slug: 'hat-cho-cho-truong-thanh-vi-ga' }, include: { category: { include: { attributes: true } } } });
    expect(hat.category.slug).toBe('hat-cho-cho');
    expect(hat.category.attributes.map((a) => a.attributeKey).sort()).toEqual(['do_tuoi', 'khoi_luong', 'xuat_xu']);
    expect(await prisma.category.count({ where: { slug: { in: ['thuc-an-hat', 'pate', 'phu-kien', 'suc-khoe'] } } })).toBe(0);
  });
```
Run `npm run test:db -- test/db/seed.petshop.test.ts` → FAIL (5 flat children, product on `thuc-an-hat`).

- [ ] **Step 2: Implement in `petshopCatalog.ts`**
  - Delete `CATEGORIES`; keep `FOOD_ATTRS`.
  - Change each product's `category` to the spec mapping: `hat-cho-cho-truong-thanh-vi-ga→hat-cho-cho`, `hat-cho-meo-con→thuc-an-cho-meo-con`, `hat-cho-meo-truong-thanh→hat-cho-meo`, `pate-meo-ca-ngu→pate-cho-meo`, `pate-cho-vi-bo→pate-cho-cho`, `cat-ve-sinh-cho-meo-von-cuc→cat-ve-sinh`, `can-cau-do-choi-cho-meo→do-choi-cho-meo`, `bong-do-choi-tuong-tac-cho-cho→cho-do-choi`, `banh-thuong-cho-cho→banh-thuong-cho-cho`, `day-dat-vong-co-cho-cho→vong-co-day-dat`, `dem-ngu-em-cho-cho-meo→nem-chuong`, `sua-tam-cho-cho-meo→sua-tam-cho-cho`, `bo-cham-soc-long-5-mon→cho-ve-sinh-suc-khoe`.
  - Add:
```ts
// Food leaves that carry demo spec values (khoi_luong, do_tuoi, xuat_xu) — local demo data only.
const DEMO_FOOD_LEAVES = ['hat-cho-cho', 'hat-cho-meo', 'thuc-an-cho-meo-con', 'pate-cho-cho', 'pate-cho-meo'];
export const OLD_DEMO_CATEGORY_SLUGS = ['thuc-an-hat', 'pate', 'phu-kien', 'suc-khoe'];

export async function attachDemoAttributes(db: PrismaClient): Promise<void> {
  for (const slug of DEMO_FOOD_LEAVES) {
    const cat = await db.category.findUniqueOrThrow({ where: { slug }, select: { id: true } });
    for (const a of FOOD_ATTRS) {
      const exists = await db.categoryAttribute.findFirst({ where: { categoryId: cat.id, attributeKey: a.key } });
      if (!exists) await db.categoryAttribute.create({ data: { categoryId: cat.id, attributeKey: a.key, attributeLabel: a.label, attributeType: 'text' } });
    }
  }
}

// Existing local databases still hold demo products on the old flat categories.
export async function moveDemoProducts(db: PrismaClient): Promise<number> {
  let moved = 0;
  for (const p of PRODUCTS) {
    const cat = await db.category.findUniqueOrThrow({ where: { slug: p.category }, select: { id: true } });
    const { count } = await db.product.updateMany({ where: { slug: p.slug, categoryId: { not: cat.id } }, data: { categoryId: cat.id } });
    moved += count;
  }
  return moved;
}

// Deletes an old flat category only when nothing points at it any more; reports what it removed.
export async function removeOldDemoCategories(db: PrismaClient): Promise<string[]> {
  const removed: string[] = [];
  for (const slug of OLD_DEMO_CATEGORY_SLUGS) {
    const cat = await db.category.findUnique({ where: { slug }, select: { id: true, _count: { select: { products: true, blogPosts: true, galleryItems: true } } } });
    if (!cat || cat._count.products + cat._count.blogPosts + cat._count.galleryItems > 0) continue;
    await db.$transaction([db.categoryAttribute.deleteMany({ where: { categoryId: cat.id } }), db.category.delete({ where: { id: cat.id } })]);
    removed.push(slug);
  }
  return removed;
}
```
  - In `seedPetshopCatalog`: replace the root/categories block with `await applyCategoryTree(db); await attachDemoAttributes(db);` and build `categoryIds` from `db.category.findMany({ where: { slug: { in: [...new Set(PRODUCTS.map((p) => p.category))] } } })`; after the product loop call `await moveDemoProducts(db); await removeOldDemoCategories(db);`. Update the header comment (categories now come from the tree).

```ts
// backend/scripts/migrateDemoCategories.ts
import { assertLocalDatabase } from './localDbGuard';

// One-off for an existing LOCAL database seeded before the category tree: builds the tree, moves the
// demo products onto their leaves and deletes the four old flat demo categories once empty.
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
```
`package.json`: `"db:migrate-demo-categories": "tsx scripts/migrateDemoCategories.ts"`.

- [ ] **Step 3: Run** — `npm run test:db -- test/db/seed.petshop.test.ts` PASS; `npm test`, `npm run test:db`, `npm run typecheck` all green.

- [ ] **Step 4: Pause for the user** — ask them to run on the dev DB (Claude does not run migrations):
```bash
cd backend && npx prisma migrate deploy && npm run db:migrate-demo-categories && npm run seed:category-tree
```
Expected: migration applied; "Moved 13 demo products; removed categories: thuc-an-hat, pate, phu-kien, suc-khoe."; dry run "0 create, 0 update, 46 unchanged". Then restart the backend task.

---

### Task 5: Frontend — tree helpers, catalogue service, brand URL param

**Files:**
- Create: `frontend-petshop/lib/categoryTree.ts`
- Modify: `frontend-petshop/lib/types.ts` (`Category.sortOrder?: number`)
- Modify: `frontend-petshop/lib/catalogParams.ts` (`listHref` brand, `parseBrandParam`)
- Modify: `frontend-petshop/services/catalog.ts`
- Modify: `frontend-petshop/app/sitemap.ts`
- Test: `frontend-petshop/test/categoryTree.test.ts`, `frontend-petshop/test/catalogParams.test.ts` (add cases)

**Interfaces:**
- Produces:
  - `type CategoryNode = Category & { children: CategoryNode[] }`
  - `buildCategoryTree(all: Category[], rootSlug: string): CategoryNode[]`
  - `flattenTree(nodes: CategoryNode[]): CategoryNode[]`
  - `categoryTrail(nodes: CategoryNode[], slug: string): CategoryNode[]`
  - `listHref(base, { …, brand?: string })` → `thuong-hieu=`; `parseBrandParam(raw): string | undefined | null`
  - services: `getShopCategoryTree(): Promise<CategoryNode[]>`, `getShopCategories()` (= top level of the tree), `getShopCategory(slug): Promise<CategoryNode | null>` (any depth), `getCategoryTrail(slug): Promise<CategoryNode[]>`, `getCategoryProducts(slug, page, sort?, brand?)`.

- [ ] **Step 1: Failing tests**

```ts
// frontend-petshop/test/categoryTree.test.ts
import { describe, expect, it } from 'vitest';
import { buildCategoryTree, categoryTrail, flattenTree } from '../lib/categoryTree';
import type { Category } from '../lib/types';

// The shop's categories form a tree under the brand root (Chó → Thức ăn → Hạt cho chó). Menus,
// breadcrumbs and the sitemap all read it; other storefronts in the same table stay out.
const cat = (id: string, parentId: string | null, sortOrder = 0, name = id): Category => ({ id, parentId, slug: id, name, description: null, sortOrder });
const all = [
  cat('petshop', null), cat('gom-su', null), cat('gom-child', 'gom-su'),
  cat('meo', 'petshop', 1), cat('cho', 'petshop', 0),
  cat('cho-thuc-an', 'cho'), cat('hat-cho-cho', 'cho-thuc-an', 1), cat('pate-cho-cho', 'cho-thuc-an', 0),
];

describe('buildCategoryTree', () => {
  const tree = buildCategoryTree(all, 'petshop');

  it('nests children under their parents in sortOrder', () => {
    expect(tree.map((n) => n.slug)).toEqual(['cho', 'meo']);
    expect(tree[0].children[0].children.map((n) => n.slug)).toEqual(['pate-cho-cho', 'hat-cho-cho']);
  });

  it('leaves other storefronts out and returns [] for an unknown root', () => {
    expect(flattenTree(tree).some((n) => n.slug.startsWith('gom'))).toBe(false);
    expect(buildCategoryTree(all, 'nope')).toEqual([]);
  });
});

describe('flattenTree / categoryTrail', () => {
  const tree = buildCategoryTree(all, 'petshop');

  it('lists every node, parents first', () => {
    expect(flattenTree(tree).map((n) => n.slug)).toEqual(['cho', 'cho-thuc-an', 'pate-cho-cho', 'hat-cho-cho', 'meo']);
  });

  it('gives the path from the species down to the category', () => {
    expect(categoryTrail(tree, 'hat-cho-cho').map((n) => n.slug)).toEqual(['cho', 'cho-thuc-an', 'hat-cho-cho']);
    expect(categoryTrail(tree, 'meo').map((n) => n.slug)).toEqual(['meo']);
    expect(categoryTrail(tree, 'gom-child')).toEqual([]);
  });
});
```
Add to `test/catalogParams.test.ts`:
```ts
describe('brand filter param', () => {
  it('writes the brand as thuong-hieu and keeps it with sort and page', () => {
    expect(listHref('/danh-muc/cho', { brand: 'Royal Canin', sort: 'price', page: 2 })).toBe('/danh-muc/cho?thuong-hieu=Royal+Canin&sort=price&page=2');
  });
  it('parses a usable brand, refuses junk', () => {
    expect(parseBrandParam(undefined)).toBeUndefined();
    expect(parseBrandParam('')).toBeUndefined();
    expect(parseBrandParam('  Royal Canin ')).toBe('Royal Canin');
    expect(parseBrandParam(['a', 'b'])).toBeNull();
    expect(parseBrandParam('x'.repeat(101))).toBeNull();
  });
});
```
(import `parseBrandParam` at the top of that file.)

- [ ] **Step 2: Run, expect FAIL** — `cd frontend-petshop && npx vitest run test/categoryTree.test.ts test/catalogParams.test.ts`.

- [ ] **Step 3: Implement**

```ts
// frontend-petshop/lib/categoryTree.ts
import type { Category } from './types';

// The shop's categories as a tree under the brand root (test/categoryTree.test.ts). GET /categories
// returns every storefront's rows flat; this keeps only our branch, nested and in sortOrder.
export type CategoryNode = Category & { children: CategoryNode[] };

const order = (a: Category, b: Category) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'vi');

export function buildCategoryTree(all: Category[], rootSlug: string): CategoryNode[] {
  const root = all.find((c) => c.parentId === null && c.slug === rootSlug);
  if (!root) return [];
  // Each row has one parent, so a walk down from the root can never meet a loop.
  const build = (parentId: string): CategoryNode[] =>
    all.filter((c) => c.parentId === parentId).sort(order).map((c) => ({ ...c, children: build(c.id) }));
  return build(root.id);
}

export function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

// Species → … → the category itself, for breadcrumbs; [] when the slug is not in the tree.
export function categoryTrail(nodes: CategoryNode[], slug: string): CategoryNode[] {
  for (const n of nodes) {
    if (n.slug === slug) return [n];
    const below = categoryTrail(n.children, slug);
    if (below.length > 0) return [n, ...below];
  }
  return [];
}
```
`lib/types.ts` Category: add `// Order among siblings (GET /categories sorts by it).` `sortOrder?: number;`

`lib/catalogParams.ts`: `listHref` state gains `brand?: string`; set `if (state.brand) params.set('thuong-hieu', state.brand);` right after `danh-muc` (before sort). Add:
```ts
// ?thuong-hieu=<name> on category pages (featured brands in the mega menu). Same limits as the API.
export function parseBrandParam(raw: string | string[] | undefined): string | undefined | null {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string') return null;
  const brand = raw.trim();
  return brand.length >= 1 && brand.length <= 100 ? brand : null;
}
```

`services/catalog.ts`:
- `listProducts` options gain `brand?: string` → `if (options.brand) params.set('brand', options.brand);`; fix its comment ("includes every descendant").
- `getCategoryProducts(categorySlug, page, sort = DEFAULT_SORT, brand?: string)` passes `{ sort, brand }`.
- Replace `shopChildren`/`getShopCategories`/`getShopCategory` with:
```ts
// The shop's category tree (children of the brand root, nested).
export async function getShopCategoryTree(): Promise<CategoryNode[]> {
  return buildCategoryTree(await getAllCategories(), BRAND_SLUG);
}

// Top level of the tree (Chó, Mèo): header search select, footer, homepage circles.
export async function getShopCategories(): Promise<CategoryNode[]> {
  return getShopCategoryTree();
}

// A category page exists for any category in our tree, at any depth. Other storefronts' slugs
// (legacy pottery brand) answer 404 here rather than render under our name.
export async function getShopCategory(slug: string): Promise<CategoryNode | null> {
  return flattenTree(await getShopCategoryTree()).find((c) => c.slug === slug) ?? null;
}

export async function getCategoryTrail(slug: string): Promise<CategoryNode[]> {
  return categoryTrail(await getShopCategoryTree(), slug);
}

// Every category of the shop, for the sitemap.
export async function getShopCategoryList(): Promise<CategoryNode[]> {
  return flattenTree(await getShopCategoryTree());
}
```
- `getShopProduct`: `const isOurs = (await getShopCategoryList()).some((c) => c.id === product.category.id);`
- `app/sitemap.ts`: use `getShopCategoryList()` instead of `getShopCategories()`.

- [ ] **Step 4: Run** — tests PASS; `npm run typecheck`; `npm test` all green.

---

### Task 6: Frontend — mega menu settings (parser + admin form)

**Files:**
- Create: `frontend-petshop/lib/megaMenu.ts`
- Modify: `frontend-petshop/lib/adminSettings.ts`
- Modify: `frontend-petshop/services/content.ts` (`getMegaMenus`)
- Modify: `frontend-petshop/components/layout/navLinks.ts` (`FEATURED_CATEGORY_SLUGS` re-uses `MEGA_MENU_SLUGS`)
- Create: `frontend-petshop/components/admin/settings/MegaMenuFields.tsx`
- Modify: `frontend-petshop/components/admin/settings/SettingsEditor.tsx`
- Test: `frontend-petshop/test/megaMenu.test.ts`, `frontend-petshop/test/adminSettings.test.ts` (add cases)

**Interfaces:**
- Produces:
  - `MEGA_MENU_SLUGS = ['cho', 'meo']`, `MAX_MENU_BRANDS = 8`, `megaMenuKey(slug: string): string`
  - `type MegaMenuExtras = { banner: { image: string; title: string; href: string | null } | null; brands: { name: string; logo: string | null }[] }`
  - `parseMegaMenu(raw: string | undefined): MegaMenuExtras`
  - `getMegaMenus(): Promise<Record<string, MegaMenuExtras>>` (fails soft to `{}`)
  - `SettingsForm.megaMenus: Record<string, MegaMenuForm>`, `type MegaMenuForm = { bannerImage: string; bannerTitle: string; bannerHref: string; brands: { name: string; logo: string }[] }` (always `MAX_MENU_BRANDS` rows)

- [ ] **Step 1: Failing tests**

```ts
// frontend-petshop/test/megaMenu.test.ts
import { describe, expect, it } from 'vitest';
import { MAX_MENU_BRANDS, megaMenuKey, parseMegaMenu } from '../lib/megaMenu';

// Banner and featured brands of the Chó / Mèo mega menus come from /admin/cau-hinh. Whatever is
// stored, the menu never shows a non-https image or an unsafe link, and never breaks.
describe('parseMegaMenu', () => {
  it('reads a banner and brands', () => {
    const raw = JSON.stringify({
      banner: { image: 'https://res.cloudinary.com/x/b.jpg', title: 'Mua sắm cho cún', href: '/danh-muc/cho' },
      brands: [{ name: ' Royal Canin ', logo: 'https://res.cloudinary.com/x/rc.png' }, { name: 'Pedigree' }],
    });
    expect(parseMegaMenu(raw)).toEqual({
      banner: { image: 'https://res.cloudinary.com/x/b.jpg', title: 'Mua sắm cho cún', href: '/danh-muc/cho' },
      brands: [{ name: 'Royal Canin', logo: 'https://res.cloudinary.com/x/rc.png' }, { name: 'Pedigree', logo: null }],
    });
  });

  it('falls back to nothing for missing or malformed values', () => {
    expect(parseMegaMenu(undefined)).toEqual({ banner: null, brands: [] });
    expect(parseMegaMenu('{oops')).toEqual({ banner: null, brands: [] });
    expect(parseMegaMenu('[]')).toEqual({ banner: null, brands: [] });
  });

  it('drops unsafe parts but keeps the rest', () => {
    const raw = JSON.stringify({
      banner: { image: 'http://insecure/b.jpg', href: '/x' },
      brands: [{ name: '', logo: 'https://a/l.png' }, { name: 'A', logo: 'javascript:alert(1)' }, { name: 'x'.repeat(61) }],
    });
    expect(parseMegaMenu(raw)).toEqual({ banner: null, brands: [{ name: 'A', logo: null }] });
    const badHref = parseMegaMenu(JSON.stringify({ banner: { image: 'https://a/b.jpg', href: 'javascript:alert(1)' } }));
    expect(badHref.banner?.href).toBeNull();
  });

  it(`keeps at most ${MAX_MENU_BRANDS} brands`, () => {
    const raw = JSON.stringify({ brands: Array.from({ length: 12 }, (_, i) => ({ name: `B${i}` })) });
    expect(parseMegaMenu(raw).brands).toHaveLength(MAX_MENU_BRANDS);
  });

  it('names the setting after the species slug', () => {
    expect(megaMenuKey('cho')).toBe('mega_menu_cho');
  });
});
```
Add to `test/adminSettings.test.ts` (reuse its existing helper that builds a valid form — read the file first and use the same pattern):
```ts
describe('mega menu settings', () => {
  it('round-trips banner and brands, dropping empty brand rows', () => {
    const form = settingsToForm({ mega_menu_cho: JSON.stringify({ banner: { image: 'https://a/b.jpg', title: 'T', href: '/danh-muc/cho' }, brands: [{ name: 'A', logo: 'https://a/l.png' }] }) });
    expect(form.megaMenus.cho.brands).toHaveLength(8);
    const { settings, errors } = formToSettings(form);
    expect(errors).toEqual({});
    expect(JSON.parse(settings.mega_menu_cho)).toEqual({ banner: { image: 'https://a/b.jpg', title: 'T', href: '/danh-muc/cho' }, brands: [{ name: 'A', logo: 'https://a/l.png' }] });
    expect(settings.mega_menu_meo).toBe('');
  });

  it('flags a logo without a name, a non-https image and an unsafe link', () => {
    const form = settingsToForm({});
    form.megaMenus.cho.brands[0] = { name: '', logo: 'https://a/l.png' };
    form.megaMenus.cho.bannerImage = 'http://a/b.jpg';
    form.megaMenus.cho.bannerHref = 'javascript:alert(1)';
    const { errors } = formToSettings(form);
    expect(errors['megaMenus.cho.brands.0.name']).toBeTruthy();
    expect(errors['megaMenus.cho.bannerImage']).toBeTruthy();
    expect(errors['megaMenus.cho.bannerHref']).toBeTruthy();
  });

  it('asks for an image when banner text is filled', () => {
    const form = settingsToForm({});
    form.megaMenus.meo.bannerTitle = 'Mèo yêu';
    expect(formToSettings(form).errors['megaMenus.meo.bannerImage']).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run test/megaMenu.test.ts test/adminSettings.test.ts`.

- [ ] **Step 3: Implement**

```ts
// frontend-petshop/lib/megaMenu.ts
import { isSafeHref } from './storefront';

// Banner and featured brands of the Chó / Mèo mega menus, edited in /admin/cau-hinh and stored as
// JSON in mega_menu_<species slug> (test/megaMenu.test.ts). Anything unusable is dropped: the menu
// still shows the category tree.
export const MEGA_MENU_SLUGS = ['cho', 'meo'];
export const MAX_MENU_BRANDS = 8;
export const MAX_BRAND_NAME = 60;

export type MegaMenuBanner = { image: string; title: string; href: string | null };
export type MegaMenuBrand = { name: string; logo: string | null };
export type MegaMenuExtras = { banner: MegaMenuBanner | null; brands: MegaMenuBrand[] };

export const megaMenuKey = (slug: string) => `mega_menu_${slug}`;

const EMPTY: MegaMenuExtras = { banner: null, brands: [] };
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const https = (v: unknown) => (str(v).startsWith('https://') ? str(v) : null);

export function parseMegaMenu(raw: string | undefined): MegaMenuExtras {
  let value: unknown;
  try {
    value = raw ? JSON.parse(raw) : undefined;
  } catch {
    return EMPTY; // malformed setting = not set
  }
  if (!isObject(value)) return EMPTY;

  const b = isObject(value.banner) ? value.banner : {};
  const image = https(b.image);
  const href = str(b.href);
  const banner = image ? { image, title: str(b.title).slice(0, 80), href: href && isSafeHref(href) ? href : null } : null;

  const brands = (Array.isArray(value.brands) ? value.brands : [])
    .filter(isObject)
    .map((x) => ({ name: str(x.name), logo: https(x.logo) }))
    .filter((x) => x.name.length > 0 && x.name.length <= MAX_BRAND_NAME)
    .slice(0, MAX_MENU_BRANDS);
  return { banner, brands };
}
```
`components/layout/navLinks.ts`: replace the literal with
```ts
import { MEGA_MENU_SLUGS } from '../../lib/megaMenu';
// Species with a mega menu, in menu order (wireframe / clip: "Chó", "Mèo").
export const FEATURED_CATEGORY_SLUGS = MEGA_MENU_SLUGS;
```
`services/content.ts`:
```ts
// Banner and brands for each species mega menu. The menu also works without them, so a failure
// logs and returns nothing instead of breaking the layout.
export async function getMegaMenus(): Promise<Record<string, MegaMenuExtras>> {
  try {
    const s = await getSettings(MEGA_MENU_SLUGS.map(megaMenuKey));
    return Object.fromEntries(MEGA_MENU_SLUGS.map((slug) => [slug, parseMegaMenu(s[megaMenuKey(slug)])]));
  } catch (err) {
    console.error('getMegaMenus: could not load menu settings', err);
    return {};
  }
}
```
`lib/adminSettings.ts`:
```ts
export type MegaMenuForm = { bannerImage: string; bannerTitle: string; bannerHref: string; brands: { name: string; logo: string }[] };

function readMegaMenu(raw: string | undefined): MegaMenuForm {
  const m = parseMegaMenu(raw);
  return {
    bannerImage: m.banner?.image ?? '', bannerTitle: m.banner?.title ?? '', bannerHref: m.banner?.href ?? '',
    brands: Array.from({ length: MAX_MENU_BRANDS }, (_, i) => ({ name: m.brands[i]?.name ?? '', logo: m.brands[i]?.logo ?? '' })),
  };
}

function writeMegaMenu(slug: string, f: MegaMenuForm, errors: FieldErrors): string {
  const at = (k: string) => `megaMenus.${slug}.${k}`;
  const image = f.bannerImage.trim(), title = f.bannerTitle.trim(), href = f.bannerHref.trim();
  if (image && !isHttps(image)) errors[at('bannerImage')] = 'Ảnh phải là link https://';
  if (!image && (title || href)) errors[at('bannerImage')] = 'Chọn ảnh banner (hoặc xoá tiêu đề và link)';
  if (href && !isSafeHref(href)) errors[at('bannerHref')] = 'Link phải bắt đầu bằng / hoặc https://';
  const brands = f.brands.flatMap((b, i) => {
    const name = b.name.trim(), logo = b.logo.trim();
    if (!name && !logo) return [];
    if (!name) errors[at(`brands.${i}.name`)] = 'Nhập tên thương hiệu';
    else if (name.length > MAX_BRAND_NAME) errors[at(`brands.${i}.name`)] = `Tối đa ${MAX_BRAND_NAME} ký tự`;
    if (logo && !isHttps(logo)) errors[at(`brands.${i}.logo`)] = 'Ảnh phải là link https://';
    return [{ name, ...(logo && { logo }) }];
  });
  if (!image && brands.length === 0) return '';
  return JSON.stringify({ ...(image && { banner: { image, ...(title && { title }), ...(href && { href }) } }), brands });
}
```
Wire it: `ADMIN_SETTING_KEYS` += `...MEGA_MENU_SLUGS.map(megaMenuKey)`; `SettingsForm.megaMenus: Record<string, MegaMenuForm>`; `settingsToForm` → `megaMenus: Object.fromEntries(MEGA_MENU_SLUGS.map((slug) => [slug, readMegaMenu(s[megaMenuKey(slug)])]))`; `formToSettings` → `for (const slug of MEGA_MENU_SLUGS) settings[megaMenuKey(slug)] = writeMegaMenu(slug, f.megaMenus[slug], errors);`. Note: `isHttps` is declared below `settingsToForm` in the file; place `writeMegaMenu` after it.

```tsx
// frontend-petshop/components/admin/settings/MegaMenuFields.tsx
'use client';

import type { MegaMenuForm } from '../../../lib/adminSettings';
import type { FieldErrors } from '../../../lib/forms';
import { TextField } from '../../ui/TextField';
import { ImageField } from './ImageField';

type Props = { slug: string; label: string; value: MegaMenuForm; errors: FieldErrors; onChange: (next: MegaMenuForm) => void };

// One species menu: banner on the right of the panel and up to 8 featured brands. Input names
// mirror the error keys (megaMenus.cho.brands.0.name → megaMenus-cho-brands-0-name).
export function MegaMenuFields({ slug, label, value, errors, onChange }: Props) {
  const p = `megaMenus-${slug}`;
  const err = (k: string) => errors[`megaMenus.${slug}.${k}`];
  const setBrand = (i: number, patch: Partial<MegaMenuForm['brands'][number]>) =>
    onChange({ ...value, brands: value.brands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  return (
    <fieldset className="flex flex-col gap-3 rounded-card border border-line p-4">
      <legend className="px-1 font-bold text-ink">Menu {label}</legend>
      <div className="grid gap-3 md:grid-cols-2">
        <TextField name={`${p}-bannerTitle`} label="Tiêu đề banner" value={value.bannerTitle} onChange={(e) => onChange({ ...value, bannerTitle: e.target.value })} />
        <TextField name={`${p}-bannerHref`} label="Link banner" placeholder={`/danh-muc/${slug}`} value={value.bannerHref} error={err('bannerHref')}
          onChange={(e) => onChange({ ...value, bannerHref: e.target.value })} />
      </div>
      <ImageField id={`${p}-bannerImage`} label="Ảnh banner (dọc, khoảng 2:3)" value={value.bannerImage} error={err('bannerImage')}
        onChange={(v) => onChange({ ...value, bannerImage: v })} />
      <b className="mt-2 text-sm text-ink">Thương hiệu nổi bật (bấm vào sẽ lọc sản phẩm theo đúng tên này)</b>
      <ol className="grid gap-4 md:grid-cols-2">
        {value.brands.map((b, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-card bg-surface-alt p-3">
            <TextField name={`${p}-brands-${i}-name`} label={`Thương hiệu ${i + 1}`} maxLength={60} value={b.name} error={err(`brands.${i}.name`)}
              onChange={(e) => setBrand(i, { name: e.target.value })} />
            <ImageField id={`${p}-brands-${i}-logo`} label="Logo" value={b.logo} error={err(`brands.${i}.logo`)} onChange={(v) => setBrand(i, { logo: v })} />
          </li>
        ))}
      </ol>
    </fieldset>
  );
}
```
`SettingsEditor.tsx`: after the "Ảnh danh mục" section add
```tsx
      <Section title="Menu Chó / Mèo" hint="Banner bên phải và thương hiệu nổi bật trong menu xổ xuống. Tên thương hiệu phải viết giống ô “Thương hiệu” của sản phẩm.">
        {MEGA_MENU_SLUGS.map((slug) => (
          <MegaMenuFields key={slug} slug={slug} label={categories.find((c) => c.slug === slug)?.name ?? slug} value={form.megaMenus[slug]} errors={errors}
            onChange={(next) => update({ ...form, megaMenus: { ...form.megaMenus, [slug]: next } })} />
        ))}
      </Section>
```
(imports: `MegaMenuFields`, `MEGA_MENU_SLUGS`).

- [ ] **Step 4: Run** — tests PASS; `npm run lint && npm run typecheck && npm test`.

---

### Task 7: Frontend — desktop mega menu, category dropdown, mobile accordion

**Files:**
- Create: `frontend-petshop/components/layout/MegaMenu.tsx` (client: open/close)
- Create: `frontend-petshop/components/layout/MegaMenuPanel.tsx` (markup, no hooks)
- Modify: `frontend-petshop/components/layout/SiteHeader.tsx`, `CategoryMenu.tsx`, `MobileMenu.tsx`
- Modify: `frontend-petshop/app/layout.tsx`

**Interfaces:**
- Consumes: `CategoryNode` (Task 5), `MegaMenuExtras`, `getMegaMenus` (Task 6), `listHref` brand (Task 5).
- Produces: `SiteHeader` props `{ phone?: string; announcements: string[] | null; categories: CategoryNode[]; megaMenus: Record<string, MegaMenuExtras> }`.

- [ ] **Step 1: Panel markup**

```tsx
// frontend-petshop/components/layout/MegaMenuPanel.tsx
import Image from 'next/image';
import Link from 'next/link';
import type { CategoryNode } from '../../lib/categoryTree';
import { listHref } from '../../lib/catalogParams';
import type { MegaMenuExtras } from '../../lib/megaMenu';
import { categoryPath } from '../../lib/seo/structuredData';

// Contents of one species menu (clip: paddy.vn "Chó"): a column per group with its leaves, featured
// brands below, the owner's banner on the right. Plain links, rendered on the server.
export function MegaMenuPanel({ node, extras }: { node: CategoryNode; extras: MegaMenuExtras }) {
  const speciesPath = categoryPath(node.slug);
  return (
    <div className="mx-auto grid max-w-[1200px] gap-6 px-6 py-6 lg:grid-cols-[1fr_220px]">
      <div className="min-w-0">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-6 gap-y-5">
          {node.children.map((group) => (
            <div key={group.id} className="min-w-0">
              <Link href={categoryPath(group.slug)} className="block py-1 text-sm leading-[1.4] font-extrabold tracking-wide text-ink uppercase hover:text-brand-ink">{group.name}</Link>
              <ul className="mt-1">
                {group.children.map((leaf) => (
                  <li key={leaf.id}><Link href={categoryPath(leaf.slug)} className="flex min-h-9 items-center text-sm text-muted hover:text-brand-ink">{leaf.name}</Link></li>
                ))}
              </ul>
              <Link href={categoryPath(group.slug)} className="mt-1 inline-flex min-h-9 items-center text-sm font-bold text-brand-ink">Xem tất cả {group.name} →</Link>
            </div>
          ))}
        </div>
        {extras.brands.length > 0 && (
          <div className="mt-6 border-t border-line pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <b className="text-sm text-ink">Thương hiệu nổi bật</b>
              <Link href={speciesPath} className="inline-flex min-h-9 items-center text-sm font-bold text-brand-ink">Xem tất cả →</Link>
            </div>
            <ul className="grid grid-cols-4 gap-3">
              {extras.brands.map((b) => (
                <li key={b.name}>
                  <Link href={listHref(speciesPath, { brand: b.name })} className="grid h-16 place-items-center rounded-card border border-line bg-surface px-3 text-center text-sm font-bold text-ink hover:border-brand-ink">
                    {b.logo ? <Image src={b.logo} alt={b.name} width={120} height={48} className="max-h-12 w-auto object-contain" /> : b.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {extras.banner && (
        <Link href={extras.banner.href ?? speciesPath} className="relative hidden min-h-80 overflow-hidden rounded-card bg-surface-alt lg:block">
          <Image src={extras.banner.image} alt={extras.banner.title || node.name} fill sizes="220px" className="object-cover" />
          {extras.banner.title && <span className="absolute inset-x-0 bottom-0 bg-ink/60 p-3 text-sm leading-[1.4] font-bold text-white">{extras.banner.title}</span>}
        </Link>
      )}
    </div>
  );
}
```
Before using `next/image` with uploaded URLs, check `next.config.ts` `images.remotePatterns` covers the Cloudinary host (it does for ImageField/promos; confirm, do not add hosts without asking).

- [ ] **Step 2: Client open/close**

```tsx
// frontend-petshop/components/layout/MegaMenu.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { categoryPath } from '../../lib/seo/structuredData';

type Item = { slug: string; name: string; panel: ReactNode };

const HOVER_DELAY_MS = 150;

// "Chó ▾" / "Mèo ▾" (clip). The name is a link to the species page; the ▾ button (and hovering the
// pair) opens the panel. Panels are always in the HTML (hidden when closed) so crawlers see every
// category link. Escape closes and returns focus; navigating closes. The panel spans the header
// width: it is positioned against the sticky <header>, outside MainNav's scrolling list.
export function MegaMenu({ items }: { items: Item[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const later = (slug: string | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(slug), HOVER_DELAY_MS);
  };

  useEffect(() => setOpen(null), [pathname]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !open) return;
      root.current?.querySelector<HTMLButtonElement>(`[data-toggle="${open}"]`)?.focus();
      setOpen(null);
    };
    const onClick = (e: MouseEvent) => {
      if (open && !root.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  return (
    <div ref={root} className="flex shrink-0 items-center" onMouseLeave={() => later(null)}>
      {items.map((item) => (
        <div key={item.slug} onMouseEnter={() => later(item.slug)} className="flex items-center">
          <Link href={categoryPath(item.slug)} className="flex min-h-11 items-center rounded-l-full pl-3 text-sm font-bold whitespace-nowrap text-ink hover:bg-mint">{item.name}</Link>
          <button type="button" data-toggle={item.slug} aria-expanded={open === item.slug} aria-controls={`mega-${item.slug}`}
            aria-label={`Mở danh mục ${item.name}`} onClick={() => setOpen(open === item.slug ? null : item.slug)}
            className="grid min-h-11 w-8 place-items-center rounded-r-full text-xs text-ink hover:bg-mint">
            <span aria-hidden="true" className={open === item.slug ? 'rotate-180' : ''}>▾</span>
          </button>
          <div id={`mega-${item.slug}`} hidden={open !== item.slug} onMouseEnter={() => later(item.slug)}
            className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-140px)] overflow-y-auto overscroll-contain border-t border-line bg-surface shadow-card">
            {item.panel}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Header, dropdown, mobile, layout**

`SiteHeader.tsx`:
- Props as in Interfaces; drop the `featured` links (links = `MAIN_NAV`).
- `const species = FEATURED_CATEGORY_SLUGS.flatMap((slug) => { const node = categories.find((c) => c.slug === slug); return node ? [{ slug, name: node.name, panel: <MegaMenuPanel node={node} extras={megaMenus[slug] ?? { banner: null, brands: [] }} /> }] : []; });`
- Nav row: `{categories.length > 0 && <CategoryMenu categories={categories} />}{species.length > 0 && <MegaMenu items={species} />}<MainNav links={links} />…`
- Comment: update "Cho chó / Cho mèo" sentence to the mega menu.

`CategoryMenu.tsx` (props `categories: CategoryNode[]`): list each species as a bold link, its groups indented below:
```tsx
      <ul className="absolute top-full left-0 z-50 mt-2 max-h-[70dvh] w-72 overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-2 shadow-card">
        {categories.map((c) => (
          <li key={c.id}>
            <Link href={categoryPath(c.slug)} className="flex min-h-11 items-center rounded-card px-3 text-sm font-extrabold text-ink hover:bg-mint">{c.name}</Link>
            {c.children.length > 0 && (
              <ul className="mb-1 ml-3 border-l border-line pl-2">
                {c.children.map((g) => (
                  <li key={g.id}><Link href={categoryPath(g.slug)} className="flex min-h-11 items-center rounded-card px-3 text-sm text-ink hover:bg-mint">{g.name}</Link></li>
                ))}
              </ul>
            )}
          </li>
        ))}
        …"Tất cả sản phẩm ›" item unchanged…
```

`MobileMenu.tsx` (props `categories: CategoryNode[]`): replace the flat category list with nested `<details>`:
```tsx
              <ul className="flex flex-col">
                {categories.map((c) => (
                  <li key={c.id}>
                    <details className="group">
                      <summary className={`${item(false)} cursor-pointer list-none justify-between [&::-webkit-details-marker]:hidden`}>
                        {c.name} <span aria-hidden="true" className="group-open:rotate-180">▾</span>
                      </summary>
                      <ul className="ml-3 border-l border-line pl-2">
                        <li><Link href={categoryPath(c.slug)} className={item(pathname === categoryPath(c.slug))}>Tất cả {c.name}</Link></li>
                        {c.children.map((g) => (
                          <li key={g.id}>
                            {g.children.length === 0 ? (
                              <Link href={categoryPath(g.slug)} className={item(pathname === categoryPath(g.slug))}>{g.name}</Link>
                            ) : (
                              <details className="group/g">
                                <summary className={`${item(false)} cursor-pointer list-none justify-between font-semibold [&::-webkit-details-marker]:hidden`}>
                                  {g.name} <span aria-hidden="true" className="group-open/g:rotate-180">▾</span>
                                </summary>
                                <ul className="ml-3 border-l border-line pl-2">
                                  <li><Link href={categoryPath(g.slug)} className={item(pathname === categoryPath(g.slug))}>Tất cả {g.name}</Link></li>
                                  {g.children.map((leaf) => (
                                    <li key={leaf.id}><Link href={categoryPath(leaf.slug)} className={item(pathname === categoryPath(leaf.slug))}>{leaf.name}</Link></li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
```

`app/layout.tsx`: fetch `getShopCategories()` (now the tree) as before plus `getMegaMenus()` in the same `Promise.all`; pass `megaMenus` to `SiteHeader`.

- [ ] **Step 4: Verify** — `npm run lint && npm run typecheck && npm test`; production build (`NEXT_PUBLIC_SITE_URL=http://172.16.3.155:3000 INTERNAL_API_SECRET=… npm run build`) passes; restart the frontend task; `curl -s $B/ | grep -o 'href="/danh-muc/[a-z0-9-]*"' | sort -u | wc -l` ≥ 46.

---

### Task 8: Frontend — category page (breadcrumb trail, sub-category chips, brand filter) and product breadcrumb

**Files:**
- Modify: `frontend-petshop/app/danh-muc/[slug]/page.tsx`
- Modify: `frontend-petshop/app/san-pham/[slug]/page.tsx` (crumbs)
- Create: `frontend-petshop/lib/seo/categoryCrumbs.ts`
- Test: `frontend-petshop/test/catalog.seo.test.ts` (add cases)

**Interfaces:**
- Consumes: `getShopCategory`, `getCategoryTrail`, `getCategoryProducts(slug, page, sort, brand)`, `parseBrandParam`, `listHref` (Task 5).
- Produces: `categoryCrumbs(trail: { name: string; slug: string }[], current?: string): Crumb[]`; `categoryMetadataRobots(page: number, sorted: boolean, brand: string | undefined)` is NOT added — reuse the existing inline logic with `brand` added.

- [ ] **Step 1: Failing test** — add to `test/catalog.seo.test.ts`:
```ts
import { categoryCrumbs } from '../lib/seo/categoryCrumbs';

describe('categoryCrumbs', () => {
  const trail = [{ name: 'Chó', slug: 'cho' }, { name: 'Thức ăn', slug: 'cho-thuc-an' }, { name: 'Hạt cho chó', slug: 'hat-cho-cho' }];

  it('links every ancestor and leaves the current category unlinked', () => {
    expect(categoryCrumbs(trail)).toEqual([
      { name: 'Trang chủ', path: '/' },
      { name: 'Chó', path: '/danh-muc/cho' },
      { name: 'Thức ăn', path: '/danh-muc/cho-thuc-an' },
      { name: 'Hạt cho chó' },
    ]);
  });

  it('links the whole trail when a product is the current page', () => {
    expect(categoryCrumbs(trail, 'Hạt X 2kg').at(-2)).toEqual({ name: 'Hạt cho chó', path: '/danh-muc/hat-cho-cho' });
    expect(categoryCrumbs(trail, 'Hạt X 2kg').at(-1)).toEqual({ name: 'Hạt X 2kg' });
  });
});
```
Run → FAIL (module missing).

- [ ] **Step 2: Implement**

```ts
// frontend-petshop/lib/seo/categoryCrumbs.ts
import { categoryPath, type Crumb } from './structuredData';

// Home › species › group › leaf (› product). The last crumb is the current page and has no link,
// on the page and in BreadcrumbList JSON-LD alike.
export function categoryCrumbs(trail: { name: string; slug: string }[], current?: string): Crumb[] {
  const links = trail.map((c) => ({ name: c.name, path: categoryPath(c.slug) }));
  const crumbs: Crumb[] = [{ name: 'Trang chủ', path: '/' }, ...links];
  if (current) return [...crumbs, { name: current }];
  const last = crumbs.pop();
  return last ? [...crumbs, { name: last.name }] : crumbs;
}
```

Category page changes:
- `searchParams` type gains `'thuong-hieu'?: string | string[]`; `const brand = parseBrandParam(sp['thuong-hieu']);` in both `generateMetadata` and the page; `brand === null` → not found (same as bad page/sort).
- Metadata: title parts add `brand && \`Thương hiệu ${brand}\``; canonical: `sorted || brand ? path : listHref(path, { page })`; robots noindex when `page > 1 || sorted || brand`.
- Page: `const [{ products, total }, trail] = await Promise.all([getCategoryProducts(category.slug, page, sort, brand), getCategoryTrail(category.slug)]);` `const crumbs = categoryCrumbs(trail.length > 0 ? trail : [category]);`
- Under the description, sub-category chips when `category.children.length > 0`:
```tsx
        {category.children.length > 0 && (
          <nav aria-label="Danh mục con">
            <ul className="flex flex-wrap gap-2">
              {category.children.map((c) => (
                <li key={c.id}><Link href={categoryPath(c.slug)} className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-bold text-ink hover:border-brand-ink">{c.name}</Link></li>
              ))}
            </ul>
          </nav>
        )}
```
- Active brand chip (when `brand`): `<Link href={listHref(path, { sort })} className="inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-mint px-4 text-sm font-bold text-brand-deep">Thương hiệu: {brand} <span aria-hidden="true">✕</span><span className="sr-only">(bỏ lọc)</span></Link>`.
- Sort and pagination `hrefFor` pass `brand`. Empty state message with brand: `Chưa có sản phẩm ${brand} trong danh mục này.`.

Product page: `const trail = await getCategoryTrail(product.category.slug)` (add to the existing `Promise.all`; on failure fall back to `[product.category]`), `crumbs = categoryCrumbs(trail.length > 0 ? trail : [product.category], product.name)`.

- [ ] **Step 3: Verify** — `npm run lint && npm run typecheck && npm test`; build; curl:
```bash
curl -s $B/danh-muc/hat-cho-cho | grep -o '"@type":"ListItem"' | wc -l            # 4
curl -s $B/danh-muc/cho | grep -o 'href="/danh-muc/cho-[a-z-]*"' | sort -u        # 4 groups
curl -s "$B/danh-muc/cho?thuong-hieu=Royal%20Canin" | grep -Eo '<meta name="robots"[^>]*>|rel="canonical"[^>]*'   # noindex,follow + canonical /danh-muc/cho
curl -s -o /dev/null -w '%{http_code}\n' $B/danh-muc/pate                          # 404
curl -s $B/sitemap.xml | grep -c '/danh-muc/'                                      # 46
```
`/danh-muc/cho` lists the demo dog products (from leaves).

---

### Task 9: Docs, mobile/UI verification, commit proposal

**Files:**
- Modify: `docs/DECISIONS.md` (ADR-016), `docs/PROGRESS.md` (local only, not committed)

- [ ] **Step 1: ADR-016** — Context (flat categories, paddy-style tree requested), Decision (multi-level tree + `sortOrder`; in-memory subtree; `brand` filter on `GET /products`; `mega_menu_*` settings; production seed with `--apply`), Reasons, Rejected (recursive CTE, Brand table), Consequences (production must run the migration + `seed:category-tree -- --apply`; product `brand` text must match the menu name).
- [ ] **Step 2: UI checks (CDP scripts in scratchpad)** — at 320/360/390/430/768/1024: no horizontal scroll on `/`, `/danh-muc/cho`, `/danh-muc/hat-cho-cho`; at 1024 open "Chó ▾" (click + Escape returns focus to ▾); mobile ☰ → Chó → Thức ăn → Hạt cho chó navigates; zoom 200% (195px) header still fits; tap targets ≥ 44px in the drawer and chips. Fix anything found.
- [ ] **Step 3: Admin check** — `/admin/cau-hinh` shows "Menu Chó / Mèo"; save a brand with a logo + banner on the local DB; the header panel shows them; brand link filters.
- [ ] **Step 4: Full suites** — backend `npm run typecheck && npm test && npm run test:db`; frontend `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] **Step 5: Propose commits, wait for "ok"**
  - `add category tree with sort order and brand filter` — backend files (schema, migration, utils, service, controllers, route, scripts, package.json, tests).
  - `add category mega menu and brand filter pages` — frontend files.
