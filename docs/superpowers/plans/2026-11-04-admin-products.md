# Admin Sản phẩm (đợt D1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang quản lý sản phẩm trong admin (danh sách + form tạo / sửa có biến thể, ảnh, thông số) và giữ URL cũ bằng 308 khi đổi slug, với mọi API admin sản phẩm giới hạn theo shop.

**Architecture:** Backend thêm `services/productAdmin.service.ts` (phạm vi shop, slug + chuyển hướng, đọc 1 sản phẩm) theo mẫu `categoryAdmin.service.ts`; route sản phẩm admin chạy `resolveBrand` sau các kiểm tra rẻ. Frontend: hàm thuần trong `lib/adminProducts.ts`, component trong `components/admin/products/`, trang `app/admin/san-pham/*`; storefront tra slug cũ qua `GET /products/resolve/:slug` rồi `permanentRedirect`.

**Tech Stack:** Express 5 + express-validator 7, Prisma 7.9 + Postgres 15, Vitest + supertest + testcontainers (`npm run test:db`); Next.js 16.3 App Router, React 19, Tailwind 4, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-04-admin-products-design.md`

## Global Constraints

- Code / comment / commit tiếng Anh; commit một dòng ngắn, không nhắc Claude, chỉ commit khi người dùng "ok" (gom commit cuối đợt).
- Không `any` mới, không `@ts-ignore`, không `eslint-disable`, không setState đồng bộ trong effect.
- Claude không chạy migration trên DB dev / production; DB test (testcontainers) tự replay migration. `npx prisma generate` được chạy (chỉ sinh client).
- Mọi route admin sản phẩm: `authenticate` → `requireRole('admin')` → validator → `validate` → `resolveBrand` (resolveBrand chạm DB nên chạy cuối, test DB-free vẫn nhận 401/403/422).
- Ngoài shop → 404 (`PRODUCT_NOT_FOUND`, `VARIANT_NOT_FOUND`, `IMAGE_NOT_FOUND`, `CATEGORY_NOT_FOUND`).
- Slug sản phẩm: `^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤ 120. Form chỉ gửi `slug` khi đã đổi (slug cũ lệch quy tắc không chặn việc lưu).
- Giá: số nguyên 0 – 2 000 000 000 (frontend), backend giữ `MAX_DB_INT`.
- UI: vùng bấm ≥ 44px, chữ input ≥ 16px, tiêu đề tiếng Việt `leading ≥ 1.3`, tiền `tabular-nums`, không cuộn ngang ở 320px, thẻ < 768px / bảng ≥ 768px, mọi request admin sản phẩm gửi `X-Brand-Slug: BRAND_SLUG`.
- Revalidate sau ghi: `revalidateStorefront(['products', 'categories'])`.

## File Structure

| File | Trách nhiệm |
|---|---|
| `backend/prisma/schema.prisma` | + model `ProductSlugRedirect`, quan hệ `Product.slugRedirects` |
| `backend/prisma/migrations/20261104120000_add_product_slug_redirects/migration.sql` | tạo bảng (chỉ thêm) |
| `backend/services/productAdmin.service.ts` (mới) | phạm vi shop cho sản phẩm / biến thể / ảnh, `assertProductSlugFree`, `changeProductSlug`, `getShopProduct`, `resolveProductSlug` |
| `backend/controllers/product.controller.ts` | dùng service: scope mọi hàm admin, `adminGet`, `resolve`, slug redirect |
| `backend/routes/product.route.ts` | validator chặt, `resolveBrand`, route `/admin/:id`, `/resolve/:slug` |
| `backend/test/db/product.admin.test.ts` (mới) | DB test theo spec |
| `backend/test/products.validation.test.ts` | + 422 DB-free |
| `backend/test/db/inventory.test.ts` | bỏ `brand: null` ở các lời gọi route admin sản phẩm (đổi hợp đồng có chủ đích) |
| `frontend-petshop/lib/adminProducts.ts` (mới) | hàm thuần: query URL, khoảng giá, tồn, form, diff biến thể, nhãn danh mục |
| `frontend-petshop/test/adminProducts.test.ts` (mới) | unit test |
| `frontend-petshop/components/admin/products/productApi.ts` (mới) | `productApi()` (authFetch + header brand), `refreshProducts()` |
| `frontend-petshop/components/admin/products/ProductsManager.tsx`, `ProductsFilters.tsx`, `ProductsList.tsx` (mới) | danh sách |
| `frontend-petshop/components/admin/products/ProductForm.tsx`, `VariantRows.tsx`, `ImageList.tsx`, `AttributeFields.tsx`, `MarkdownField.tsx` (mới) | form |
| `frontend-petshop/app/admin/san-pham/page.tsx`, `moi/page.tsx`, `[id]/page.tsx` (mới) | trang |
| `frontend-petshop/lib/adminNav.ts` | Sản phẩm `ready: true` |
| `frontend-petshop/lib/types.ts` | `AdminProduct` (+ `category.attributes` có `attributeType`) |
| `frontend-petshop/services/catalog.ts`, `app/san-pham/[slug]/page.tsx` | `resolveProductSlug` + 308 |
| `docs/DECISIONS.md` | ADR-018 |

---

### Task 1: Bảng `ProductSlugRedirect`

**Files:**
- Modify: `backend/prisma/schema.prisma` (model `Product` ~66–92; thêm model sau `CategorySlugRedirect` ~42)
- Create: `backend/prisma/migrations/20261104120000_add_product_slug_redirects/migration.sql`

**Interfaces:** Produces `prisma.productSlugRedirect` `{ oldSlug: string @id, productId: string, createdAt }`.

- [ ] **Step 1: Schema**

```prisma
// Former product slugs for 308 redirects (ADR-018), like CategorySlugRedirect.
model ProductSlugRedirect {
  oldSlug   String   @id
  productId String
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@index([productId])
}
```
và trong `model Product` thêm `slugRedirects ProductSlugRedirect[]`.

- [ ] **Step 2: Migration SQL**

