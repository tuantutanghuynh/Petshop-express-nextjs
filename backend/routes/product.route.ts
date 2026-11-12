import { Router } from 'express';
import { body, query, type ValidationChain } from 'express-validator';
import { PRODUCT_SORTS, toSearchText } from '../utils/searchText';
import validate from '../middlewares/validate';
import authenticate from '../middlewares/authenticate';
import requireRole from '../middlewares/requireRole';
import resolveBrand from '../middlewares/resolveBrand';
import * as ctrl from '../controllers/product.controller';
import * as reviewCtrl from '../controllers/review.controller';
import { REVIEW_SORTS } from '../constants/review';
import { MAX_RELATED } from '../services/productRelated.service';
import { PRODUCT_STATUS_VALUES, MAX_DB_INT } from '../constants/product';
import { ADJUST_REASONS, STOCK_MOVEMENT_TYPE } from '../constants/inventory';

const router = Router();

// Admin routes are limited to the shop of X-Brand-Slug: resolveBrand runs last, after the cheap
// token, role and field checks, so those answer without touching the database and anything outside
// the shop's category tree answers 404 (spec 2026-11-04 admin products).
const admin = [authenticate, requireRole('admin')];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugRule = (rule: ValidationChain) =>
  rule.isString().isLength({ max: 120 }).matches(SLUG).withMessage('Slug chỉ gồm a-z, 0-9 và dấu - giữa các chữ (tối đa 120 ký tự)');
const nameRule = (rule: ValidationChain) => rule.isString().trim().isLength({ min: 1, max: 200 }).withMessage('Tên sản phẩm từ 1 đến 200 ký tự');
const productFieldRules = () => [
  body('brand').optional({ values: 'null' }).isString().trim().isLength({ max: 100 }).withMessage('Thương hiệu tối đa 100 ký tự'),
  body('description').optional({ values: 'null' }).isString().isLength({ max: 20_000 }).withMessage('Mô tả tối đa 20.000 ký tự'),
  body('status').optional().isIn(PRODUCT_STATUS_VALUES),
  body('attributes')
    .optional()
    .custom((v) => typeof v === 'object' && v !== null && !Array.isArray(v))
    .withMessage('Thông số không hợp lệ'),
];

// Routes for the product catalogue. Public endpoints serve the storefront and need no token;
// everything that writes sits behind `authenticate` + `requireRole('admin')`.

// `/admin/...` and `/resolve/...` are declared before `/:slug` on purpose. Express matches routes in
// order, so with the reverse order the literal word "admin" would be captured as a product slug and
// the admin listing would answer 404 instead.
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
router.get('/admin/list', ...admin, resolveBrand, ctrl.adminList);
router.get('/admin/:id', ...admin, resolveBrand, ctrl.adminGet);
// Former slug → current slug of a product on sale, for the storefront's 308 (ADR-018).
router.get('/resolve/:slug', ctrl.resolve);
// Approved reviews of a product on sale, with the star summary (ADR-027).
router.get(
  '/:slug/reviews',
  [
    query('rating').optional({ values: 'falsy' }).isInt({ min: 1, max: 5 }).withMessage('Số sao không hợp lệ'),
    query('hasImages').optional({ values: 'falsy' }).isIn(['true', 'false']).withMessage('Giá trị không hợp lệ'),
    query('sort').optional({ values: 'falsy' }).isIn([...REVIEW_SORTS]).withMessage('Cách sắp xếp không hợp lệ'),
    validate,
  ],
  reviewCtrl.publicList
);
router.get('/:slug', ctrl.getBySlug);

// Prices are validated as integers because the column is `Int` and money is never stored as a
// float. `isInt({ min: 0, max: MAX_DB_INT })` also rejects the string "12000" silently becoming NaN later, and
// blocks negative prices that would make an order total smaller than it should be.
router.post(
  '/',
  ...admin,
  [
    body('categoryId').isString().notEmpty().withMessage('Chọn danh mục'),
    nameRule(body('name')),
    slugRule(body('slug')),
    ...productFieldRules(),
    body('variants').isArray({ min: 1 }).withMessage('Sản phẩm phải có ít nhất một biến thể'),
    body('variants.*.sku').isString().trim().isLength({ min: 1, max: 64 }).withMessage('SKU từ 1 đến 64 ký tự'),
    body('variants.*.label').optional().isString().isLength({ max: 100 }).withMessage('Nhãn biến thể tối đa 100 ký tự'),
    body('variants.*.price').isInt({ min: 0, max: MAX_DB_INT }),
    body('variants.*.compareAtPrice').optional({ nullable: true }).isInt({ min: 0, max: MAX_DB_INT }),
    body('variants.*.stockQuantity').optional().isInt({ min: 0, max: MAX_DB_INT }),
    body('images').optional().isArray(),
    body('images.*.url').optional().notEmpty(),
    validate,
  ],
  resolveBrand,
  ctrl.create
);

