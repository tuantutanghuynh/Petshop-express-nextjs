import { Router } from 'express';
import { body, query } from 'express-validator';
import { PRODUCT_SORTS, toSearchText } from '../utils/searchText';
import validate from '../middlewares/validate';
import authenticate from '../middlewares/authenticate';
import requireRole from '../middlewares/requireRole';
import * as ctrl from '../controllers/product.controller';
import { PRODUCT_STATUS_VALUES, MAX_DB_INT } from '../constants/product';
import { ADJUST_REASONS, STOCK_MOVEMENT_TYPE } from '../constants/inventory';

const router = Router();

// Routes for the product catalogue. Public endpoints serve the storefront and need no token;
// everything that writes sits behind `authenticate` + `requireRole('admin')`.

// `/admin/list` is declared before `/:slug` on purpose. Express matches routes in order, so with
// the reverse order the literal word "admin" would be captured as a product slug and the admin
// listing would answer 404 instead.
// Public list: optional search and sort. q must still have 2–100 characters once normalised
// (so "  " or a single letter is refused rather than matching everything), and must be a single
// value — "?q=a&q=b" arrives as an array. sort is a whitelist; anything else is a 422, never passed
// on to the database. brand (mega menu "featured brands") is one string of 1–100 characters.
// Validators only (no sanitizers): Express 5 makes req.query read-only.
router.get(
  '/',
  [
    query('q')
      .optional()
      .custom((v) => typeof v === 'string' && v.length <= 100 && toSearchText(v).length >= 2)
      .withMessage('Từ khoá tìm kiếm phải có từ 2 đến 100 ký tự'),
    query('sort').optional().isIn(PRODUCT_SORTS).withMessage('Kiểu sắp xếp không hợp lệ'),
    query('brand')
      .optional()
      .custom((v) => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 100)
      .withMessage('Thương hiệu phải có từ 1 đến 100 ký tự'),
    validate,
  ],
  ctrl.list,
);
router.get('/admin/list', authenticate, requireRole('admin'), ctrl.adminList);
router.get('/:slug', ctrl.getBySlug);

// Prices are validated as integers because the column is `Int` and money is never stored as a
// float. `isInt({ min: 0, max: MAX_DB_INT })` also rejects the string "12000" silently becoming NaN later, and
// blocks negative prices that would make an order total smaller than it should be.
router.post(
  '/',
  authenticate,
  requireRole('admin'),
  [
    body('categoryId').notEmpty(),
    body('name').notEmpty(),
    body('slug').notEmpty(),
    body('status').optional().isIn(PRODUCT_STATUS_VALUES),
    body('variants').isArray({ min: 1 }).withMessage('Sản phẩm phải có ít nhất một biến thể'),
    body('variants.*.sku').notEmpty(),
    body('variants.*.price').isInt({ min: 0, max: MAX_DB_INT }),
    body('variants.*.compareAtPrice').optional({ nullable: true }).isInt({ min: 0, max: MAX_DB_INT }),
    body('variants.*.stockQuantity').optional().isInt({ min: 0, max: MAX_DB_INT }),
    body('images').optional().isArray(),
    body('images.*.url').optional().notEmpty(),
    validate,
  ],
  ctrl.create
);

router.post(
  '/:id/variants',
  authenticate,
  requireRole('admin'),
  [
    body('sku').notEmpty().withMessage('SKU không được để trống'),
    body('price').isInt({ min: 0, max: MAX_DB_INT }).withMessage('Giá không hợp lệ'),
    body('compareAtPrice').optional({ nullable: true }).isInt({ min: 0, max: MAX_DB_INT }),
    body('stockQuantity').optional().isInt({ min: 0, max: MAX_DB_INT }),
    validate,
  ],
  ctrl.addVariant
);

router.delete('/variants/:variantId', authenticate, requireRole('admin'), ctrl.removeVariant);

router.patch(
  '/:id',
  authenticate,
  requireRole('admin'),
  [body('status').optional().isIn(PRODUCT_STATUS_VALUES), validate],
  ctrl.update
);

// Price and label of one variant. Stock is NOT accepted here: overwriting it with an absolute value
// erased sales made between the admin reading the number and saving it (ADR-007). Use the
// stock-movements endpoint below; sending stockQuantity here is a 422 so old clients fail loudly
// instead of silently doing nothing.
router.patch(
  '/variants/:variantId',
  authenticate,
  requireRole('admin'),
  [
    body('price').optional().isInt({ min: 0, max: MAX_DB_INT }),
    body('compareAtPrice').optional({ nullable: true }).isInt({ min: 0, max: MAX_DB_INT }),
    body('stockQuantity')
      .not()
      .exists()
      .withMessage('Không sửa tồn kho ở đây — dùng POST /products/variants/:id/stock-movements'),
    validate,
  ],
  ctrl.updateVariant
);

// Stock changes, recorded in the inventory ledger: { type: 'ADJUST', delta, reason, note? } for a
// delivery / damage / return, or { type: 'STOCKTAKE', countedQuantity, note? } after a physical
// count. SALE, CANCEL_RESTOCK and OPENING are written by the system only and refused here.
const isAdjust = body('type').equals(STOCK_MOVEMENT_TYPE.ADJUST);
const isStocktake = body('type').equals(STOCK_MOVEMENT_TYPE.STOCKTAKE);
router.post(
  '/variants/:variantId/stock-movements',
  authenticate,
  requireRole('admin'),
  [
    body('type').isIn(Object.values(STOCK_MOVEMENT_TYPE)),
    body('delta')
      .if(isAdjust)
      .isInt({ min: -MAX_DB_INT, max: MAX_DB_INT })
      .custom((v) => Number(v) !== 0)
      .withMessage('Số lượng thay đổi phải là số nguyên khác 0'),
    body('reason').if(isAdjust).isIn(ADJUST_REASONS).withMessage('Lý do không hợp lệ'),
    body('countedQuantity').if(isStocktake).isInt({ min: 0, max: MAX_DB_INT }).withMessage('Số đếm được không hợp lệ'),
    body('note').optional({ nullable: true }).isString().isLength({ max: 500 }),
    validate,
  ],
  ctrl.createStockMovement
);

router.get('/variants/:variantId/stock-movements', authenticate, requireRole('admin'), ctrl.listStockMovements);

// Images are managed one at a time rather than by replacing the whole set. Sending the full array
// on every change would mean a dropped request could wipe every photo of a product; this way the
// worst case is one image not being added.
router.post(
  '/:id/images',
  authenticate,
  requireRole('admin'),
  [body('url').trim().notEmpty(), validate],
  ctrl.addImage
);

router.patch(
  '/images/:imageId',
  authenticate,
  requireRole('admin'),
  [body('position').optional().isInt(), validate],
  ctrl.updateImage
);

router.delete('/images/:imageId', authenticate, requireRole('admin'), ctrl.removeImage);

router.delete('/:id', authenticate, requireRole('admin'), ctrl.remove);

export default router;
