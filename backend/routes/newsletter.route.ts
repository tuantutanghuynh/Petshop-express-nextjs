import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, query } from 'express-validator';
import { ipBucket } from '../middlewares/rateLimitKeys';
import authenticate from '../middlewares/authenticate';
import requireRole from '../middlewares/requireRole';
import validate from '../middlewares/validate';
import ApiError from '../utils/ApiError';
import * as ctrl from '../controllers/newsletter.controller';

const router = Router();

// Each public endpoint has its own bucket per visitor IP (the BFF relays the real IP): signups send
// an email, so they get the tightest limit; confirm / unsubscribe only guard against token guessing.
const limiter = (limit: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipBucket,
    handler: (_req, _res, next) => {
      next(new ApiError(429, 'RATE_LIMITED', 'Bạn thử quá nhiều lần. Vui lòng thử lại sau 15 phút.'));
    },
  });

// Lower-cased and trimmed, but not normalizeEmail(): that strips Gmail dots and "+tags", and the
// address someone typed is the one they expect mail at.
const emailRule = body('email')
  .not().isArray().withMessage('Email không hợp lệ').bail()
  .isString().withMessage('Email không hợp lệ').bail()
  .trim().toLowerCase()
  .isLength({ max: 254 }).withMessage('Email không hợp lệ').bail()
  .isEmail().withMessage('Email không hợp lệ');
const consentRule = body('consent').custom((v) => v === true).withMessage('Cần đồng ý nhận email');
const tokenRule = body('token').isString().withMessage('Link không hợp lệ').bail().isLength({ min: 1, max: 200 }).withMessage('Link không hợp lệ');

router.post('/subscribe', limiter(5), [emailRule, consentRule, validate], ctrl.subscribe);
router.post('/confirm', limiter(10), [tokenRule, validate], ctrl.confirm);
router.post('/unsubscribe', limiter(10), [tokenRule, validate], ctrl.unsubscribe);

router.use('/subscribers', authenticate, requireRole('admin'));
router.get(
  '/subscribers',
  [
    query('status').optional({ values: 'falsy' }).isIn(['PENDING', 'CONFIRMED', 'UNSUBSCRIBED']).withMessage('Trạng thái không hợp lệ'),
    query('q').optional({ values: 'falsy' }).isString().trim().isLength({ min: 2, max: 100 }).withMessage('Từ khoá 2–100 ký tự'),
    validate,
  ],
  ctrl.list,
);
router.get('/subscribers/export', ctrl.exportCsv);
router.delete('/subscribers/:id', ctrl.remove);

export default router;