router.post(
  '/:id/variants',
  ...admin,
  [
    body('sku').notEmpty().withMessage('SKU không được để trống'),
    body('price').isInt({ min: 0, max: MAX_DB_INT }).withMessage('Giá không hợp lệ'),
    body('compareAtPrice').optional({ nullable: true }).isInt({ min: 0, max: MAX_DB_INT }),
    body('stockQuantity').optional().isInt({ min: 0, max: MAX_DB_INT }),
    body('label').optional().isString().isLength({ max: 100 }).withMessage('Nhãn biến thể tối đa 100 ký tự'),
    validate,
  ],
  resolveBrand,
  ctrl.addVariant
);

router.delete('/variants/:variantId', ...admin, resolveBrand, ctrl.removeVariant);

router.patch(
  '/:id',
  ...admin,
  [
    nameRule(body('name').optional()),
    slugRule(body('slug').optional()),
    body('categoryId').optional().isString().notEmpty(),
    ...productFieldRules(),
    validate,
  ],
  resolveBrand,
  ctrl.update
);

// Price and label of one variant. Stock is NOT accepted here: overwriting it with an absolute value
// erased sales made between the admin reading the number and saving it (ADR-007). Use the
// stock-movements endpoint below; sending stockQuantity here is a 422 so old clients fail loudly
// instead of silently doing nothing.
router.patch(
  '/variants/:variantId',
  ...admin,
  [
    body('price').optional().isInt({ min: 0, max: MAX_DB_INT }),
    body('label').optional().isString().isLength({ max: 100 }).withMessage('Nhãn biến thể tối đa 100 ký tự'),
    body('compareAtPrice').optional({ nullable: true }).isInt({ min: 0, max: MAX_DB_INT }),
    body('stockQuantity')
      .not()
      .exists()
      .withMessage('Không sửa tồn kho ở đây — dùng POST /products/variants/:id/stock-movements'),
    validate,
  ],
  resolveBrand,
  ctrl.updateVariant
);

// Stock changes, recorded in the inventory ledger: { type: 'ADJUST', delta, reason, note? } for a
// delivery / damage / return, or { type: 'STOCKTAKE', countedQuantity, note? } after a physical
// count. SALE, CANCEL_RESTOCK and OPENING are written by the system only and refused here.
const isAdjust = body('type').equals(STOCK_MOVEMENT_TYPE.ADJUST);
const isStocktake = body('type').equals(STOCK_MOVEMENT_TYPE.STOCKTAKE);
router.post(
  '/variants/:variantId/stock-movements',
  ...admin,
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
  resolveBrand,
  ctrl.createStockMovement
);

router.get('/variants/:variantId/stock-movements', ...admin, resolveBrand, ctrl.listStockMovements);

// Images are managed one at a time rather than by replacing the whole set. Sending the full array
// on every change would mean a dropped request could wipe every photo of a product; this way the
// worst case is one image not being added.
router.post(
  '/:id/images',
  ...admin,
  [
    body('url').trim().notEmpty(),
    body('altText').optional({ values: 'null' }).isString().isLength({ max: 200 }).withMessage('Mô tả ảnh tối đa 200 ký tự'),
    validate,
  ],
  resolveBrand,
  ctrl.addImage
);

router.patch(
  '/images/:imageId',
  ...admin,
  [
    body('position').optional().isInt({ min: 0, max: 1000 }),
    body('altText').optional({ values: 'null' }).isString().isLength({ max: 200 }).withMessage('Mô tả ảnh tối đa 200 ký tự'),
    validate,
  ],
  resolveBrand,
  ctrl.updateImage
);

router.delete('/images/:imageId', ...admin, resolveBrand, ctrl.removeImage);

// "Thường mua kèm" (ADR-026): the whole list at once, ≤ 4, unique, never the product itself.
router.put(
  '/:id/related',
  ...admin,
  [
    body('ids').isArray({ max: MAX_RELATED }).withMessage(`Chọn tối đa ${MAX_RELATED} sản phẩm`).bail()
      .custom((ids: unknown[]) => new Set(ids).size === ids.length).withMessage('Có sản phẩm bị chọn trùng').bail()
      .custom((ids: unknown[], { req }) => !ids.includes(req.params?.id)).withMessage('Không chọn chính sản phẩm này'),
    body('ids.*').isString().withMessage('Mã sản phẩm không hợp lệ').bail().isLength({ min: 1, max: 64 }).withMessage('Mã sản phẩm không hợp lệ'),
    validate,
  ],
  resolveBrand,
  ctrl.updateRelated
);

router.delete('/:id', ...admin, resolveBrand, ctrl.remove);

export default router;
