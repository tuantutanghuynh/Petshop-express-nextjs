import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, query } from 'express-validator';
import { ipBucket } from '../middlewares/rateLimitKeys';
import authenticate from '../middlewares/authenticate';
import requireRole from '../middlewares/requireRole';
import validate from '../middlewares/validate';
import ApiError from '../utils/ApiError';
import * as ctrl from '../controllers/newsletter.controller';
import * as campaignCtrl from '../controllers/newsletterCampaign.controller';
import { CAMPAIGN_LIMITS, SCHEDULE_MAX_DAYS } from '../constants/newsletter';

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

// ---- Campaigns (spec 2026-11-10, ADR-025) --------------------------------------------------
// Mail providers POST here from their own servers (RFC 8058 one-click): the bucket is looser than
// the page's, and the 256-bit token makes guessing pointless anyway.
router.post('/one-click', limiter(100), [query('token').isString().withMessage('Link không hợp lệ').bail().isLength({ min: 1, max: 200 }).withMessage('Link không hợp lệ'), validate], campaignCtrl.oneClick);

const CAMPAIGN_STATUSES = ['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED'];
const MINUTE = 60_000;
// A send time typed a few minutes ago (the form was open) still counts as "now".
const SCHEDULE_PAST_GRACE_MINUTES = 5;

// Factories, not shared chains: .optional() on a shared chain would change it for every route.
const subjectRule = () => body('subject').isString().withMessage('Nhập tiêu đề email').bail().trim().notEmpty().withMessage('Nhập tiêu đề email')
  .isLength({ max: CAMPAIGN_LIMITS.subject }).withMessage(`Tiêu đề tối đa ${CAMPAIGN_LIMITS.subject} ký tự`);
const contentRule = () => body('content').isString().withMessage('Nhập nội dung').bail().notEmpty().withMessage('Nhập nội dung')
  .isLength({ max: CAMPAIGN_LIMITS.content }).withMessage(`Nội dung tối đa ${CAMPAIGN_LIMITS.content.toLocaleString('vi-VN')} ký tự`);
const campaignFieldRules = () => [
  body('preheader').optional({ values: 'null' }).isString().withMessage('Dòng xem trước không hợp lệ').bail()
    .isLength({ max: CAMPAIGN_LIMITS.preheader }).withMessage(`Dòng xem trước tối đa ${CAMPAIGN_LIMITS.preheader} ký tự`),
  body('isAdvertising').optional().isBoolean({ strict: true }).withMessage('Giá trị không hợp lệ'),
  body('featured').optional().isArray({ max: CAMPAIGN_LIMITS.featured }).withMessage(`Chọn tối đa ${CAMPAIGN_LIMITS.featured} bài viết / sản phẩm`).bail()
    .custom((items: { type?: unknown; id?: unknown }[]) => new Set(items.map((f) => `${String(f?.type)}:${String(f?.id)}`)).size === items.length)
    .withMessage('Có bài viết / sản phẩm bị chọn trùng'),
  body('featured.*.type').isIn(['post', 'product']).withMessage('Loại không hợp lệ'),
  body('featured.*.id').isString().withMessage('Mã không hợp lệ').bail().isLength({ min: 1, max: 64 }).withMessage('Mã không hợp lệ'),
];
const scheduledAtRule = () => body('scheduledAt').optional({ values: 'falsy' })
  .isISO8601({ strict: true }).withMessage('Giờ gửi không hợp lệ').bail()
  .custom((value: string) => {
    const at = new Date(value).getTime();
    const now = Date.now();
    if (at < now - SCHEDULE_PAST_GRACE_MINUTES * MINUTE) throw new Error('Giờ gửi đã qua');
    if (at > now + SCHEDULE_MAX_DAYS * 24 * 60 * MINUTE) throw new Error(`Chỉ hẹn trong vòng ${SCHEDULE_MAX_DAYS} ngày`);
    return true;
  });

router.use('/campaigns', authenticate, requireRole('admin'));
router.get('/campaigns', [query('status').optional({ values: 'falsy' }).isIn(CAMPAIGN_STATUSES).withMessage('Trạng thái không hợp lệ'), validate], campaignCtrl.list);
router.post('/campaigns', [subjectRule(), contentRule(), ...campaignFieldRules(), validate], campaignCtrl.create);
router.get('/campaigns/:id', campaignCtrl.get);
router.patch('/campaigns/:id', [subjectRule().optional(), contentRule().optional(), ...campaignFieldRules(), validate], campaignCtrl.update);
router.delete('/campaigns/:id', campaignCtrl.remove);
router.post('/campaigns/:id/schedule', [scheduledAtRule(), validate], campaignCtrl.schedule);
router.post('/campaigns/:id/cancel', campaignCtrl.cancel);
// Each test is a real email through Brevo's daily quota.
router.post('/campaigns/:id/test', limiter(5), campaignCtrl.test);

export default router;