```sql
-- Former product slugs for 308 redirects (ADR-018). Additive: a new table only.
-- Rollback: DROP TABLE "ProductSlugRedirect";
CREATE TABLE "ProductSlugRedirect" (
    "oldSlug" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductSlugRedirect_pkey" PRIMARY KEY ("oldSlug")
);
CREATE INDEX "ProductSlugRedirect_productId_idx" ON "ProductSlugRedirect"("productId");
ALTER TABLE "ProductSlugRedirect" ADD CONSTRAINT "ProductSlugRedirect_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Sinh client + kiểm tra schema khớp SQL**

Run (cd backend): `npx prisma generate && npx prisma validate && npm run typecheck`
Expected: không lỗi. (Khớp SQL ↔ schema được chứng minh ở Task 2 khi testcontainers replay migration.)

---

### Task 2: Service phạm vi shop + slug (TDD, DB test)

**Files:**
- Create: `backend/services/productAdmin.service.ts`
- Create: `backend/test/db/product.admin.test.ts`

**Interfaces:**
- Produces:
  - `type Scope = { shopIds: string[] }`
  - `assertCategoryInShop(s: Scope, categoryId: string): void` → 404 `CATEGORY_NOT_FOUND`
  - `productInShop(s: Scope, id: string): Promise<Product>` → 404 `PRODUCT_NOT_FOUND`
  - `variantInShop(s: Scope, variantId: string): Promise<ProductVariant>` → 404 `VARIANT_NOT_FOUND`
  - `imageInShop(s: Scope, imageId: string): Promise<ProductImage>` → 404 `IMAGE_NOT_FOUND`
  - `assertProductSlugFree(slug: string, ownId?: string): Promise<void>` → 409 `SLUG_TAKEN`
  - `changeProductSlug(tx: Prisma.TransactionClient, product: { id: string; slug: string }, newSlug: string): Promise<void>` (lưu redirect, xoá redirect trùng của chính nó; không cập nhật cột slug)
  - `getShopProduct(s: Scope, id: string)` → product + `category.attributes` + images + variants
  - `resolveProductSlug(oldSlug: string): Promise<string>` → slug hiện tại nếu sản phẩm `active`, khác 404

- [ ] **Step 1: Viết test thất bại** (`test/db/product.admin.test.ts`; chỉ phần service + 2 endpoint mới sẽ thêm ở Task 3 — ở task này test gọi service trực tiếp)

```ts
import { describe, expect, it } from 'vitest';
import prisma from '../../services/prisma';
import { createProduct } from './helpers/factories';
import {
  assertProductSlugFree, changeProductSlug, getShopProduct, imageInShop, productInShop, resolveProductSlug, variantInShop,
} from '../../services/productAdmin.service';
import { categorySubtreeIds } from '../../utils/categoryTree';

// Shop "petshop" (root → cho → hat-cho-cho) and a foreign root "gomsu" with one product.
async function shop() {
  const root = await prisma.category.create({ data: { slug: 'petshop', name: 'Shop' } });
  const cho = await prisma.category.create({ data: { slug: 'cho', name: 'Chó', parentId: root.id } });
  const leaf = await prisma.category.create({ data: { slug: 'hat-cho-cho', name: 'Hạt cho chó', parentId: cho.id } });
  const gomsu = await prisma.category.create({ data: { slug: 'gomsu', name: 'Gốm' } });
  const all = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const scope = { shopIds: categorySubtreeIds(all, root.id) };
  const ours = await createProduct(leaf.id, { slug: 'hat-a', status: 'draft' });
  const foreign = await createProduct(gomsu.id, { slug: 'binh-gom' });
  const img = await prisma.productImage.create({ data: { productId: foreign.id, url: 'https://res.cloudinary.com/x/a.jpg' } });
  return { scope, leaf, gomsu, ours, foreign, img };
}

describe('shop scope', () => {
  it('finds a draft product of the shop and hides everything of another storefront', async () => {
    const t = await shop();
    expect((await getShopProduct(t.scope, t.ours.id)).status).toBe('draft');
    await expect(productInShop(t.scope, t.foreign.id)).rejects.toMatchObject({ statusCode: 404, code: 'PRODUCT_NOT_FOUND' });
    await expect(variantInShop(t.scope, t.foreign.variants[0].id)).rejects.toMatchObject({ statusCode: 404, code: 'VARIANT_NOT_FOUND' });
    await expect(imageInShop(t.scope, t.img.id)).rejects.toMatchObject({ statusCode: 404, code: 'IMAGE_NOT_FOUND' });
  });
});

describe('slug history', () => {
  it('keeps the old slug, frees it again when the product returns to it, and blocks it for others', async () => {
    const t = await shop();
    await prisma.$transaction(async (tx) => {
      await changeProductSlug(tx, t.ours, 'hat-b');
      await tx.product.update({ where: { id: t.ours.id }, data: { slug: 'hat-b', status: 'active' } });
    });
    expect(await resolveProductSlug('hat-a')).toBe('hat-b');
    await expect(assertProductSlugFree('hat-a')).rejects.toMatchObject({ statusCode: 409, code: 'SLUG_TAKEN' });
    await expect(assertProductSlugFree('hat-a', t.ours.id)).resolves.toBeUndefined();
    await prisma.$transaction(async (tx) => {
      await changeProductSlug(tx, { id: t.ours.id, slug: 'hat-b' }, 'hat-a');
      await tx.product.update({ where: { id: t.ours.id }, data: { slug: 'hat-a' } });
    });
    await expect(resolveProductSlug('hat-a')).rejects.toMatchObject({ statusCode: 404 });
    expect(await resolveProductSlug('hat-b')).toBe('hat-a');
  });

  it('does not resolve to a product that is not on sale', async () => {
    const t = await shop();
    await prisma.$transaction(async (tx) => {
      await changeProductSlug(tx, t.ours, 'hat-b');
      await tx.product.update({ where: { id: t.ours.id }, data: { slug: 'hat-b' } }); // still draft
    });
    await expect(resolveProductSlug('hat-a')).rejects.toMatchObject({ statusCode: 404 });
  });
});
```

Note: `ApiError` có `statusCode` và `code` — kiểm tra tên field trong `backend/utils/ApiError.ts` trước khi chạy, sửa matcher cho đúng tên thật.

- [ ] **Step 2: Chạy, thấy fail**

Run (cd backend): `npm run test:db -- test/db/product.admin.test.ts`
Expected: FAIL — `Cannot find module '../../services/productAdmin.service'`.

- [ ] **Step 3: Viết service**

```ts
import type { Prisma } from '@prisma/client';
import prisma from './prisma';
import ApiError from '../utils/ApiError';
import { PRODUCT_STATUS } from '../constants/product';

// Shop-scoped access to products for the admin (spec 2026-11-04 admin products). The scope is the
// id list resolveBrand puts on req.brand: the brand root and every category under it. A product
// belongs to the shop when its category is in that list; anything else answers 404, so an admin of
// one storefront cannot even learn that another storefront's rows exist.
export type Scope = { shopIds: string[] };

const productNotFound = () => new ApiError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm');

export function assertCategoryInShop(s: Scope, categoryId: string): void {
  if (!s.shopIds.includes(categoryId)) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục');
}

export async function productInShop(s: Scope, id: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product || !s.shopIds.includes(product.categoryId)) throw productNotFound();
  return product;
}

export async function variantInShop(s: Scope, variantId: string) {
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId }, include: { product: { select: { categoryId: true } } } });
  if (!variant || !s.shopIds.includes(variant.product.categoryId)) throw new ApiError(404, 'VARIANT_NOT_FOUND', 'Không tìm thấy biến thể');
  const { product: _owner, ...row } = variant;
  return row;
}

export async function imageInShop(s: Scope, imageId: string) {
  const image = await prisma.productImage.findUnique({ where: { id: imageId }, include: { product: { select: { categoryId: true } } } });
  if (!image || !s.shopIds.includes(image.product.categoryId)) throw new ApiError(404, 'IMAGE_NOT_FOUND', 'Không tìm thấy ảnh');
  const { product: _owner, ...row } = image;
  return row;
}

// A slug is free when no other product uses it now and it is not another product's former slug
// (that URL still redirects there).
export async function assertProductSlugFree(slug: string, ownId?: string): Promise<void> {
  const [used, redirect] = await Promise.all([
    prisma.product.findUnique({ where: { slug }, select: { id: true } }),
    prisma.productSlugRedirect.findUnique({ where: { oldSlug: slug }, select: { productId: true } }),
  ]);
  if ((used && used.id !== ownId) || (redirect && redirect.productId !== ownId)) {
    throw new ApiError(409, 'SLUG_TAKEN', 'Slug này đang được dùng (hoặc là URL cũ của sản phẩm khác)');
  }
}

