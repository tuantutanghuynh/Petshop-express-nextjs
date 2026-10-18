import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../services/prisma';
import ApiError from '../utils/ApiError';
import asyncHandler from '../utils/asyncHandler';
import { sendSuccess } from '../utils/ApiResponse';
import { parsePagination } from '../utils/pagination';
import { PRODUCT_STATUS } from '../constants/product';
import { STOCK_MOVEMENT_TYPE } from '../constants/inventory';
import { adjustStockByAdmin, recordOpening } from '../services/inventory.service';

// Every read and write path for products, serving both the storefront and the admin dashboard.
// A product is a catalogue entry; the sellable things with a price and a stock count are its
// variants. Public listings expose only `active` products, and like blog and gallery they can be
// scoped to one brand's category tree because a single backend serves several storefronts.

// Returns the paginated list of products a visitor may see, ordered newest first, with pagination
// counters in `meta`. Only `active` products appear — drafts and archived rows stay hidden without
// a separate permission check, because the filter lives in the query itself. `pageSize` is capped
// at 50 so a crafted request cannot pull the whole catalogue in one call. The category filter
// expands to include child categories, otherwise a product filed under "Bình gốm" would be missing
// from the parent brand's listing.
export const list = asyncHandler(async (req: Request, res: Response) => {
  const { categorySlug } = req.query;
  const { page, take, skip } = parsePagination(req.query, 12, 50);

  const where: Prisma.ProductWhereInput = { status: PRODUCT_STATUS.ACTIVE };

  if (categorySlug && typeof categorySlug === 'string') {
    const category = await prisma.category.findUnique({ where: { slug: categorySlug } });
    if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục');
    const children = await prisma.category.findMany({ where: { parentId: category.id } });
    const categoryIds = [category.id, ...children.map((c) => c.id)];
    where.categoryId = { in: categoryIds };
  }

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        category: true,
        images: { orderBy: { position: 'asc' } },
        variants: { orderBy: { price: 'asc' } },
      },
      skip,
      take,
    }),
    prisma.product.count({ where }),
  ]);

  sendSuccess(res, items, { page, pageSize: take, total });
});

// Fetches one product by slug for the public detail page, including its category, images and
// variants. A product that is not `active` is reported as 404 rather than 403, so an outsider
// cannot probe the catalogue to learn that an unreleased product exists at a given URL. Variants
// come back sorted by price so the storefront can show "từ <giá thấp nhất>" without sorting again,
// and images by `position` so the admin's chosen order is what visitors see.
export const getBySlug = asyncHandler(async (req: Request, res: Response) => {
  const slug = req.params.slug as string;
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      category: { include: { attributes: { orderBy: { attributeLabel: 'asc' } } } },
      images: { orderBy: { position: 'asc' } },
      variants: { orderBy: { price: 'asc' } },
    },
  });

  if (!product || product.status !== PRODUCT_STATUS.ACTIVE) {
    throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm');
  }

  sendSuccess(res, product);
});

// Admin-only listing that, unlike `list`, also returns drafts and archived products so the editor
// can find work in progress. It supports a case-insensitive `search` on the name and an optional
// `status` filter. The `categorySlug` filter matters just as much here as on the public side:
// leaving it out is what would let one brand's dashboard display the other brand's catalogue.
export const adminList = asyncHandler(async (req: Request, res: Response) => {
  const { status, categorySlug, search } = req.query;
  const { page, take, skip } = parsePagination(req.query, 20, 100);

  const where: Prisma.ProductWhereInput = {};
  if (status && typeof status === 'string') where.status = status;
  if (search && typeof search === 'string') where.name = { contains: search, mode: 'insensitive' };

  if (categorySlug && typeof categorySlug === 'string') {
    const category = await prisma.category.findUnique({ where: { slug: categorySlug } });
    if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục');
    const children = await prisma.category.findMany({ where: { parentId: category.id } });
    const categoryIds = [category.id, ...children.map((c) => c.id)];
    where.categoryId = { in: categoryIds };
  }

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        category: true,
        images: { orderBy: { position: 'asc' } },
        variants: { orderBy: { price: 'asc' } },
      },
      skip,
      take,
    }),
    prisma.product.count({ where }),
  ]);

  sendSuccess(res, items, { page, pageSize: take, total });
});

