import { Router } from 'express';
import { body } from 'express-validator';
import validate from '../middlewares/validate';
import authenticate from '../middlewares/authenticate';
import requireRole from '../middlewares/requireRole';
import * as ctrl from '../controllers/product.controller';
import { PRODUCT_STATUS_VALUES, MAX_DB_INT } from '../constants/product';

const router = Router();

// Routes for the product catalogue. Public endpoints serve the storefront and need no token;
// everything that writes sits behind `authenticate` + `requireRole('admin')`.

// `/admin/list` is declared before `/:slug` on purpose. Express matches routes in order, so with
// the reverse order the literal word "admin" would be captured as a product slug and the admin
// listing would answer 404 instead.
router.get('/', ctrl.list);
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

// Price and stock are edited through their own endpoint rather than through PATCH /:id, so that a
// partial product form can never wipe inventory as a side effect of saving a description.
router.patch(
  '/variants/:variantId',
  authenticate,
  requireRole('admin'),
  [
    body('price').optional().isInt({ min: 0, max: MAX_DB_INT }),
    body('compareAtPrice').optional({ nullable: true }).isInt({ min: 0, max: MAX_DB_INT }),
    body('stockQuantity').optional().isInt({ min: 0, max: MAX_DB_INT }),
    validate,
  ],
  ctrl.updateVariant
);

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