// Inside the caller's transaction, before the product row gets newSlug: keep the current slug as a
// redirect, and drop the redirect that pointed newSlug back here when the owner returns to it.
export async function changeProductSlug(tx: Prisma.TransactionClient, product: { id: string; slug: string }, newSlug: string): Promise<void> {
  await tx.productSlugRedirect.deleteMany({ where: { oldSlug: newSlug, productId: product.id } });
  await tx.productSlugRedirect.create({ data: { oldSlug: product.slug, productId: product.id } });
}

export async function getShopProduct(s: Scope, id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { include: { attributes: { orderBy: { attributeLabel: 'asc' } } } },
      images: { orderBy: { position: 'asc' } },
      variants: { orderBy: { price: 'asc' } },
    },
  });
  if (!product || !s.shopIds.includes(product.categoryId)) throw productNotFound();
  return product;
}

// Public: the current slug behind a former one, only for a product on sale (a draft must not be
// discoverable through its old URL).
export async function resolveProductSlug(oldSlug: string): Promise<string> {
  const row = await prisma.productSlugRedirect.findUnique({ where: { oldSlug }, select: { product: { select: { slug: true, status: true } } } });
  if (!row || row.product.status !== PRODUCT_STATUS.ACTIVE) throw productNotFound();
  return row.product.slug;
}
```

Lưu ý lint: nếu `_owner` bị báo unused, dùng `select` thay `include` (đọc `categoryId` riêng) thay vì tắt lint.

- [ ] **Step 4: Chạy, thấy pass**

Run (cd backend): `npm run test:db -- test/db/product.admin.test.ts && npm run typecheck`
Expected: 3 test PASS, typecheck sạch.

---

### Task 3: Route + controller: scope, validate, `/admin/:id`, `/resolve/:slug`

**Files:**
- Modify: `backend/routes/product.route.ts` (toàn bộ khối admin ~40–158)
- Modify: `backend/controllers/product.controller.ts` (`adminList`, `create`, `update`, `updateVariant`, `createStockMovement`, `listStockMovements`, `addImage`, `updateImage`, `removeImage`, `remove`, `addVariant`, `removeVariant`; thêm `adminGet`, `resolve`)
- Modify: `backend/test/db/product.admin.test.ts` (+ HTTP tests), `backend/test/products.validation.test.ts`, `backend/test/db/inventory.test.ts` (bỏ `brand: null` ở 6 lời gọi route sản phẩm: dòng ~56, 74, 88, 276, 279, 290, 296)

**Interfaces:**
- Consumes: Task 2 service.
- Produces HTTP: `GET /api/v1/products/admin/:id` (admin, brand), `GET /api/v1/products/resolve/:slug` → `{ data: { slug } }`; mọi route admin sản phẩm cần `X-Brand-Slug`.

- [ ] **Step 1: Test HTTP thất bại** — thêm vào `test/db/product.admin.test.ts`:

```ts
import { call } from './helpers/http';
import { createAdmin, createUser } from './helpers/factories';

const asAdmin = async () => {
  const admin = await createAdmin();
  return (m: 'get' | 'post' | 'patch' | 'delete', url: string) => call(m, `/api/v1/products${url}`, { token: admin.token });
};

describe('admin product API', () => {
  it('reads a draft by id and refuses visitors, customers and other storefronts', async () => {
    const t = await shop();
    const as = await asAdmin();
    expect((await as('get', `/admin/${t.ours.id}`)).body.data).toMatchObject({ id: t.ours.id, status: 'draft' });
    expect((await call('get', `/api/v1/products/admin/${t.ours.id}`)).status).toBe(401);
    expect((await call('get', `/api/v1/products/admin/${t.ours.id}`, { token: (await createUser()).token })).status).toBe(403);
    expect((await as('get', `/admin/${t.foreign.id}`)).status).toBe(404);
    expect((await as('patch', `/${t.foreign.id}`).send({ name: 'X' })).status).toBe(404);
    expect((await as('delete', `/${t.foreign.id}`)).status).toBe(404);
    expect((await as('patch', `/variants/${t.foreign.variants[0].id}`).send({ price: 1 })).status).toBe(404);
    expect((await as('delete', `/images/${t.img.id}`)).status).toBe(404);
    expect((await as('post', `/${t.foreign.id}/images`).send({ url: 'https://res.cloudinary.com/x/b.jpg' })).status).toBe(404);
  });

  it('lists only the shop products', async () => {
    const t = await shop();
    const as = await asAdmin();
    const ids = (await as('get', '/admin/list')).body.data.map((p: { id: string }) => p.id);
    expect(ids).toEqual([t.ours.id]);
  });

  it('refuses a category of another storefront on create and update', async () => {
    const t = await shop();
    const as = await asAdmin();
    const body = { categoryId: t.gomsu.id, name: 'X', slug: 'x', variants: [{ sku: 'X-1', price: 1 }] };
    expect((await as('post', '').send(body)).body.error.code).toBe('CATEGORY_NOT_FOUND');
    expect((await as('patch', `/${t.ours.id}`).send({ categoryId: t.gomsu.id })).body.error.code).toBe('CATEGORY_NOT_FOUND');
  });

  it('renames a product on sale and redirects the old slug', async () => {
    const t = await shop();
    const as = await asAdmin();
    expect((await as('patch', `/${t.ours.id}`).send({ slug: 'hat-moi', status: 'active' })).status).toBe(200);
    expect((await call('get', '/api/v1/products/resolve/hat-a', { brand: null })).body.data).toEqual({ slug: 'hat-moi' });
    const other = { categoryId: t.leaf.id, name: 'Y', slug: 'hat-a', variants: [{ sku: 'Y-1', price: 1 }] };
    expect((await as('post', '').send(other)).body.error.code).toBe('SLUG_TAKEN');
    expect((await as('patch', `/${t.ours.id}`).send({ slug: 'hat-a' })).status).toBe(200);
    expect((await call('get', '/api/v1/products/resolve/hat-a', { brand: null })).status).toBe(404);
  });
});
```

và vào `test/products.validation.test.ts` (DB-free, chạy trước resolveBrand):

```ts
import { bearer, tokenFor } from './helpers';