// Creates a product together with its variants and images in a single transaction, answering 201
// with the full row. All three are written at once because a product with no variant has nothing
// to sell — leaving it half-created would put a broken entry in the catalogue. The slug and every
// SKU are checked for collisions before writing so a duplicate returns a clear 409 instead of a raw
// Prisma constraint error, and `variantKey` falls back to the SKU so the compound unique index on
// (productId, variantKey) always has a value to work with.
export const create = asyncHandler(async (req: Request, res: Response) => {
  const {
    categoryId,
    name,
    slug,
    description,
    brand,
    status,
    attributes,
    variants = [],
    images = [],
  } = req.body;

  const existingSlug = await prisma.product.findUnique({ where: { slug } });
  if (existingSlug) throw new ApiError(409, 'SLUG_TAKEN', 'Slug đã tồn tại, vui lòng chọn slug khác');

  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục');

  const skus = variants.map((v: { sku: string }) => v.sku);
  if (new Set(skus).size !== skus.length) {
    throw new ApiError(422, 'DUPLICATE_SKU', 'Các biến thể không được trùng SKU');
  }
  const takenSku = await prisma.productVariant.findFirst({ where: { sku: { in: skus } } });
  if (takenSku) throw new ApiError(409, 'SKU_TAKEN', `SKU đã tồn tại: ${takenSku.sku}`);

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        categoryId,
        name,
        slug,
        description,
        brand,
        status: status || PRODUCT_STATUS.DRAFT,
        attributes: attributes ?? {},
      },
    });

    if (variants.length) {
      await tx.productVariant.createMany({
        data: variants.map((v: any) => ({
          productId: created.id,
          sku: v.sku,
          price: v.price,
          compareAtPrice: v.compareAtPrice ?? null,
          stockQuantity: v.stockQuantity ?? 0,
          variantAttributes: v.variantAttributes ?? {},
          variantKey: v.variantKey || v.sku,
          imageUrl: v.imageUrl ?? null,
        })),
      });
      // Opening balance for each variant: the ledger starts at the stock it was created with.
      const createdVariants = await tx.productVariant.findMany({ where: { productId: created.id }, select: { id: true } });
      for (const v of createdVariants) await recordOpening(tx, v.id, req.user?.id ?? null);
    }

    if (images.length) {
      await tx.productImage.createMany({
        data: images.map((img: any, index: number) => ({
          productId: created.id,
          url: img.url,
          altText: img.altText ?? null,
          position: img.position ?? index,
        })),
      });
    }

    return tx.product.findUnique({
      where: { id: created.id },
      include: {
        category: true,
        images: { orderBy: { position: 'asc' } },
        variants: { orderBy: { price: 'asc' } },
      },
    });
  });

  sendSuccess(res, product, null, 201);
});

