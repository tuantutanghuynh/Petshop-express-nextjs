import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ipBucket } from '../middlewares/rateLimitKeys';
import ApiError from '../utils/ApiError';
import { body } from 'express-validator';
import validate from '../middlewares/validate';
import authenticate from '../middlewares/authenticate';
import * as ctrl from '../controllers/auth.controller';

const router = Router();

// Password guessing brake: 10 attempts per 15 minutes per visitor IP on every endpoint that takes
// a password or triggers an email. The global limiter (100 / 15 min) is far too loose for this and
// gives a logged-out attacker no user bucket to exhaust. The key is the visitor's real IP even
// when the request is relayed by our Next.js BFF (clientIp); the internal secret on its own buys
// no exemption here. Answers in the standard { data, meta, error } envelope via ApiError.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipBucket,
  handler: (_req, _res, next) => {
    next(new ApiError(429, 'RATE_LIMITED', 'Bạn thử quá nhiều lần. Vui lòng thử lại sau 15 phút.'));
  },
});


// express-validator applies standard validators to EACH element when the value is an array, so
// `{ "email": ["a@b.com"] }` passed isEmail and reached Prisma as an array → 500. Rejecting arrays
// explicitly keeps every email field a single string.
const emailRule = () => body('email').not().isArray().withMessage('Email không hợp lệ').bail().isEmail().normalizeEmail();

router.post(
  '/register',
  authLimiter,
  [
    emailRule(),
    body('password')
      .isLength({ min: 8 }).withMessage('Mật khẩu phải ít nhất 8 ký tự')
      .matches(/[A-Z]/).withMessage('Mật khẩu phải chứa ít nhất một chữ hoa')
      .matches(/[a-z]/).withMessage('Mật khẩu phải chứa ít nhất một chữ thường')
      .matches(/[0-9]/).withMessage('Mật khẩu phải chứa ít nhất một chữ số')
      .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Mật khẩu phải chứa ít nhất một ký tự đặc biệt'),
    body('confirmPassword').custom((val, { req }) => val === req.body.password).withMessage('Xác nhận mật khẩu không khớp'),
    body('fullName').optional().trim().notEmpty(),
    validate,
  ],
  ctrl.register
);

router.post(
  '/login',
  authLimiter,
  [emailRule(), body('password').notEmpty(), validate],
  ctrl.login
);

router.post(
  '/refresh',
  [body('refreshToken').notEmpty(), validate],
  ctrl.refresh
);

// Không đặt sau `authenticate`: access token chỉ sống 15 phút, mà người dùng vẫn phải đăng
// xuất được sau khi nó hết hạn. Thiếu refreshToken cũng không coi là lỗi — client đã xoá
// token phía nó rồi, gọi lại lần nữa vẫn phải thành công.
router.post('/logout', ctrl.logout);

router.get('/me', authenticate, ctrl.me);

router.post(
  '/request-password-reset',
  authLimiter,
  [emailRule(), validate],
  ctrl.requestPasswordReset
);

router.post(
  '/reset-password',
  [
    emailRule(),
    body('token').notEmpty(),
    body('newPassword')
      .isLength({ min: 8 }).withMessage('Mật khẩu phải ít nhất 8 ký tự')
      .matches(/[A-Z]/).withMessage('Mật khẩu phải chứa ít nhất một chữ hoa')
      .matches(/[a-z]/).withMessage('Mật khẩu phải chứa ít nhất một chữ thường')
      .matches(/[0-9]/).withMessage('Mật khẩu phải chứa ít nhất một chữ số')
      .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Mật khẩu phải chứa ít nhất một ký tự đặc biệt'),
    validate,
  ],
  ctrl.resetPassword
);

export default router;
