import { Router } from 'express';
import { body, type ValidationChain } from 'express-validator';
import validate from '../middlewares/validate';
import authenticate from '../middlewares/authenticate';
import requireRole from '../middlewares/requireRole';
import resolveBrand from '../middlewares/resolveBrand';
import * as ctrl from '../controllers/category.controller';

const router = Router();

// Admin writes are scoped to the brand of X-Brand-Slug (resolveBrand runs last, after the cheap
// checks): the root itself and other storefronts' categories answer 404. Static paths come before
// /:id so "admin", "reorder" and "resolve" are never read as an id.
const admin = [authenticate, requireRole('admin')];
const nameRule = (rule: ValidationChain) => rule.isString().trim().isLength({ min: 1, max: 100 }).withMessage('Tên danh mục từ 1 đến 100 ký tự');
const slugRule = (rule: ValidationChain) =>
  rule.isString().matches(/^[a-z0-9-]{1,80}$/).withMessage('Slug chỉ gồm a-z, 0-9, dấu - (tối đa 80 ký tự)');
const descriptionRule = () => body('description').optional({ values: 'null' }).isString().isLength({ max: 500 }).withMessage('Mô tả tối đa 500 ký tự');

router.get('/', ctrl.list);
router.get('/admin/list', ...admin, resolveBrand, ctrl.adminList);
router.get('/resolve/:slug', ctrl.resolve);
router.put(
  '/reorder',
  ...admin,
  [body('parentId').isString().notEmpty(), body('ids').isArray({ min: 1, max: 200 }), body('ids.*').isString(), validate],
  resolveBrand,
  ctrl.reorder,
);
router.post(
  '/',
  ...admin,
  [nameRule(body('name')), slugRule(body('slug')), descriptionRule(), body('parentId').isString().notEmpty().withMessage('Chọn danh mục cha'), validate],
  resolveBrand,
  ctrl.create,
);
router.patch(
  '/:id',
  ...admin,
  [nameRule(body('name').optional()), slugRule(body('slug').optional()), descriptionRule(), body('parentId').optional().isString().notEmpty(), validate],
  resolveBrand,
  ctrl.update,
);
router.delete('/:id', ...admin, resolveBrand, ctrl.remove);

// Thuộc tính của danh mục: đọc công khai vì trang sản phẩm cần nhãn để vẽ bảng thông số,
// còn thêm và xoá thì chỉ admin.
router.get('/:id/attributes', ctrl.listAttributes);
router.post('/:id/attributes', authenticate, requireRole('admin'), ctrl.createAttribute);
router.delete('/:id/attributes/:attributeId', authenticate, requireRole('admin'), ctrl.removeAttribute);

export default router;