// Updates a product's own fields, accepting a partial body so the admin form can send only what
// changed. Fields left `undefined` are stripped before the write, because handing them to Prisma
// would overwrite good data with null. A changed slug is checked against other rows first — note
// the `slug !== existing.slug` guard, without which saving a product untouched would collide with
// itself and always fail. Variants and images are deliberately not editable here: they carry stock
// and price, and mixing them into a general-purpose update is how a careless request silently
// wipes inventory. They get their own endpoints later.
export const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm');

  const { categoryId, name, slug, description, brand, status, attributes } = req.body;

  if (slug && slug !== existing.slug) {
    const takenSlug = await prisma.product.findUnique({ where: { slug } });
    if (takenSlug) throw new ApiError(409, 'SLUG_TAKEN', 'Slug đã tồn tại, vui lòng chọn slug khác');
  }

  if (categoryId && categoryId !== existing.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục');
  }

  const data: Prisma.ProductUpdateInput = {};
  if (categoryId) data.category = { connect: { id: categoryId } };
  if (name !== undefined) data.name = name;
  if (slug !== undefined) data.slug = slug;
  if (description !== undefined) data.description = description;
  if (brand !== undefined) data.brand = brand;
  if (status !== undefined) data.status = status;
  if (attributes !== undefined) data.attributes = attributes;

  const product = await prisma.product.update({
    where: { id },
    data,
    include: {
      category: true,
      images: { orderBy: { position: 'asc' } },
      variants: { orderBy: { price: 'asc' } },
    },
  });

  sendSuccess(res, product);
});

// Updates one variant's price and stock. This lives apart from `update` on purpose: those fields
// are the two most dangerous in the catalogue, and keeping them out of the general-purpose product
// endpoint means a partial form submission can never blank out inventory as a side effect.
export const updateVariant = asyncHandler(async (req: Request, res: Response) => {
  const variantId = req.params.variantId as string;
  const { price, compareAtPrice, label } = req.body;

  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) throw new ApiError(404, 'VARIANT_NOT_FOUND', 'Không tìm thấy biến thể');

  // Stock is NOT editable here any more (the route rejects stockQuantity): an absolute overwrite
  // erased every sale made between the admin reading the number and saving it. Stock changes go
  // through POST /products/variants/:id/stock-movements, by delta or by physical count (ADR-007).
  const data: Prisma.ProductVariantUpdateInput = {};
  if (price !== undefined) data.price = price;
  if (compareAtPrice !== undefined) data.compareAtPrice = compareAtPrice;
  if (label !== undefined) {
    const existingAttrs = (variant.variantAttributes as Record<string, unknown>) || {};
    data.variantAttributes = { ...existingAttrs, label };
  }

  const updated = await prisma.productVariant.update({ where: { id: variant.id }, data });
  sendSuccess(res, updated);
});

// Changes a variant's physical stock by a delta (purchase, damaged goods, return, other) or by a
// physical count (stocktake), and records the change in the inventory ledger. See
// services/inventory.service.ts for the locking and the "never below reserved" rule.
export const createStockMovement = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Chưa đăng nhập');
  const variantId = req.params.variantId as string;
  const { type, delta, reason, countedQuantity, note } = req.body;
  const input =
    type === STOCK_MOVEMENT_TYPE.STOCKTAKE
      ? { type: STOCK_MOVEMENT_TYPE.STOCKTAKE, countedQuantity: Number(countedQuantity), note: note ?? null }
      : { type: STOCK_MOVEMENT_TYPE.ADJUST, delta: Number(delta), reason, note: note ?? null };

  const userId = req.user.id;
  const variant = await prisma.$transaction((tx) => adjustStockByAdmin(tx, variantId, input, userId));
  sendSuccess(res, variant, null, 201);
});

// The ledger of one variant, newest first, for the admin's stock history panel.
export const listStockMovements = asyncHandler(async (req: Request, res: Response) => {
  const variantId = req.params.variantId as string;
  const { page, take, skip } = parsePagination(req.query, 20, 100);
  const where = { variantId };
  const [items, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      orderBy: { seq: 'desc' },
      skip,
      take,
      select: { id: true, delta: true, quantityAfter: true, reason: true, note: true, orderId: true, createdAt: true, user: { select: { id: true, fullName: true, email: true } } },
    }),
    prisma.inventoryMovement.count({ where }),
  ]);
  sendSuccess(res, items, { page, pageSize: take, total });
});

