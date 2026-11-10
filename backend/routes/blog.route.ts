import { Router } from 'express';
import { body } from 'express-validator';
import validate from '../middlewares/validate';
import authenticate from '../middlewares/authenticate';
import requireRole from '../middlewares/requireRole';
import * as ctrl from '../controllers/blog.controller';

const router = Router();

router.get('/', ctrl.list);
router.get('/admin/list', authenticate, requireRole('admin'), ctrl.adminList);
router.get('/admin/:id', authenticate, requireRole('admin'), ctrl.adminGetById);
router.get('/:slug', ctrl.getBySlug);

// A scheduled date must be a real calendar date. `new Date('2026-02-30')` silently rolls over to
// 2 March, so without `strict` a typo publishes the post on a day nobody chose; an unparseable
// string became an Invalid Date that crashed the insert.
const publishedAtRule = body('publishedAt').optional({ values: 'falsy' }).isISO8601({ strict: true }).withMessage('Ngày xuất bản không hợp lệ');

// Lengths the admin form also enforces (lib/adminPosts.ts). The slug is the URL: lower-case letters,
// digits and single hyphens only. Optional fields accept null (the form sends null for "empty").
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const optionalText = (field: string, max: number, label: string) =>
  body(field).optional({ values: 'null' }).isString().isLength({ max }).withMessage(`${label} tối đa ${max} ký tự`);
// Factories, not shared chains: calling .optional() on a shared chain would change it for every route.
const lengthRules = () => [
  optionalText('excerpt', 500, 'Tóm tắt'),
  optionalText('seoTitle', 70, 'SEO title'),
  optionalText('seoDescription', 160, 'SEO description'),
  optionalText('coverImageUrl', 500, 'Link ảnh bìa'),
  body('categoryId').optional({ values: 'null' }).isString(),
];
const titleRule = () => body('title').trim().notEmpty().withMessage('Nhập tiêu đề').isLength({ max: 200 }).withMessage('Tiêu đề tối đa 200 ký tự');
const slugRule = () => body('slug').trim().notEmpty().withMessage('Nhập đường dẫn').isLength({ max: 200 }).withMessage('Đường dẫn tối đa 200 ký tự')
  .matches(SLUG_PATTERN).withMessage('Đường dẫn chỉ gồm chữ thường không dấu, số và dấu gạch ngang');

router.post(
  '/',
  authenticate,
  requireRole('admin'),
  [
    titleRule(),
    slugRule(),
    body('content').notEmpty(),
    body('status').optional().isIn(['draft', 'published']),
    publishedAtRule,
    ...lengthRules(),
    validate,
  ],
  ctrl.create
);

router.patch(
  '/:id',
  authenticate,
  requireRole('admin'),
  [
    titleRule().optional(),
    slugRule().optional(),
    body('content').optional().notEmpty(),
    body('status').optional().isIn(['draft', 'published']),
    publishedAtRule,
    ...lengthRules(),
    validate,
  ],
  ctrl.update
);

router.delete('/:id', authenticate, requireRole('admin'), ctrl.remove);

export default router;
