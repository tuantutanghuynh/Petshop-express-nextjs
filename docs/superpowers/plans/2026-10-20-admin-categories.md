# Admin Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/danh-muc` to add, edit (name, slug, description, parent), delete, reorder categories of the petshop tree and manage their attributes; old category slugs answer 308 to the new URL.

**Architecture:** Pure tree rules (depth, height, cycle, reorder match) in `backend/utils/categoryTree.ts`; a service `categoryAdmin.service.ts` applies them inside transactions; thin controllers + express-validator routes guarded by `authenticate`, `requireRole('admin')` and `resolveBrand` (the shop's subtree = `req.brand.categoryIds`). Slug history lives in a new `CategorySlugRedirect` table. The frontend admin is a client component tree with a `<dialog>` editor; the public category page asks `/categories/resolve/:slug` before answering 404.

**Tech Stack:** Express 5, Prisma 7.9.1, PostgreSQL 15, express-validator, Vitest + supertest + testcontainers; Next.js 16.3.4 (`permanentRedirect`), React 19, Tailwind v4.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-20-admin-categories-design.md`.
- Shop scope = `req.brand.categoryIds` from `resolveBrand` (header `X-Brand-Slug`); the root itself and anything outside → 404 `CATEGORY_NOT_FOUND`.
- Max depth 3 below the root (`MAX_CATEGORY_DEPTH = 3`).
- Validation: name trimmed 1–100; slug `^[a-z0-9-]{1,80}$`; description ≤ 500 (empty → null). Errors: 422 `VALIDATION_ERROR`, 409 `SLUG_TAKEN` / `CATEGORY_CYCLE` / `CATEGORY_TOO_DEEP` / `CATEGORY_NOT_EMPTY`, 422 `REORDER_MISMATCH`.
- Migration additive only (new table). Claude writes it; **the user runs it** on the dev DB.
- Admin requests send `X-Brand-Slug: BRAND_SLUG`. After any change: `revalidateStorefront(['categories', 'products'])`.
- Slugs in `MEGA_MENU_SLUGS` (`cho`, `meo`) cannot be edited in the UI.
- No `any`, no `eslint-disable`, no `!`. Code/comments English, UI Vietnamese. Mobile rules (44px targets, bottom sheet on phones, `focusFirstError`, 200% zoom).
- Commits: short plain lines, no attribution, user approves first; never commit `docs/`, the PDF or the user's guide `.md` files.

---

### Task 1: Backend — pure tree rules

**Files:**
- Modify: `backend/utils/categoryTree.ts`
- Test: `backend/test/categoryTree.test.ts` (append)

**Interfaces:**
- Produces:
  - `MAX_CATEGORY_DEPTH = 3`
  - `categoryDepth(all: Link[], id: string, rootId: string): number` — root 0, child 1…; `-1` when `id` is not under `rootId` (or a loop).
  - `subtreeHeight(all: Link[], id: string): number` — leaf 0.
  - `sameMembers(a: string[], b: string[]): boolean` — same ids, no duplicates, order ignored.
  - `type Link = { id: string; parentId: string | null }` (exported).

- [ ] **Step 1: Failing tests** (append to `test/categoryTree.test.ts`, extend the import)

```ts
describe('categoryDepth / subtreeHeight', () => {
  it('counts levels below the root', () => {
    expect(categoryDepth(rows, 'root', 'root')).toBe(0);
    expect(categoryDepth(rows, 'cho', 'root')).toBe(1);
    expect(categoryDepth(rows, 'hat-cho-cho', 'root')).toBe(3);
    expect(categoryDepth(rows, 'other', 'root')).toBe(-1);
  });

  it('gives -1 for a parent loop instead of hanging', () => {
    expect(categoryDepth([{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }], 'a', 'root')).toBe(-1);
  });

  it('measures how many levels hang below a category', () => {
    expect(subtreeHeight(rows, 'hat-cho-cho')).toBe(0);
    expect(subtreeHeight(rows, 'cho')).toBe(2);
    expect(subtreeHeight(rows, 'root')).toBe(3);
  });
});

describe('sameMembers', () => {
  it('accepts the same ids in any order and refuses missing, extra or repeated ids', () => {
    expect(sameMembers(['b', 'a'], ['a', 'b'])).toBe(true);
    expect(sameMembers(['a'], ['a', 'b'])).toBe(false);
    expect(sameMembers(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
    expect(sameMembers(['a', 'a'], ['a', 'b'])).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `cd backend && npx vitest run test/categoryTree.test.ts` → FAIL (not exported).

- [ ] **Step 3: Implement** (append to `utils/categoryTree.ts`; also `export type Link` and use it in `categorySubtreeIds`'s signature)

```ts
// Menus show three levels below the brand root (species → group → leaf), so the tree may not grow
// deeper (ADR-017).
export const MAX_CATEGORY_DEPTH = 3;

// Levels between the root and `id` (root 0); -1 when `id` is not below `rootId`. The walk is capped
// by the row count, so a parentId loop ends as -1 instead of hanging.
export function categoryDepth(all: Link[], id: string, rootId: string): number {
  const parentOf = new Map(all.map((c) => [c.id, c.parentId]));
  let current: string | null | undefined = id;
  for (let depth = 0; depth <= all.length; depth += 1) {
    if (current === rootId) return depth;
    if (!current) return -1;
    current = parentOf.get(current);
  }
  return -1;
}

// Levels hanging below `id` (a leaf is 0).
export function subtreeHeight(all: Link[], id: string): number {
  const children = all.filter((c) => c.parentId === id);
  return children.length === 0 ? 0 : 1 + Math.max(...children.map((c) => subtreeHeight(all, c.id)));
}

// True when `ids` lists exactly the members of `expected`, each once (order ignored).
export function sameMembers(ids: string[], expected: string[]): boolean {
  const set = new Set(ids);
  return set.size === ids.length && ids.length === expected.length && expected.every((id) => set.has(id));
}
```
Note: `subtreeHeight` only runs on shop rows reached from a real parent chain (validated with `categoryDepth` first), so it never meets a loop.

- [ ] **Step 4: Run** → PASS; `npm run typecheck`.

---

### Task 2: Backend — `CategorySlugRedirect` table

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261021120000_add_category_slug_redirects/migration.sql`

- [ ] **Step 1: Schema**

```prisma
// in model Category:
  slugRedirects CategorySlugRedirect[]

// Former slugs of a category (ADR-017): /danh-muc/<oldSlug> answers 308 to the current slug, so a
// renamed URL keeps its links and search ranking. Deleted with the category.
model CategorySlugRedirect {
  oldSlug    String   @id
  categoryId String
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())

  @@index([categoryId])
}
```

- [ ] **Step 2: Migration SQL**

```sql
-- Former category slugs for 308 redirects (ADR-017). Additive: a new table only.
-- Rollback: DROP TABLE "CategorySlugRedirect";
CREATE TABLE "CategorySlugRedirect" (
    "oldSlug" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CategorySlugRedirect_pkey" PRIMARY KEY ("oldSlug")
);
CREATE INDEX "CategorySlugRedirect_categoryId_idx" ON "CategorySlugRedirect"("categoryId");
ALTER TABLE "CategorySlugRedirect" ADD CONSTRAINT "CategorySlugRedirect_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Check** — `npx prisma validate && npx prisma generate && npm run typecheck`; `npm run test:db -- test/db/smoke.test.ts` (replays migrations in the container) → PASS. Compare with Prisma's own SQL: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script --shadow-database-url <container url from the test log is not available>` — if no shadow DB is at hand, rely on the DB suite (it would fail on a schema/column mismatch at query time).

---

### Task 3: Backend — admin category API

**Files:**
- Create: `backend/services/categoryAdmin.service.ts`
- Modify: `backend/controllers/category.controller.ts` (`create` delegates; new `adminList`, `update`, `remove`, `reorder`, `resolve`)
- Modify: `backend/routes/category.route.ts`
- Test: `backend/test/categories.admin.validation.test.ts` (DB-free), `backend/test/db/category.admin.test.ts`, adjust `backend/test/db/content.admin.test.ts` (POST now needs the brand header + a parent — spec change)

**Interfaces:**
- Consumes: Task 1 helpers; `req.brand` (`{ slug, categoryIds }`, root id = `categoryIds[0]`).
- Produces (HTTP):
  - `GET /categories/admin/list` → rows `Category & { _count: { products, blogPosts, galleryItems, children } }`
  - `POST /categories` `{ name, slug, description?, parentId }` → 201
  - `PATCH /categories/:id` `{ name?, slug?, description?, parentId? }` → 200 updated row
  - `DELETE /categories/:id` → 200 `{ message }` (project convention: success envelope, see cart delete)
  - `PUT /categories/reorder` `{ parentId, ids }` → 200 `{ message }`
  - `GET /categories/resolve/:slug` → `{ slug }` or 404 `CATEGORY_NOT_FOUND`

- [ ] **Step 1: DB-free failing tests**

```ts
// backend/test/categories.admin.validation.test.ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app';
import { bearer, tokenFor } from './helpers';

// Category admin endpoints: no token → 401, a customer → 403, bad input → 422 — all answered by
// middleware before any query runs, so no database is needed.
const ENDPOINTS: [string, string][] = [
  ['get', '/api/v1/categories/admin/list'],
  ['patch', '/api/v1/categories/some-id'],
  ['delete', '/api/v1/categories/some-id'],
  ['put', '/api/v1/categories/reorder'],
];
type M = 'get' | 'patch' | 'delete' | 'put' | 'post';
const call = (m: string, url: string) => request(app)[m as M](url).set('X-Brand-Slug', 'petshop');

describe('category admin access', () => {
  it.each(ENDPOINTS)('%s %s → 401 without a token', async (m, url) => {
    expect((await call(m, url)).status).toBe(401);
  });
  it.each(ENDPOINTS)('%s %s → 403 for a customer', async (m, url) => {
    expect((await call(m, url).set(bearer(tokenFor('customer')))).status).toBe(403);
  });
});

describe('category admin validation', () => {
  const admin = () => bearer(tokenFor('admin'));
  it.each([
    ['blank name', { name: '   ' }],
    ['long name', { name: 'x'.repeat(101) }],
    ['bad slug', { slug: 'Chó Mèo' }],
    ['long description', { description: 'x'.repeat(501) }],
  ])('PATCH refuses a %s with 422', async (_l, body) => {
    const res = await call('patch', '/api/v1/categories/some-id').set(admin()).send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
  it('POST needs a name, a slug and a parent', async () => {
    expect((await call('post', '/api/v1/categories').set(admin()).send({ name: 'A', slug: 'a' })).status).toBe(422);
  });
  it('reorder needs a parent and a list of ids', async () => {
    expect((await call('put', '/api/v1/categories/reorder').set(admin()).send({ parentId: 'p', ids: 'x' })).status).toBe(422);
  });
});
```
Order matters: `authenticate, requireRole('admin')` run before `resolveBrand` and validators, so 401/403 need no DB. Validators run before `resolveBrand` too (put `resolveBrand` last, just before the controller), so 422 needs no DB.

Run `npx vitest run test/categories.admin.validation.test.ts` → FAIL (routes missing → 404).

- [ ] **Step 2: Routes**

```ts
// backend/routes/category.route.ts (replace the POST block, add the rest; static paths before /:id)
const admin = [authenticate, requireRole('admin')];
const name = (b: ReturnType<typeof body>) => b.isString().trim().isLength({ min: 1, max: 100 }).withMessage('Tên danh mục từ 1 đến 100 ký tự');
const slug = (b: ReturnType<typeof body>) => b.isString().matches(/^[a-z0-9-]{1,80}$/).withMessage('Slug chỉ gồm a-z, 0-9, dấu - (tối đa 80 ký tự)');
const description = body('description').optional({ values: 'null' }).isString().isLength({ max: 500 }).withMessage('Mô tả tối đa 500 ký tự');

router.get('/', ctrl.list);
router.get('/admin/list', ...admin, resolveBrand, ctrl.adminList);
router.get('/resolve/:slug', ctrl.resolve);
router.put('/reorder', ...admin,
  [body('parentId').isString().notEmpty(), body('ids').isArray({ min: 1, max: 200 }), body('ids.*').isString(), validate],
  resolveBrand, ctrl.reorder);
router.post('/', ...admin,
  [name(body('name')), slug(body('slug')), description, body('parentId').isString().notEmpty().withMessage('Chọn danh mục cha'), validate],
  resolveBrand, ctrl.create);
router.patch('/:id', ...admin,
  [name(body('name').optional()), slug(body('slug').optional()), description, body('parentId').optional().isString().notEmpty(), validate],
  resolveBrand, ctrl.update);
router.delete('/:id', ...admin, resolveBrand, ctrl.remove);
```
Import `resolveBrand` from `../middlewares/resolveBrand`. Update the file's comments (scope = the brand's subtree, root excluded).

- [ ] **Step 3: DB failing tests**

```ts
// backend/test/db/category.admin.test.ts
import { describe, expect, it } from 'vitest';
import prisma from '../../services/prisma';
import { call } from './helpers/http';
import { createAdmin, createProduct } from './helpers/factories';

// The petshop tree (spec 2026-10-20 admin categories): root → cho → cho-thuc-an → hat-cho-cho, plus
// meo, and a foreign root "gomsu" that must stay out of reach.
async function tree() {
  const root = await prisma.category.create({ data: { slug: 'petshop', name: 'Shop' } });
  const cho = await prisma.category.create({ data: { slug: 'cho', name: 'Chó', parentId: root.id, sortOrder: 0 } });
  const meo = await prisma.category.create({ data: { slug: 'meo', name: 'Mèo', parentId: root.id, sortOrder: 1 } });
  const group = await prisma.category.create({ data: { slug: 'cho-thuc-an', name: 'Thức ăn', parentId: cho.id } });
  const leaf = await prisma.category.create({ data: { slug: 'hat-cho-cho', name: 'Hạt cho chó', parentId: group.id } });
  const gomsu = await prisma.category.create({ data: { slug: 'gomsu', name: 'Gốm' } });
  const admin = await createAdmin();
  const as = (m: 'get' | 'post' | 'patch' | 'delete' | 'put', url: string) => call(m, `/api/v1/categories${url}`, { token: admin.token });
  return { root, cho, meo, group, leaf, gomsu, as };
}

describe('admin list', () => {
  it('lists only the shop tree with counts', async () => {
    const t = await tree();
    await createProduct(t.leaf.id);
    const res = await t.as('get', '/admin/list');
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((c: { slug: string }) => c.slug);
    expect(slugs).toContain('hat-cho-cho');
    expect(slugs).not.toContain('gomsu');
    const leaf = res.body.data.find((c: { slug: string }) => c.slug === 'hat-cho-cho');
    expect(leaf._count).toMatchObject({ products: 1, children: 0 });
  });
});

describe('create', () => {
  it('adds at the end of the parent and refuses a fourth level or a used slug', async () => {
    const t = await tree();
    const res = await t.as('post', '').send({ name: 'Pate', slug: 'pate-cho-cho', parentId: t.group.id });
    expect(res.status).toBe(201);
    expect(res.body.data.sortOrder).toBe(1);
    expect((await t.as('post', '').send({ name: 'Quá sâu', slug: 'qua-sau', parentId: t.leaf.id })).body.error.code).toBe('CATEGORY_TOO_DEEP');
    expect((await t.as('post', '').send({ name: 'Trùng', slug: 'cho', parentId: t.root.id })).body.error.code).toBe('SLUG_TAKEN');
    expect((await t.as('post', '').send({ name: 'Ngoài', slug: 'ngoai', parentId: t.gomsu.id })).status).toBe(404);
  });
});

describe('update', () => {
  it('edits name and description', async () => {
    const t = await tree();
    const res = await t.as('patch', `/${t.leaf.id}`).send({ name: ' Hạt khô ', description: '' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'Hạt khô', description: null });
  });

  it('moves to another parent at the end, refusing cycles and depth over 3', async () => {
    const t = await tree();
    const moved = await t.as('patch', `/${t.group.id}`).send({ parentId: t.meo.id });
    expect(moved.status).toBe(200);
    expect(moved.body.data.parentId).toBe(t.meo.id);
    expect((await t.as('patch', `/${t.meo.id}`).send({ parentId: t.group.id })).body.error.code).toBe('CATEGORY_CYCLE');
    // meo now holds group → leaf (height 2); under cho (depth 1) it would reach a fourth level.
    expect((await t.as('patch', `/${t.meo.id}`).send({ parentId: t.cho.id })).body.error.code).toBe('CATEGORY_TOO_DEEP');
  });

  it('keeps the old slug as a redirect, and renaming back removes it', async () => {
    const t = await tree();
    expect((await t.as('patch', `/${t.leaf.id}`).send({ slug: 'hat-kho-cho-cho' })).status).toBe(200);
    expect((await call('get', '/api/v1/categories/resolve/hat-cho-cho', { brand: null })).body.data).toEqual({ slug: 'hat-kho-cho-cho' });
    // Another category may not take a slug that still redirects.
    expect((await t.as('post', '').send({ name: 'X', slug: 'hat-cho-cho', parentId: t.group.id })).body.error.code).toBe('SLUG_TAKEN');
    expect((await t.as('patch', `/${t.leaf.id}`).send({ slug: 'hat-cho-cho' })).status).toBe(200);
    expect((await call('get', '/api/v1/categories/resolve/hat-cho-cho', { brand: null })).status).toBe(404);
    expect((await call('get', '/api/v1/categories/resolve/hat-kho-cho-cho', { brand: null })).body.data).toEqual({ slug: 'hat-cho-cho' });
  });

  it('cannot touch the root or another storefront', async () => {
    const t = await tree();
    expect((await t.as('patch', `/${t.root.id}`).send({ name: 'X' })).status).toBe(404);
    expect((await t.as('patch', `/${t.gomsu.id}`).send({ name: 'X' })).status).toBe(404);
  });
});

describe('delete', () => {
  it('refuses a category that still holds children or products, deletes an empty one', async () => {
    const t = await tree();
    const busy = await t.as('delete', `/${t.group.id}`);
    expect(busy.status).toBe(409);
    expect(busy.body.error.code).toBe('CATEGORY_NOT_EMPTY');
    expect(busy.body.error.details).toMatchObject({ children: 1 });
    await createProduct(t.leaf.id);
    expect((await t.as('delete', `/${t.leaf.id}`)).body.error.details).toMatchObject({ products: 1 });
    expect((await t.as('delete', `/${t.meo.id}`)).status).toBe(200);
    expect(await prisma.category.findUnique({ where: { id: t.meo.id } })).toBeNull();
  });
});

describe('reorder', () => {
  it('writes the given order and refuses a list that is not exactly the siblings', async () => {
    const t = await tree();
    expect((await t.as('put', '/reorder').send({ parentId: t.root.id, ids: [t.meo.id, t.cho.id] })).status).toBe(200);
    const rows = await prisma.category.findMany({ where: { parentId: t.root.id }, orderBy: { sortOrder: 'asc' } });
    expect(rows.map((r) => r.slug)).toEqual(['meo', 'cho']);
    const bad = await t.as('put', '/reorder').send({ parentId: t.root.id, ids: [t.meo.id] });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('REORDER_MISMATCH');
  });
});
```
Adjust `content.admin.test.ts` category test: drop `brand: null` from the POST call (header now required) and send `{ name: 'X', slug: child.slug, parentId: child.id }` — still expects 409 (slug taken). Comment: "POST now requires the brand header and a parent (admin categories spec)".

Run `npm run test:db -- test/db/category.admin.test.ts` → FAIL.

- [ ] **Step 4: Service**

```ts
// backend/services/categoryAdmin.service.ts
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

export async function listShopCategories(s: Scope) {
  return prisma.category.findMany({
    where: { id: { in: s.shopIds } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { products: true, blogPosts: true, galleryItems: true, children: true } } },
  });
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
  const counts = await prisma.category.findUniqueOrThrow({
    where: { id },
    select: { _count: { select: { children: true, products: true, blogPosts: true, galleryItems: true } } },
  });
  const c = counts._count;
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
```
Check `ApiError`'s constructor accepts `details` as 4th arg (it does: `ApiError(status, code, message, details)` per CLAUDE.md).

- [ ] **Step 5: Controllers** — in `category.controller.ts`:

```ts
const scope = (req: Request) => ({ shopIds: req.brand?.categoryIds ?? [] });
// resolveBrand runs on every route below, so req.brand is set; `?? []` keeps the type honest.

export const adminList = asyncHandler(async (req, res) => sendSuccess(res, await listShopCategories(scope(req))));
export const create = asyncHandler(async (req, res) => {
  const { name, slug, description, parentId } = req.body;
  sendSuccess(res, await createShopCategory(scope(req), { name, slug, description, parentId }), null, 201);
});
export const update = asyncHandler(async (req, res) => {
  const { name, slug, description, parentId } = req.body;
  sendSuccess(res, await updateShopCategory(scope(req), req.params.id as string, { name, slug, description, parentId }));
});
export const remove = asyncHandler(async (req, res) => {
  await deleteShopCategory(scope(req), req.params.id as string);
  sendSuccess(res, { message: 'Đã xoá danh mục' });
});
export const reorder = asyncHandler(async (req, res) => {
  await reorderShopCategories(scope(req), req.body.parentId, req.body.ids);
  sendSuccess(res, { message: 'Đã lưu thứ tự' });
});
export const resolve = asyncHandler(async (req, res) => sendSuccess(res, { slug: await resolveCategorySlug(req.params.slug as string) }));
```
(type the handler params `(req: Request, res: Response)` as in the rest of the file.) Replace the old `create` and its comment.

- [ ] **Step 6: Run** — validation test PASS; `npm run test:db -- test/db/category.admin.test.ts test/db/content.admin.test.ts` PASS; `npm run typecheck && npm test && npm run test:db`.

- [ ] **Step 7: Pause for the user** — run on the dev DB: `cd backend && npx prisma migrate deploy` (expect `20261021120000_add_category_slug_redirects` applied).

---

### Task 4: Frontend — admin tree helpers

**Files:**
- Create: `frontend-petshop/lib/adminCategories.ts`
- Modify: `frontend-petshop/lib/types.ts` (`AdminCategory`)
- Test: `frontend-petshop/test/adminCategories.test.ts`

**Interfaces:**
- Produces:
  - `type AdminCategory = Category & { _count: { products: number; blogPosts: number; galleryItems: number; children: number } }` (types.ts)
  - `MAX_CATEGORY_DEPTH = 3`
  - `slugify(name: string): string`
  - `type AdminNode = AdminCategory & { depth: number; children: AdminNode[] }`
  - `buildAdminTree(rows: AdminCategory[], rootSlug: string): { root: AdminCategory | null; nodes: AdminNode[] }` (depth 1 = species)
  - `subtreeHeightOf(node: AdminNode): number`
  - `parentOptions(nodes: AdminNode[], root: AdminCategory, editing: AdminNode | null): { id: string; label: string }[]` — root + nodes where moving/creating keeps depth ≤ 3 and is not the node itself or below it; labels indented with "— " per depth.
  - `moveInSiblings(ids: string[], id: string, dir: -1 | 1): string[] | null` (null at the edge)
  - `deleteBlockReason(c: AdminCategory['_count']): string | null`

- [ ] **Step 1: Failing tests**

```ts
// frontend-petshop/test/adminCategories.test.ts
import { describe, expect, it } from 'vitest';
import { buildAdminTree, deleteBlockReason, moveInSiblings, parentOptions, slugify } from '../lib/adminCategories';
import type { AdminCategory } from '../lib/types';

const zero = { products: 0, blogPosts: 0, galleryItems: 0, children: 0 };
const row = (id: string, parentId: string | null, sortOrder = 0): AdminCategory => ({ id, parentId, slug: id, name: id, description: null, sortOrder, _count: zero });
const rows = [row('petshop', null), row('cho', 'petshop', 0), row('meo', 'petshop', 1), row('cho-thuc-an', 'cho'), row('hat-cho-cho', 'cho-thuc-an')];

describe('slugify', () => {
  it('makes a URL slug from a Vietnamese name', () => {
    expect(slugify('  Pate cho Mèo & Chó  ')).toBe('pate-cho-meo-cho');
    expect(slugify('Đồ chơi')).toBe('do-choi');
    expect(slugify('!!!')).toBe('');
    expect(slugify('a'.repeat(100)).length).toBe(80);
  });
});

describe('buildAdminTree / parentOptions', () => {
  const { root, nodes } = buildAdminTree(rows, 'petshop');

  it('nests the shop rows with their depth', () => {
    expect(root?.slug).toBe('petshop');
    expect(nodes.map((n) => [n.slug, n.depth])).toEqual([['cho', 1], ['meo', 1]]);
    expect(nodes[0].children[0].children[0]).toMatchObject({ slug: 'hat-cho-cho', depth: 3 });
  });

  it('offers only parents that keep the tree within 3 levels and away from the node itself', () => {
    if (!root) throw new Error('root expected');
    const forNew = parentOptions(nodes, root, null).map((o) => o.id);
    expect(forNew).toEqual(['petshop', 'cho', 'cho-thuc-an', 'meo']);
    const group = nodes[0].children[0]; // cho-thuc-an (height 1)
    expect(parentOptions(nodes, root, group).map((o) => o.id)).toEqual(['petshop', 'cho', 'meo']);
    expect(parentOptions(nodes, root, nodes[0]).map((o) => o.id)).toEqual(['petshop']); // cho has height 2
  });
});

describe('moveInSiblings', () => {
  it('swaps with the neighbour and stops at the edges', () => {
    expect(moveInSiblings(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveInSiblings(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveInSiblings(['a', 'b'], 'a', -1)).toBeNull();
    expect(moveInSiblings(['a', 'b'], 'b', 1)).toBeNull();
  });
});

describe('deleteBlockReason', () => {
  it('explains what still uses the category', () => {
    expect(deleteBlockReason(zero)).toBeNull();
    expect(deleteBlockReason({ ...zero, products: 3, children: 2 })).toBe('Còn 2 danh mục con, 3 sản phẩm.');
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement**

```ts
// frontend-petshop/lib/adminCategories.ts
import type { AdminCategory } from './types';

// Rules of the /admin/danh-muc screen (test/adminCategories.test.ts). The backend enforces the same
// limits; these keep the form from offering choices the server would refuse.
export const MAX_CATEGORY_DEPTH = 3;

export type AdminNode = AdminCategory & { depth: number; children: AdminNode[] };

// "Pate cho Mèo" → "pate-cho-meo": accents removed, đ → d, anything else → "-", max 80 characters.
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

const order = (a: AdminCategory, b: AdminCategory) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'vi');

export function buildAdminTree(rows: AdminCategory[], rootSlug: string): { root: AdminCategory | null; nodes: AdminNode[] } {
  const root = rows.find((r) => r.parentId === null && r.slug === rootSlug) ?? null;
  if (!root) return { root: null, nodes: [] };
  const build = (parentId: string, depth: number): AdminNode[] =>
    rows.filter((r) => r.parentId === parentId).sort(order).map((r) => ({ ...r, depth, children: build(r.id, depth + 1) }));
  return { root, nodes: build(root.id, 1) };
}

export function subtreeHeightOf(node: AdminNode): number {
  return node.children.length === 0 ? 0 : 1 + Math.max(...node.children.map(subtreeHeightOf));
}

const flatten = (nodes: AdminNode[]): AdminNode[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);

// Where a category may go: the root or any node whose depth + 1 + the moved subtree's height stays
// within 3 levels, never the category itself or something below it.
export function parentOptions(nodes: AdminNode[], root: AdminCategory, editing: AdminNode | null): { id: string; label: string }[] {
  const height = editing ? subtreeHeightOf(editing) : 0;
  const banned = new Set(editing ? flatten([editing]).map((n) => n.id) : []);
  const fits = (depth: number) => depth + 1 + height <= MAX_CATEGORY_DEPTH;
  return [
    ...(fits(0) ? [{ id: root.id, label: `${root.name} (gốc)` }] : []),
    ...flatten(nodes).filter((n) => !banned.has(n.id) && fits(n.depth)).map((n) => ({ id: n.id, label: `${'— '.repeat(n.depth)}${n.name}` })),
  ];
}

export function moveInSiblings(ids: string[], id: string, dir: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function deleteBlockReason(c: AdminCategory['_count']): string | null {
  const parts = [
    c.children > 0 && `${c.children} danh mục con`,
    c.products > 0 && `${c.products} sản phẩm`,
    c.blogPosts > 0 && `${c.blogPosts} bài viết`,
    c.galleryItems > 0 && `${c.galleryItems} ảnh`,
  ].filter(Boolean);
  return parts.length > 0 ? `Còn ${parts.join(', ')}.` : null;
}
```
`types.ts`: `export interface AdminCategory extends Category { _count: { products: number; blogPosts: number; galleryItems: number; children: number } }`.

- [ ] **Step 3: Run** → PASS; `npm run typecheck`.

---

### Task 5: Frontend — `/admin/danh-muc` screen

**Files:**
- Create: `frontend-petshop/app/admin/danh-muc/page.tsx`
- Create: `frontend-petshop/components/admin/categories/CategoryManager.tsx` (load, actions, state)
- Create: `frontend-petshop/components/admin/categories/CategoryRows.tsx` (recursive list)
- Create: `frontend-petshop/components/admin/categories/CategoryEditor.tsx` (`<dialog>` form)
- Create: `frontend-petshop/components/admin/categories/AttributeEditor.tsx`
- Modify: `frontend-petshop/app/admin/layout.tsx` (link "Danh mục")

**Interfaces:**
- Consumes: Task 4 helpers; `authFetch` (`lib/adminAuth.ts`), `revalidateStorefront` (`lib/adminRevalidate.ts`), `BRAND_SLUG`, `MEGA_MENU_SLUGS`, `TextField`, `FormAlert`, `focusFirstError`, `fieldErrors` (`lib/forms.ts`).
- Behaviour:
  - Every `authFetch` sends `headers: { 'X-Brand-Slug': BRAND_SLUG }`.
  - Load `GET /categories/admin/list`; states: skeleton / `FormAlert` error with reload hint / empty ("Chưa có danh mục") / tree.
  - Row: name (bold if depth 1), `N SP`, buttons `Sửa`, `↑`, `↓` (disabled at the edges), `Xoá`, and `+ Mục con` when `depth < 3`; each button `min-h-11 min-w-11`, `aria-label` with the category name.
  - `↑/↓` → `moveInSiblings` → `PUT /categories/reorder` → reload.
  - `Xoá` → `deleteBlockReason` first (if non-null show it in an alert, no request); else `confirm()`-style `<dialog>` "Xoá danh mục X?" → `DELETE` → reload; a 409 shows the server message.
  - Editor `<dialog>`: bottom sheet on phones (`fixed inset-x-0 bottom-0 max-h-[90dvh] rounded-t-panel`), right drawer from `lg` (`lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[28rem] lg:max-h-none lg:rounded-none`); `overscroll-contain`; Esc / backdrop / ✕ close; focus returns to the opener. Fields: Tên (`maxLength 100`), Slug (auto from Tên while adding until edited by hand; when editing an existing slug, hint "URL cũ /danh-muc/<cũ> sẽ tự chuyển sang URL mới"; read-only with hint "Slug của Chó/Mèo gắn với menu, không đổi được" for `MEGA_MENU_SLUGS`), Danh mục cha (`<select>` from `parentOptions`), Mô tả (`<textarea maxLength 500>`). Client validation mirrors the server (name 1–100, slug regex, description ≤ 500) → errors per field + `focusFirstError`; server 422 → `fieldErrors(details)`; 409 → `FormAlert` with the message. Submit disabled while saving. Create → `POST /categories`; edit → `PATCH /categories/:id` with only changed fields.
  - `AttributeEditor` (edit mode only): list `GET /categories/:id/attributes` (label · key · Chữ/Số, delete button with confirm → `DELETE /categories/:id/attributes/:attributeId`); add form (label + select text/number) → `POST /categories/:id/attributes`; errors via `FormAlert`.
  - After every successful write: reload the list + `revalidateStorefront(['categories', 'products'])`.

Implementation notes (write the components accordingly, ≤ ~150 lines each; split helpers out if a file grows):
```tsx
// CategoryManager outline
'use client';
type Load = { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: AdminCategory[] };
const BRAND_HEADERS = { 'X-Brand-Slug': BRAND_SLUG };
async function reload() { const res = await authFetch<AdminCategory[]>('/categories/admin/list', { headers: BRAND_HEADERS }); … }
// editing: { mode: 'new'; parentId: string } | { mode: 'edit'; node: AdminNode } | null
```
`app/admin/danh-muc/page.tsx`: `metadata = { title: 'Danh mục' }`, `<h1>Danh mục &amp; thông số</h1>`, `<CategoryManager />`.
`layout.tsx` LINKS: add `{ href: '/admin/danh-muc', label: 'Danh mục' }` after "Bài viết".

- [ ] **Verify** — `npm run lint && npm run typecheck && npm test`; build; browser (CDP, scratchpad): admin token → `/admin/danh-muc` at 390 / 1280: tree renders 46 rows; add a leaf under "Thức ăn" (Chó) → appears last; edit its slug → `GET /categories/resolve/<old>` answers the new slug; ↑ moves it; delete it; delete "Chó" shows the "Còn … danh mục con" reason; no horizontal scroll; Esc closes the editor and focus returns; tap targets ≥ 44px; zoom 200% (195px) usable.

---

### Task 6: Frontend — 308 for renamed category URLs

**Files:**
- Modify: `frontend-petshop/services/catalog.ts` (`resolveCategorySlug`)
- Modify: `frontend-petshop/app/danh-muc/[slug]/page.tsx`

**Interfaces:**
- Produces: `resolveCategorySlug(slug: string): Promise<string | null>` (cached with tag `categories`; 404 → null).

- [ ] **Step 1: Service**

```ts
// Current slug of a renamed category (ADR-017), or null when `slug` was never a category slug.
export async function resolveCategorySlug(slug: string): Promise<string | null> {
  try {
    const { data } = await apiFetch<{ slug: string }>(`/categories/resolve/${encodeURIComponent(slug)}`, cached(['categories']));
    return data.slug;
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) return null;
    throw err;
  }
}
```

- [ ] **Step 2: Page** — in `CategoryPage`, before `notFound()` for a missing category:
```ts
  if (!category) {
    // A renamed category keeps its old URL alive: 308 to the current slug with the same list state.
    const moved = await resolveCategorySlug(slug);
    if (moved && page !== null && sort !== null && brand !== null) permanentRedirect(listHref(categoryPath(moved), { brand, sort, page }));
    notFound();
  }
```
(split the existing combined `if (!category || page === null …)` into the category check above and the param check after it; import `permanentRedirect` from `next/navigation`.) `generateMetadata` stays as is (returns the "Không tìm thấy" metadata; the redirect happens before render).

- [ ] **Step 3: Verify** — build; after renaming a test category in Task 5 (or via API): `curl -sI "$B/danh-muc/<old>?sort=price"` → `308` and `location: /danh-muc/<new>?sort=price`; unknown slug still 404.

---

### Task 7: Docs, full verification, commits

- [ ] ADR-017 in `docs/DECISIONS.md` (slug redirect table + 308, 3-level limit, admin category API scoped by brand; rejected: free slug edits with 404, drag-and-drop); PROGRESS entry.
- [ ] Backend `npm run typecheck && npm test && npm run test:db`; frontend `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] Clean up any test categories created during the browser check (via the admin screen).
- [ ] Propose commits, wait for "ok":
  - `add admin category api with slug redirects` — backend.
  - `add admin categories page and old slug redirects` — frontend.