// Attaches an already-uploaded image to a product. The file itself goes to Cloudinary through
// upload.controller.js first and arrives here as a URL, which keeps this endpoint free of any
// file handling. New images land at the end of the order rather than the front, so adding a photo
// never silently changes which one is the cover.
export const addImage = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { url, altText } = req.body;

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm');

  const last = await prisma.productImage.findFirst({
    where: { productId: product.id },
    orderBy: { position: 'desc' },
  });

  const image = await prisma.productImage.create({
    data: {
      productId: product.id,
      url,
      altText: altText || product.name,
      position: last ? last.position + 1 : 0,
    },
  });

  sendSuccess(res, image, null, 201);
});

// Edits an image's alt text or moves it in the order.
export const updateImage = asyncHandler(async (req: Request, res: Response) => {
  const imageId = req.params.imageId as string;
  const { altText, position } = req.body;

  const existing = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!existing) throw new ApiError(404, 'IMAGE_NOT_FOUND', 'Không tìm thấy ảnh');

  const data: Prisma.ProductImageUpdateInput = {};
  if (altText !== undefined) data.altText = altText;
  if (position !== undefined) data.position = position;

  const updated = await prisma.productImage.update({ where: { id: existing.id }, data });
  sendSuccess(res, updated);
});

// Detaches an image from a product.
export const removeImage = asyncHandler(async (req: Request, res: Response) => {
  const imageId = req.params.imageId as string;
  const existing = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!existing) throw new ApiError(404, 'IMAGE_NOT_FOUND', 'Không tìm thấy ảnh');

  await prisma.productImage.delete({ where: { id: existing.id } });
  sendSuccess(res, { message: 'Đã xoá ảnh' });
});

// Permanently deletes a product along with its variants and images.
export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm');

  await prisma.$transaction([
    prisma.productImage.deleteMany({ where: { productId: id } }),
    prisma.productVariant.deleteMany({ where: { productId: id } }),
    prisma.product.delete({ where: { id } }),
  ]);

  sendSuccess(res, { message: 'Đã xoá sản phẩm' });
});

// Adds a new variant to an existing product.
export const addVariant = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { sku, price, compareAtPrice, stockQuantity, label } = req.body;

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm');

  const existingSku = await prisma.productVariant.findUnique({ where: { sku } });
  if (existingSku) throw new ApiError(409, 'SKU_TAKEN', `SKU đã tồn tại: ${sku}`);

  const variantAttributes = label ? { label } : {};

  const variant = await prisma.$transaction(async (tx) => {
    const created = await tx.productVariant.create({
      data: {
        productId: product.id,
        sku,
        price: price || 0,
        compareAtPrice: compareAtPrice || null,
        stockQuantity: stockQuantity || 0,
        variantAttributes,
        variantKey: sku, // Use SKU as variantKey to satisfy constraints
      },
    });
    await recordOpening(tx, created.id, req.user?.id ?? null);
    return created;
  });

  sendSuccess(res, variant, null, 201);
});

// Removes a variant. Ensures that at least one variant remains.
export const removeVariant = asyncHandler(async (req: Request, res: Response) => {
  const variantId = req.params.variantId as string;

  const existing = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!existing) throw new ApiError(404, 'VARIANT_NOT_FOUND', 'Không tìm thấy biến thể');

  // Prevent deleting if it's the last variant
  const variantCount = await prisma.productVariant.count({ where: { productId: existing.productId } });
  if (variantCount <= 1) {
    throw new ApiError(400, 'LAST_VARIANT', 'Không thể xóa biến thể duy nhất của sản phẩm. Một sản phẩm phải có ít nhất một biến thể.');
  }

  await prisma.productVariant.delete({ where: { id: variantId } });
  sendSuccess(res, { message: 'Đã xóa biến thể' });
});

export default {
  createStockMovement,
  listStockMovements,
  addVariant,
  removeVariant,
  list,
  getBySlug,
  adminList,
  create,
  update,
  updateVariant,
  addImage,
  updateImage,
  removeImage,
  remove,
};