describe('admin product validation', () => {
  const admin = bearer(tokenFor('admin'));
  const valid = { categoryId: 'c', name: 'Pate', slug: 'pate', variants: [{ sku: 'P-1', price: 1 }] };
  it.each([
    ['an accented slug', { ...valid, slug: 'pâté' }],
    ['an upper-case slug', { ...valid, slug: 'Pate' }],
    ['a slug with double dashes', { ...valid, slug: 'pate--meo' }],
    ['a blank name', { ...valid, name: '   ' }],
    ['a name over 200 characters', { ...valid, name: 'a'.repeat(201) }],
    ['attributes as an array', { ...valid, attributes: [] }],
    ['a description over 20 000 characters', { ...valid, description: 'a'.repeat(20_001) }],
  ])('refuses %s with 422', async (_label, body) => {
    const res = await request(app).post('/api/v1/products').set(admin).send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a bad slug on update too', async () => {
    const res = await request(app).patch('/api/v1/products/some-id').set(admin).send({ slug: 'Có Dấu' });
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Chạy, thấy fail**

Run (cd backend): `npm test -- test/products.validation.test.ts` và `npm run test:db -- test/db/product.admin.test.ts`
Expected: validation → nhận 409/404/201 thay vì 422; DB → `/admin/:id` 404 (route chưa có), list trả cả `binh-gom`.

- [ ] **Step 3: Route** — trong `product.route.ts`:

```ts
import resolveBrand from '../middlewares/resolveBrand';

const admin = [authenticate, requireRole('admin')];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugRule = (rule: ValidationChain) =>
  rule.isString().isLength({ max: 120 }).matches(SLUG).withMessage('Slug chỉ gồm a-z, 0-9 và dấu - giữa các chữ (tối đa 120 ký tự)');
const nameRule = (rule: ValidationChain) => rule.isString().trim().isLength({ min: 1, max: 200 }).withMessage('Tên sản phẩm từ 1 đến 200 ký tự');
const productFieldRules = () => [
  body('brand').optional({ values: 'null' }).isString().trim().isLength({ max: 100 }).withMessage('Thương hiệu tối đa 100 ký tự'),
  body('description').optional({ values: 'null' }).isString().isLength({ max: 20_000 }).withMessage('Mô tả tối đa 20.000 ký tự'),
  body('status').optional().isIn(PRODUCT_STATUS_VALUES),
  body('attributes').optional().custom((v) => typeof v === 'object' && v !== null && !Array.isArray(v)).withMessage('Thông số không hợp lệ'),
];
```

- Đổi import: `import { body, query, type ValidationChain } from 'express-validator';`
- Thứ tự: `/admin/list`, `/admin/:id`, `/resolve/:slug` khai báo **trước** `/:slug`.
- `router.get('/admin/list', ...admin, resolveBrand, ctrl.adminList);`
- `router.get('/admin/:id', ...admin, resolveBrand, ctrl.adminGet);`
- `router.get('/resolve/:slug', ctrl.resolve);`
- `POST /`: `[...admin, body('categoryId').isString().notEmpty(), nameRule(body('name')), slugRule(body('slug')), ...productFieldRules(), body('variants').isArray({ min: 1 })…(giữ rule cũ), body('variants.*.sku').isString().trim().isLength({ min: 1, max: 64 }), body('variants.*.label').optional().isString().isLength({ max: 100 }), …, validate, resolveBrand]`.
- `PATCH /:id`: `[nameRule(body('name').optional()), slugRule(body('slug').optional()), body('categoryId').optional().isString().notEmpty(), ...productFieldRules(), validate]` rồi `resolveBrand`.
- Mọi route admin còn lại (variants, stock-movements, images, delete): thêm `resolveBrand` ngay trước controller (sau `validate` nếu có).

- [ ] **Step 4: Controller** — thêm `const scope = (req: Request) => ({ shopIds: req.brand?.categoryIds ?? [] });` (cùng chú thích kiểu `category.controller.ts`) và:
  - `adminList`: `where.categoryId = { in: categorySlug ? (await categoryScopeIds(categorySlug)).filter((id) => scope(req).shopIds.includes(id)) : scope(req).shopIds }`.
  - `adminGet`: `sendSuccess(res, await getShopProduct(scope(req), req.params.id as string));`
  - `resolve`: `sendSuccess(res, { slug: await resolveProductSlug(req.params.slug as string) });`
  - `create`: `assertCategoryInShop(scope(req), categoryId)` thay cho `findUnique(category)`; `await assertProductSlugFree(slug)` thay cho kiểm `existingSlug`; `name.trim()`; biến thể nhận `label` → `variantAttributes: v.label ? { label: v.label } : (v.variantAttributes ?? {})`.
  - `update`: `const existing = await productInShop(scope(req), id)`; category → `assertCategoryInShop`; slug đổi → `await assertProductSlugFree(slug, id)` rồi ghi trong `prisma.$transaction(async (tx) => { await changeProductSlug(tx, existing, slug); return tx.product.update(...) })`; slug không đổi → `prisma.product.update` như cũ.
  - `updateVariant`, `removeVariant`, `createStockMovement`, `listStockMovements`: gọi `await variantInShop(scope(req), variantId)` đầu hàm (thay `findUnique` khi đang có).
  - `addImage`, `addVariant`, `remove`: `await productInShop(scope(req), id)`.
  - `updateImage`, `removeImage`: `await imageInShop(scope(req), imageId)`.
  - Thêm `adminGet`, `resolve` vào `export default`.

- [ ] **Step 5: Sửa `inventory.test.ts`** — bỏ `brand: null` ở các lời gọi tới `/api/v1/products...` (sản phẩm của các test đó nằm trong `createBrand()` = cây `petshop`, nên gửi header mặc định là đúng hợp đồng mới). Không đổi assertion nào.

- [ ] **Step 6: Chạy toàn bộ**

Run (cd backend): `npm run typecheck && npm test && npm run test:db`
Expected: tất cả PASS (gồm `authz.test.ts` 401/403 và các test kho / giá cũ).

---

### Task 4: Hàm thuần frontend (TDD)

**Files:**
- Create: `frontend-petshop/lib/adminProducts.ts`, `frontend-petshop/test/adminProducts.test.ts`
- Modify: `frontend-petshop/lib/types.ts` (+ `AdminProduct`)

**Interfaces — Produces:**
```ts
export const PRODUCT_STATUSES: { key: 'active' | 'draft' | 'archived'; label: string }[]; // Đang bán / Nháp / Lưu trữ
export type ProductsQuery = { status: 'active' | 'draft' | 'archived' | null; category: string | null; q: string; page: number };
export const PRODUCTS_PAGE_SIZE = 20;
export function parseProductsQuery(sp: URLSearchParams): ProductsQuery;      // ?trang-thai=&danh-muc=&q=&page=
export function productsHref(q: Partial<ProductsQuery>): string;              // '/admin/san-pham?...' bỏ giá trị mặc định
export function productsApiPath(q: ProductsQuery): string;                    // '/products/admin/list?status=&categorySlug=&search=&page=&pageSize=20'
export function priceRange(variants: { price: number }[]): string;            // '28.000 ₫ – 590.000 ₫' | '28.000 ₫' | '—'
export function stockSummary(variants: { stockQuantity: number; reservedQuantity: number }[]): { stock: number; reserved: number; sellable: number };
export type VariantForm = { id: string | null; label: string; sku: string; price: string; compareAtPrice: string; stock: string; reserved: number };
export type ProductFormValues = { name: string; slug: string; brand: string; description: string; status: string; categoryId: string; attributes: Record<string, string>; variants: VariantForm[] };
export function validateProductForm(v: ProductFormValues, mode: 'create' | 'edit'): FieldErrors; // keys: name, slug, categoryId, variants.N.sku|price|compareAtPrice|stock
export function variantChanges(before: VariantForm[], after: VariantForm[]): { id: string; body: { label?: string; price?: number; compareAtPrice?: number | null } }[];
export function categoryPathOptions(rows: AdminCategory[], rootSlug: string): { id: string; label: string }[]; // "Chó › Thức ăn › Hạt cho chó", cha trước con
export function attributeValues(attrs: Record<string, string>, defs: { attributeKey: string; attributeType: string }[]): Record<string, string | number>; // bỏ ô trống, number → Number
```
`slugify` dùng lại từ `lib/adminCategories.ts` (cắt 80 ký tự — nằm trong giới hạn 120).

- [ ] **Step 1: Test thất bại** (`test/adminProducts.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import {
  attributeValues, categoryPathOptions, parseProductsQuery, priceRange, productsApiPath, productsHref, stockSummary, validateProductForm, variantChanges,
  type ProductFormValues, type VariantForm,
} from '../lib/adminProducts';
import type { AdminCategory } from '../lib/types';

const v = (over: Partial<VariantForm> = {}): VariantForm => ({ id: 'v1', label: 'Gói 1kg', sku: 'HAT-1', price: '120000', compareAtPrice: '', stock: '5', reserved: 0, ...over });
const form = (over: Partial<ProductFormValues> = {}): ProductFormValues => ({
  name: 'Hạt cho chó', slug: 'hat-cho-cho', brand: '', description: '', status: 'draft', categoryId: 'c1', attributes: {}, variants: [v({ id: null })], ...over,
});

describe('products query', () => {
  it('reads and writes the URL, leaving defaults out', () => {
    const q = parseProductsQuery(new URLSearchParams('trang-thai=draft&danh-muc=cho&q=%20pate%20&page=2'));
    expect(q).toEqual({ status: 'draft', category: 'cho', q: 'pate', page: 2 });
    expect(productsHref({ ...q, page: 1 })).toBe('/admin/san-pham?trang-thai=draft&danh-muc=cho&q=pate');
    expect(productsHref({ status: null, category: null, q: '', page: 1 })).toBe('/admin/san-pham');
    expect(productsApiPath(q)).toBe('/products/admin/list?status=draft&categorySlug=cho&search=pate&page=2&pageSize=20');
  });

  it('falls back on unknown or broken values', () => {
    expect(parseProductsQuery(new URLSearchParams('trang-thai=xoa&page=-3'))).toEqual({ status: null, category: null, q: '', page: 1 });
  });

  it('does not send a one-letter search (the API needs 2 characters)', () => {
    expect(productsApiPath({ status: null, category: null, q: 'a', page: 1 })).toBe('/products/admin/list?page=1&pageSize=20');
  });
});

describe('price and stock', () => {
  it('shows the cheapest and dearest variant', () => {
    expect(priceRange([{ price: 590000 }, { price: 28000 }])).toBe('28.000 ₫ – 590.000 ₫');
    expect(priceRange([{ price: 28000 }, { price: 28000 }])).toBe('28.000 ₫');
    expect(priceRange([])).toBe('—');
  });

  it('adds up stock and what can still be sold', () => {
    expect(stockSummary([{ stockQuantity: 30, reservedQuantity: 2 }, { stockQuantity: 4, reservedQuantity: 0 }])).toEqual({ stock: 34, reserved: 2, sellable: 32 });
  });
});

describe('validateProductForm', () => {
  it('accepts a complete product', () => {
    expect(validateProductForm(form(), 'create')).toEqual({});
  });

  it('points at each wrong field', () => {
    const e = validateProductForm(form({ name: ' ', slug: 'Có Dấu', categoryId: '', variants: [v({ id: null, sku: '', price: '12.5', compareAtPrice: '1000', stock: '-1' })] }), 'create');
    expect(Object.keys(e).sort()).toEqual(['categoryId', 'name', 'slug', 'variants.0.compareAtPrice', 'variants.0.price', 'variants.0.sku', 'variants.0.stock'].sort());
  });

  it('refuses two variants with the same SKU', () => {
    expect(validateProductForm(form({ variants: [v({ id: null }), v({ id: null })] }), 'create')['variants.1.sku']).toBeDefined();
  });

  it('does not check stock when editing (it is read-only there)', () => {
    expect(validateProductForm(form({ variants: [v({ stock: '' })] }), 'edit')).toEqual({});
  });
});

describe('variantChanges', () => {
  it('sends only the existing variants whose label or prices changed', () => {
    const before = [v(), v({ id: 'v2', sku: 'HAT-2' })];
    const after = [v({ price: '125000' }), v({ id: 'v2', sku: 'HAT-2' }), v({ id: null, sku: 'NEW' })];
    expect(variantChanges(before, after)).toEqual([{ id: 'v1', body: { price: 125000 } }]);
    expect(variantChanges([v()], [v({ label: 'Gói 2kg', compareAtPrice: '' })])).toEqual([{ id: 'v1', body: { label: 'Gói 2kg' } }]);
    expect(variantChanges([v({ compareAtPrice: '150000' })], [v({ compareAtPrice: '' })])).toEqual([{ id: 'v1', body: { compareAtPrice: null } }]);
  });
});

describe('category picker', () => {
  const c = (id: string, slug: string, name: string, parentId: string | null, sortOrder = 0) =>
    ({ id, slug, name, parentId, sortOrder, _count: { products: 0, blogPosts: 0, galleryItems: 0, children: 0 } }) as unknown as AdminCategory;
  it('labels every shop category with its full path, parents first', () => {
    const rows = [c('r', 'petshop', 'Shop', null), c('a', 'cho', 'Chó', 'r'), c('b', 'cho-thuc-an', 'Thức ăn', 'a'), c('d', 'hat', 'Hạt cho chó', 'b'), c('g', 'gomsu', 'Gốm', null)];
    expect(categoryPathOptions(rows, 'petshop')).toEqual([
      { id: 'a', label: 'Chó' }, { id: 'b', label: 'Chó › Thức ăn' }, { id: 'd', label: 'Chó › Thức ăn › Hạt cho chó' },
    ]);
  });
});

describe('attributeValues', () => {
  it('drops empty fields and stores numbers as numbers', () => {
    const defs = [{ attributeKey: 'weight', attributeType: 'number' }, { attributeKey: 'origin', attributeType: 'text' }, { attributeKey: 'flavor', attributeType: 'text' }];
    expect(attributeValues({ weight: '1.5', origin: ' Thái Lan ', flavor: '' }, defs)).toEqual({ weight: 1.5, origin: 'Thái Lan' });
  });
});
```

- [ ] **Step 2: Chạy, thấy fail** — Run (cd frontend-petshop): `npx vitest run test/adminProducts.test.ts` → FAIL (module chưa có).

- [ ] **Step 3: Viết `lib/adminProducts.ts`**

```ts
import { buildAdminTree, type AdminNode } from './adminCategories';
import type { FieldErrors } from './forms';
import { formatVnd } from './storefront';
import type { AdminCategory } from './types';

// Rules of the /admin/san-pham screens (test/adminProducts.test.ts). The backend checks the same
// limits (routes/product.route.ts); these show mistakes on the field before a round trip.

export const PRODUCT_STATUSES = [
  { key: 'active', label: 'Đang bán' },
  { key: 'draft', label: 'Nháp' },
  { key: 'archived', label: 'Lưu trữ' },
] as const;
type Status = (typeof PRODUCT_STATUSES)[number]['key'];

export type ProductsQuery = { status: Status | null; category: string | null; q: string; page: number };
export const PRODUCTS_PAGE_SIZE = 20;
const MAX_PRICE = 2_000_000_000;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isStatus = (s: string | null): s is Status => PRODUCT_STATUSES.some((x) => x.key === s);

export function parseProductsQuery(sp: URLSearchParams): ProductsQuery {
  const status = sp.get('trang-thai');
  const page = Number(sp.get('page'));
  return {
    status: isStatus(status) ? status : null,
    category: sp.get('danh-muc')?.trim() || null,
    q: (sp.get('q') ?? '').trim(),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function productsHref(q: Partial<ProductsQuery>): string {
  const sp = new URLSearchParams();
  if (q.status) sp.set('trang-thai', q.status);
  if (q.category) sp.set('danh-muc', q.category);
  if (q.q?.trim()) sp.set('q', q.q.trim());
  if (q.page && q.page > 1) sp.set('page', String(q.page));
  const s = sp.toString();
  return s ? `/admin/san-pham?${s}` : '/admin/san-pham';
}

// The admin list API searches accent-free names and needs at least 2 characters.
export function productsApiPath(q: ProductsQuery): string {
  const sp = new URLSearchParams();
  if (q.status) sp.set('status', q.status);
  if (q.category) sp.set('categorySlug', q.category);
  if (q.q.length >= 2) sp.set('search', q.q);
  sp.set('page', String(q.page));
  sp.set('pageSize', String(PRODUCTS_PAGE_SIZE));
  return `/products/admin/list?${sp}`;
}

export function priceRange(variants: { price: number }[]): string {
  if (variants.length === 0) return '—';
  const prices = variants.map((x) => x.price);
  const [lo, hi] = [Math.min(...prices), Math.max(...prices)];
  return lo === hi ? formatVnd(lo) : `${formatVnd(lo)} – ${formatVnd(hi)}`;
}

export function stockSummary(variants: { stockQuantity: number; reservedQuantity: number }[]) {
  const stock = variants.reduce((s, x) => s + x.stockQuantity, 0);
  const reserved = variants.reduce((s, x) => s + x.reservedQuantity, 0);
  return { stock, reserved, sellable: stock - reserved };
}

export type VariantForm = { id: string | null; label: string; sku: string; price: string; compareAtPrice: string; stock: string; reserved: number };
export type ProductFormValues = {
  name: string; slug: string; brand: string; description: string; status: string; categoryId: string;
  attributes: Record<string, string>; variants: VariantForm[];
};

// "120.000" and "120000" are both accepted (owners type dots); null when not a whole number in range.
export function parseMoney(text: string): number | null {
  const digits = text.replace(/[.\s]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return n <= MAX_PRICE ? n : null;
}

export function validateProductForm(v: ProductFormValues, mode: 'create' | 'edit'): FieldErrors {
  const e: FieldErrors = {};
  const name = v.name.trim();
  if (!name || name.length > 200) e.name = 'Nhập tên sản phẩm (tối đa 200 ký tự)';
  if (!SLUG.test(v.slug) || v.slug.length > 120) e.slug = 'Slug chỉ gồm a-z, 0-9 và dấu - giữa các chữ';
  if (!v.categoryId) e.categoryId = 'Chọn danh mục';
  const seen = new Set<string>();
  v.variants.forEach((x, i) => {
    const sku = x.sku.trim();
    if (!sku || sku.length > 64) e[`variants.${i}.sku`] = 'Nhập SKU (tối đa 64 ký tự)';
    else if (seen.has(sku)) e[`variants.${i}.sku`] = 'SKU bị trùng';
    seen.add(sku);
    const price = parseMoney(x.price);
    if (price === null) e[`variants.${i}.price`] = 'Giá là số nguyên ≥ 0';
    if (x.compareAtPrice.trim()) {
      const was = parseMoney(x.compareAtPrice);
      if (was === null || (price !== null && was <= price)) e[`variants.${i}.compareAtPrice`] = 'Giá gạch phải lớn hơn giá bán';
    }
    if (mode === 'create' && x.id === null && !/^\d+$/.test(x.stock.trim())) e[`variants.${i}.stock`] = 'Tồn đầu là số nguyên ≥ 0';
  });
  return e;
}

export function variantChanges(before: VariantForm[], after: VariantForm[]) {
  const out: { id: string; body: { label?: string; price?: number; compareAtPrice?: number | null } }[] = [];
  for (const a of after) {
    const b = a.id && before.find((x) => x.id === a.id);
    if (!a.id || !b) continue;
    const body: { label?: string; price?: number; compareAtPrice?: number | null } = {};
    if (a.label.trim() !== b.label.trim()) body.label = a.label.trim();
    if (parseMoney(a.price) !== parseMoney(b.price)) body.price = parseMoney(a.price) ?? 0;
    const was = (t: string) => (t.trim() ? parseMoney(t) : null);
    if (was(a.compareAtPrice) !== was(b.compareAtPrice)) body.compareAtPrice = was(a.compareAtPrice);
    if (Object.keys(body).length > 0) out.push({ id: a.id, body });
  }
  return out;
}

export function categoryPathOptions(rows: AdminCategory[], rootSlug: string): { id: string; label: string }[] {
  const walk = (nodes: AdminNode[], prefix: string): { id: string; label: string }[] =>
    nodes.flatMap((n) => {
      const label = prefix ? `${prefix} › ${n.name}` : n.name;
      return [{ id: n.id, label }, ...walk(n.children, label)];
    });
  return walk(buildAdminTree(rows, rootSlug).nodes, '');
}

export function attributeValues(attrs: Record<string, string>, defs: { attributeKey: string; attributeType: string }[]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const d of defs) {
    const raw = (attrs[d.attributeKey] ?? '').trim();
    if (!raw) continue;
    const n = Number(raw.replace(',', '.'));
    out[d.attributeKey] = d.attributeType === 'number' && Number.isFinite(n) ? n : raw;
  }
  return out;
}
```

Kiểm tra `formatVnd` trả `'28.000 ₫'` (khoảng trắng hẹp / thường) — nếu chuỗi thật khác, sửa **kỳ vọng trong test** theo đúng output `formatVnd` hiện có ở `test/storefront.test.ts` (đó là định dạng chuẩn của dự án), không đổi `formatVnd`.

`types.ts`: thêm
```ts
// GET /products/admin/:id — any status, with the category's spec fields.
export interface AdminProduct extends Omit<Product, 'category'> {
  categoryId: string;
  category: Category & { attributes: (CategoryAttribute & { attributeType: string })[] };
}
```

- [ ] **Step 4: Chạy, thấy pass** — `npx vitest run test/adminProducts.test.ts && npm run typecheck` → PASS.

---

### Task 5: Storefront 308 cho slug cũ

**Files:**
- Modify: `frontend-petshop/services/catalog.ts` (sau `resolveCategorySlug` ~92)
- Modify: `frontend-petshop/app/san-pham/[slug]/page.tsx` (`ProductPage`, dòng `if (!product) notFound();` ~53)

- [ ] **Step 1: Service**

```ts
// Current slug of a renamed product on sale (ADR-018), or null when `slug` was never a product slug.
export async function resolveProductSlug(slug: string): Promise<string | null> {
  try {
    const { data } = await apiFetch<{ slug: string }>(`/products/resolve/${encodeURIComponent(slug)}`, cached(['products']));
    return data.slug;
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) return null;
    throw err;
  }
}
```

- [ ] **Step 2: Page** — import `permanentRedirect`, `resolveProductSlug`, `productPath` (đã có); thay:

```ts
  if (!product) {
    const moved = await resolveProductSlug(slug);
    if (moved) permanentRedirect(productPath(moved));
    notFound();
  }
```

- [ ] **Step 3: Kiểm** — `npm run typecheck && npm run lint`; kiểm 308 thật ở Task 9 (cần backend chạy).

---

### Task 6: API helper + danh sách `/admin/san-pham`

**Files:**
- Create: `components/admin/products/productApi.ts`, `ProductsFilters.tsx`, `ProductsList.tsx`, `ProductsManager.tsx`, `app/admin/san-pham/page.tsx`
- Modify: `lib/adminNav.ts:10` (`ready: true`), `test/adminNav.test.ts` nếu nó khẳng định danh sách mục chưa sẵn sàng (cập nhật kỳ vọng vì hành vi đổi có chủ đích)

**Interfaces:**
- Produces: `productApi<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>>` (gọi `authFetch('/products' + path)` với `X-Brand-Slug`), `refreshProducts(): Promise<void>` (= `revalidateStorefront(['products', 'categories'])`).

- [ ] **Step 1: `productApi.ts`**

```ts
import { authFetch } from '../../../lib/adminAuth';
import { revalidateStorefront } from '../../../lib/adminRevalidate';
import { BRAND_SLUG } from '../../../lib/site';
import type { ApiEnvelope } from '../../../lib/types';

// Product admin calls carry X-Brand-Slug: the backend answers 404 for anything outside this shop.
export function productApi<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const headers = new Headers(init.headers);
  headers.set('X-Brand-Slug', BRAND_SLUG);
  return authFetch<T>(`/products${path}`, { ...init, headers });
}

// Product, category and home pages (featured products) all show product data.
export const refreshProducts = () => revalidateStorefront(['products', 'categories']);
```
Kiểm `authFetch` có tự đặt `Content-Type: application/json` khi body là chuỗi hay không (đọc `lib/adminAuth.ts:61`); nếu không, `productApi` đặt nó khi `typeof init.body === 'string'`.

- [ ] **Step 2: `ProductsFilters.tsx`** — client: `<select>` trạng thái (Mọi trạng thái + `PRODUCT_STATUSES`), `<select>` danh mục (`categoryPathOptions` từ `GET /categories/admin/list` qua `categoryApi`, value = slug), ô `type="search"` debounce 300 ms (state cục bộ + `setTimeout` trong handler, không setState trong effect), nút "+ Thêm sản phẩm" (`Link` tới `/admin/san-pham/moi`, `min-h-11`). Gọi `onChange(patch, 'push' | 'replace')` như `OrdersFilters` (search → `replace`).

- [ ] **Step 3: `ProductsList.tsx`** — props `rows: Product[]`, `categoryLabel: (id: string) => string`:
  - `< md`: `<ul>` thẻ `Link` toàn thẻ tới `/admin/san-pham/<id>`: ảnh 56px (`next/image` `imageSrc(url)` hoặc 🐾), tên (`break-words`), slug `text-xs text-muted`, nhãn trạng thái (tone: active=green, draft=gray, archived=amber — dùng `STATUS_TONE_CLASSES`), khoảng giá `tabular-nums`, "Tồn X / giữ Y" + nhãn "Hết hàng" khi `sellable <= 0`.
  - `≥ md`: `<table>` cột Sản phẩm · Danh mục · Giá · Tồn · Trạng thái · nút "Sửa" (`min-h-11`).

- [ ] **Step 4: `ProductsManager.tsx`** — theo mẫu `OrdersManager` (URL là state, effect tải theo key URL với cờ `active`, state chỉ set trong promise callback): tải danh sách (`productApi<Product[]>(productsApiPath(q).replace('/products', ''))`) + danh mục 1 lần; skeleton, lỗi + "Thử lại", rỗng ("Chưa có sản phẩm nào." / "Không tìm thấy sản phẩm khớp «q».") kèm link thêm sản phẩm; `Pagination` với `productsHref`.

- [ ] **Step 5: Trang** `app/admin/san-pham/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProductsManager } from '../../../components/admin/products/ProductsManager';

export const metadata: Metadata = { title: 'Sản phẩm' };

// useSearchParams inside the manager needs a Suspense boundary (Next 16).
export default function AdminProductsPage() {
  return (
    <Suspense fallback={<div aria-busy="true" className="h-48 animate-pulse rounded-card bg-surface" />}>
      <ProductsManager />
    </Suspense>
  );
}
```

- [ ] **Step 6: Kiểm** — `npm run typecheck && npm run lint && npm test` → PASS.

---

### Task 7: Form tạo sản phẩm `/admin/san-pham/moi`

**Files:**
- Create: `components/admin/products/MarkdownField.tsx`, `AttributeFields.tsx`, `VariantRows.tsx`, `ImageList.tsx`, `ProductForm.tsx`, `app/admin/san-pham/moi/page.tsx`

**Interfaces:**
- `ProductForm` props: `{ mode: 'create' } | { mode: 'edit'; product: AdminProduct; onReload: () => void }`.
- `VariantRows` props: `{ mode; rows: VariantForm[]; errors: FieldErrors; onChange(rows): void; onAdd?(row): Promise<string | null>; onRemove?(id): Promise<string | null> }` (edit: thêm / xoá gọi API, trả message lỗi hoặc null).
- `ImageList` props: `{ images: { id: string | null; url: string; altText: string }[]; onChange(next): void; immediate?: { add(url): Promise<...>; patch(id, body); remove(id) } }`.

- [ ] **Step 1: `MarkdownField.tsx`** — 2 nút tab "Soạn" / "Xem trước" (`aria-pressed`, `min-h-11`), textarea `name="description"` `rows={10}` `text-base`, xem trước = `<div className="prose…" dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} />` (cùng `renderMarkdown` đã sanitize bằng DOMPurify, như trang sản phẩm).

- [ ] **Step 2: `AttributeFields.tsx`** — với mỗi `attributes` của danh mục đang chọn: `TextField` `name={'attr-' + key}`, `inputMode="decimal"` khi `attributeType === 'number'`; không có thông số → "Danh mục này chưa có thông số." Giữ giá trị theo key khi đổi danh mục (state nằm ở `ProductForm`).

- [ ] **Step 3: `VariantRows.tsx`** — mỗi dòng (thẻ trên mobile, lưới 5–6 cột từ `md`): Nhãn, SKU (sửa được khi `id === null`, khoá khi đã lưu), Giá (`inputMode="numeric"`), Giá gạch, Tồn (tạo: ô nhập; sửa: chữ "34 (giữ 2)"), nút "Xoá dòng" (`min-h-11`, hỏi lại với dòng đã lưu, ẩn khi chỉ còn 1 dòng). Nút "+ Thêm biến thể". Lỗi dưới ô theo key `variants.N.field`.

- [ ] **Step 4: `ImageList.tsx`** — tải ảnh: `authFetch<{ url: string }>('/uploads/image', { method: 'POST', body: FormData('image', file) })` (như `ImageField`), ảnh mới thêm cuối; mỗi ảnh: thumbnail, "Ảnh bìa" cho vị trí 0, ô alt (`TextField`), ↑ ↓ (`aria-label`), Xoá (hỏi lại). `immediate` có mặt (sửa) → gọi API ngay và cập nhật danh sách theo kết quả; không có (tạo) → chỉ đổi state.

- [ ] **Step 5: `ProductForm.tsx`** (mode create trước):
  - Bố cục `grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]`, cột bên đứng sau form trên mobile.
  - Tên → slug tự sinh bằng `slugify` cho tới khi người dùng sửa ô slug (`slugTouched`).
  - Danh mục `<select>` từ `categoryPathOptions`; đổi → nạp `attributes` của danh mục đó (từ `GET /categories` công khai đã có `attributes`, hoặc `categoryApi('/admin/list')` nếu có field — đọc `listShopCategories` để chắc).
  - Submit: `validateProductForm` → lỗi thì `focusFirstError`; hợp lệ → `POST ''` body `{ categoryId, name, slug, brand: brand || null, description: description || null, status, attributes: attributeValues(...), variants: rows.map(r => ({ sku, label, price, compareAtPrice, stockQuantity: Number(stock) })), images: images.map((i, n) => ({ url, altText, position: n })) }`.
  - 422 → `fieldErrors(details)` (key `variants[0].sku` của express-validator → đổi sang `variants.0.sku`: thêm `normalizeErrorKeys` nhỏ trong `adminProducts.ts` + test 1 dòng), 409 `SLUG_TAKEN` → lỗi ô slug, `SKU_TAKEN` → thông báo đầu form có SKU.
  - Thành công → `refreshProducts()` rồi `router.replace('/admin/san-pham/' + id)`.
  - Mobile: `StickyActionBar` chứa nút Lưu; form `max-md:pb-24`.
  - Nút gửi khoá khi đang gửi (`Đang lưu…`).

- [ ] **Step 6: Trang `moi/page.tsx`** — `metadata.title = 'Thêm sản phẩm'`, `<h1>`, `<ProductForm mode="create" />`.

- [ ] **Step 7: Kiểm** — `npm run typecheck && npm run lint && npm test` → PASS.

---

### Task 8: Form sửa `/admin/san-pham/[id]`

**Files:**
- Modify: `components/admin/products/ProductForm.tsx`
- Create: `app/admin/san-pham/[id]/page.tsx`, `components/admin/products/ProductEditor.tsx` (tải `GET /admin/:id`, loading / 404 "Không tìm thấy sản phẩm" + link về danh sách / lỗi + Thử lại, rồi render `ProductForm mode="edit"`)

- [ ] **Step 1: Giá trị ban đầu** — từ `AdminProduct`: biến thể → `VariantForm` (`price: String(price)`, `stock: String(stockQuantity)`, `reserved`), thông số → chuỗi.
- [ ] **Step 2: Lưu** — tuần tự, dừng ở lỗi đầu tiên và hiện lỗi:
  1. `PATCH /:id` chỉ các field đổi (`slug` chỉ khi khác bản gốc).
  2. Với mỗi `variantChanges(before, after)`: `PATCH /variants/:id`.
  3. `refreshProducts()`; thông báo "Đã lưu"; `onReload()`.
- [ ] **Step 3: Cảnh báo slug** — product `active` và slug khác bản gốc → dòng `role="status"` dưới ô slug: "URL cũ sẽ tự chuyển sang URL mới."
- [ ] **Step 4: Biến thể ngay** — "+ Thêm biến thể" mở dòng mới, nút "Lưu biến thể" của dòng đó gọi `POST /:id/variants` `{ sku, label, price, compareAtPrice, stockQuantity }`; xoá dòng đã lưu → hỏi lại → `DELETE /variants/:id` (400 `LAST_VARIANT` → hiện message).
- [ ] **Step 5: Ảnh ngay** — `ImageList` với `immediate`: add `POST /:id/images`, ↑↓ đổi `position` của 2 ảnh bằng 2 lời gọi `PATCH /images/:id`, alt lưu khi rời ô (`onBlur`), xoá `DELETE /images/:id`; mỗi thao tác xong gọi `refreshProducts()`.
- [ ] **Step 6: Xoá sản phẩm** — ở cột bên, chữ đỏ; hỏi lại (`window.confirm` như trang đơn hàng) với câu: "Xoá vĩnh viễn «tên»? Sản phẩm đã có người mua nên chuyển sang Lưu trữ thay vì xoá."; `DELETE /:id` → `refreshProducts()` → `router.replace('/admin/san-pham')`.
- [ ] **Step 7: Trang** — `[id]/page.tsx`: `params: Promise<{ id: string }>`, `metadata.title = 'Sửa sản phẩm'`, render `ProductEditor id={id}`.
- [ ] **Step 8: Kiểm** — `npm run typecheck && npm run lint && npm test && npm run build` → PASS.

---

### Task 9: Kiểm tra thật + tài liệu

- [ ] **Step 1: ADR-018** vào `docs/DECISIONS.md`: Bối cảnh (đổi slug sản phẩm làm hỏng link đã chia sẻ / đã index; API admin sản phẩm chưa giới hạn theo shop) · Quyết định (bảng `ProductSlugRedirect`, `GET /products/resolve/:slug` chỉ cho sản phẩm đang bán, 308 ở storefront; mọi route admin sản phẩm qua `resolveBrand`) · Lý do · Phương án đã loại (redirect trong `next.config` — cần build lại mỗi lần đổi; giữ slug bất biến — chủ shop cần sửa chính tả) · Hệ quả (client admin phải gửi `X-Brand-Slug`; migration chỉ thêm bảng, rollback `DROP TABLE`).
- [ ] **Step 2: Người dùng chạy migration DB dev** (Claude đưa lệnh): `cd backend && npx prisma migrate deploy`; dán kết quả.
- [ ] **Step 3: Chạy app** (backend + frontend production build như thường lệ) và kiểm trên trình duyệt bằng CDP: tạo SP Nháp 2 biến thể + 2 ảnh; sửa giá; thêm / xoá biến thể; đổi slug SP đang bán → `curl -sI http://localhost:3000/san-pham/<slug-cũ>` = `308` + `location` slug mới; Lưu trữ rồi xoá SP thử; 320 / 390 / 768 / 1280 + zoom 200%: không cuộn ngang, nút ≥ 44px.
- [ ] **Step 4: Tổng** — backend `npm run typecheck && npm test && npm run test:db`; frontend `npm run typecheck && npm run lint && npm test && npm run build`.
- [ ] **Step 5: PROGRESS.md** — mục mới 2026-11-04 (Đã làm / File thay đổi / Dang dở: production cần migrate 20261104120000 / Bước tiếp: D2).
- [ ] **Step 6: Đề xuất commit** (chờ "ok"), tách 2 commit:
  - `add product slug redirects and shop scope to the admin product api` (backend + migration)
  - `add admin products list and editor` (frontend)
