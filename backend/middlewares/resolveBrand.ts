import type { Request, Response, NextFunction } from 'express';
import prisma from '../services/prisma';
import ApiError from '../utils/ApiError';
import asyncHandler from '../utils/asyncHandler';
import { categorySubtreeIds } from '../utils/categoryTree';

// Resolves which storefront a request came from and attaches it to `req.brand`. One backend serves
// several brands (gomsu, petshop) out of the same database, so cart and order rows must record
// their origin or the two shops would see each other's data.

// Reads the `X-Brand-Slug` header, verifies it names a real root category, and hands the controller
// both the slug and the id list of that brand's category tree. There is deliberately no default
// value: guessing "probably gomsu" when the header is missing would mean a petshop client that
// forgot the header silently files its orders under the wrong brand, a failure that shows up only
// when a customer complains. A missing header fails loudly on the very first request instead.
// The resolved `categoryIds` covers the brand root and every category below it (products sit on
// leaves three levels down — ADR-016), which is what ownership checks compare a product against.
export const resolveBrand = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const slug = req.get('X-Brand-Slug');
  if (!slug) {
    throw new ApiError(400, 'BRAND_REQUIRED', 'Thiếu header X-Brand-Slug');
  }

  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category || category.parentId !== null) {
    throw new ApiError(404, 'BRAND_NOT_FOUND', 'Không tìm thấy thương hiệu');
  }

  const all = await prisma.category.findMany({ select: { id: true, parentId: true } });

  req.brand = {
    slug: category.slug,
    categoryIds: categorySubtreeIds(all, category.id),
  };

  next();
});

export default resolveBrand;
