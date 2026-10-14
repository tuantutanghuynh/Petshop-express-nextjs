import { Router } from 'express';
import { body } from 'express-validator';
import validate from '../middlewares/validate';
import authenticate from '../middlewares/authenticate';
import requireRole from '../middlewares/requireRole';
import * as ctrl from '../controllers/blog.controller';

const router = Router();

router.get('/', ctrl.list);
router.get('/admin/list', authenticate, requireRole('admin'), ctrl.adminList);
router.get('/:slug', ctrl.getBySlug);

// A scheduled date must be a real calendar date. `new Date('2026-02-30')` silently rolls over to
// 2 March, so without `strict` a typo publishes the post on a day nobody chose; an unparseable
// string became an Invalid Date that crashed the insert.
const publishedAtRule = body('publishedAt').optional({ values: 'falsy' }).isISO8601({ strict: true }).withMessage('Ngày xuất bản không hợp lệ');

router.post(
  '/',
  authenticate,
  requireRole('admin'),
  [
    body('title').notEmpty(),
    body('slug').notEmpty(),
    body('content').notEmpty(),
    body('status').optional().isIn(['draft', 'published']),
    publishedAtRule,
    validate,
  ],
  ctrl.create
);

router.patch(
  '/:id',
  authenticate,
  requireRole('admin'),
  [body('status').optional().isIn(['draft', 'published']), publishedAtRule, validate],
  ctrl.update
);

router.delete('/:id', authenticate, requireRole('admin'), ctrl.remove);

export default router;
