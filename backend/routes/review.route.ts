import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { body, query } from 'express-validator';
import multer, { MulterError } from 'multer';
import { cloudinary } from '../config/env';
import { REVIEW_IMAGE_MAX_BYTES, REVIEW_IMAGE_UPLOADS_PER_HOUR, REVIEW_LIMITS } from '../constants/review';
import * as ctrl from '../controllers/review.controller';
import authenticate from '../middlewares/authenticate';
import requireRole from '../middlewares/requireRole';
import validate from '../middlewares/validate';
import ApiError from '../utils/ApiError';

// Reviews (spec 2026-11-10, ADR-027). Customers write and edit their own; the admin moderates. The
// public list is GET /products/:slug/reviews (product.route.ts).
const router = Router();

// Photos must be on this shop's Cloudinary account (what POST /reviews/images returns): an outside
// URL could track readers or change after approval.
const ownCloudinary = (url: unknown) =>
  typeof url === 'string' && url.length <= 500 && !!cloudinary.cloudName && url.startsWith(`https://res.cloudinary.com/${cloudinary.cloudName}/image/upload/`) && !/\s/.test(url);

// Factories, not shared chains: .optional() on a shared chain would change it for every route.
const ratingRule = () => body('rating').custom((v) => Number.isInteger(v) && v >= 1 && v <= 5).withMessage('Chọn từ 1 đến 5 sao');
const contentRule = () => body('content').isString().withMessage('Nhập nội dung đánh giá').bail().trim()
  .isLength({ min: REVIEW_LIMITS.contentMin, max: REVIEW_LIMITS.contentMax }).withMessage(`Viết từ ${REVIEW_LIMITS.contentMin} đến ${REVIEW_LIMITS.contentMax} ký tự`);
const imageRules = () => [
  body('images').optional().isArray({ max: REVIEW_LIMITS.images }).withMessage(`Tối đa ${REVIEW_LIMITS.images} ảnh`),
  body('images.*').custom(ownCloudinary).withMessage('Ảnh không hợp lệ, hãy tải ảnh lên lại'),
];

// Per account (the route is behind authenticate): ten photos an hour is plenty for one review.
const imageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: REVIEW_IMAGE_UPLOADS_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `review-image:${req.user?.id ?? 'anonymous'}`,
  handler: (_req, _res, next) => next(new ApiError(429, 'RATE_LIMITED', 'Bạn tải ảnh quá nhiều. Vui lòng thử lại sau 1 giờ.')),
});

const reviewImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: REVIEW_IMAGE_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) ? cb(null, true) : cb(new ApiError(422, 'INVALID_FILE_TYPE', 'Chỉ nhận ảnh JPG, PNG hoặc WebP'))),
}).single('image');

// The shared error handler words a too-big file for the 15 MB admin limit; customers get theirs.
function singleReviewImage(req: Request, res: Response, next: NextFunction) {
  reviewImage(req, res, (err: unknown) => {
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') return next(new ApiError(413, 'FILE_TOO_LARGE', 'Ảnh quá lớn, tối đa 5MB'));
    next(err);
  });
}

// ---- Admin (declared first so /admin/... is never read as a review id) -------------------------
router.use('/admin', authenticate, requireRole('admin'));
router.get(
  '/admin',
  [
    query('status').optional({ values: 'falsy' }).isIn(['PENDING', 'APPROVED', 'HIDDEN']).withMessage('Trạng thái không hợp lệ'),
    query('rating').optional({ values: 'falsy' }).isInt({ min: 1, max: 5 }).withMessage('Số sao không hợp lệ'),
    validate,
  ],
  ctrl.adminList,
);
router.get('/admin/pending-count', ctrl.pendingCount);
router.post('/admin/:id/approve', ctrl.approve);
router.post('/admin/:id/hide', ctrl.hide);
router.patch(
  '/admin/:id/reply',
  [body('reply').optional({ values: 'null' }).isString().withMessage('Câu trả lời không hợp lệ').bail().isLength({ max: REVIEW_LIMITS.reply }).withMessage(`Tối đa ${REVIEW_LIMITS.reply} ký tự`), validate],
  ctrl.reply,
);

// ---- Customer -----------------------------------------------------------------------------
router.get('/mine', authenticate, ctrl.mine);
router.get('/eligibility', authenticate, [query('productId').isString().isLength({ min: 1, max: 64 }).withMessage('Thiếu sản phẩm'), validate], ctrl.eligibility);
router.post('/images', authenticate, imageLimiter, singleReviewImage, ctrl.uploadImage);
router.post(
  '/',
  authenticate,
  [body('productId').isString().withMessage('Thiếu sản phẩm').bail().isLength({ min: 1, max: 64 }), ratingRule(), contentRule(), ...imageRules(), validate],
  ctrl.create,
);
router.patch('/:id', authenticate, [ratingRule().optional(), contentRule().optional(), ...imageRules(), validate], ctrl.update);

export default router;
