import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ipBucket } from '../middlewares/rateLimitKeys';
import * as contactController from '../controllers/contact.controller';
import authenticate from '../middlewares/authenticate';
import requireRole from '../middlewares/requireRole';

const router = Router();

// Rate limiter chống spam (Tối đa 5 request / 15 phút từ 1 IP)
// Keyed by the visitor's IP, also when the form is relayed by the Next.js BFF (X-Client-IP + secret);
// req.ip alone would make every visitor share the Next.js server's bucket.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  keyGenerator: ipBucket,
  max: 5,
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Bạn đã gửi quá nhiều tin nhắn. Vui lòng thử lại sau 15 phút.'
  },
});

// Khách truy cập gửi form (Public)
router.post('/', contactLimiter, contactController.submitContact);

router.use('/admin', authenticate, requireRole('admin'));
router.get('/admin/list', contactController.adminList);
router.patch('/admin/:id/read', contactController.markAsRead);
router.delete('/admin/:id', contactController.remove);

export default router;
