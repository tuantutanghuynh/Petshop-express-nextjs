import { Router } from 'express';
import { body } from 'express-validator';
import validate from '../middlewares/validate';
import authenticate from '../middlewares/authenticate';
import requireRole from '../middlewares/requireRole';
import * as ctrl from '../controllers/gallery.controller';

const router = Router();

// Same limits as the admin form (lib/adminGallery.ts). Alt text is required: it is what screen
// readers announce and what image search reads. Factories so each route gets its own chains.
const photoRules = () => [
  body('imageUrl').isString().trim().notEmpty().withMessage('Chọn ảnh').isLength({ max: 500 }).withMessage('Link ảnh quá dài'),
  body('altText').isString().trim().notEmpty().withMessage('Nhập mô tả ảnh').isLength({ max: 200 }).withMessage('Mô tả ảnh tối đa 200 ký tự'),
  body('title').optional({ values: 'null' }).isString().trim().isLength({ max: 120 }).withMessage('Tiêu đề tối đa 120 ký tự'),
];

router.get('/', ctrl.list);
router.post(
  '/',
  authenticate,
  requireRole('admin'),
  [...photoRules(), validate],
  ctrl.create
);
router.get('/:id', ctrl.getById);
router.put(
  '/:id',
  authenticate,
  requireRole('admin'),
  [...photoRules(), validate],
  ctrl.update
);
router.delete('/:id', authenticate, requireRole('admin'), ctrl.remove);

export default router;
