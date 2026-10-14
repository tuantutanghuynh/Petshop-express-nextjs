import { Router } from 'express';
import { body } from 'express-validator';
import validate from '../middlewares/validate';
import authenticate from '../middlewares/authenticate';
import * as ctrl from '../controllers/auth.controller';

const router = Router();

// express-validator applies standard validators to EACH element when the value is an array, so
// `{ "email": ["a@b.com"] }` passed isEmail and reached Prisma as an array → 500. Rejecting arrays
// explicitly keeps every email field a single string.
const emailRule = () => body('email').not().isArray().withMessage('Email không hợp lệ').bail().isEmail().normalizeEmail();

router.post(
  '/register',
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
