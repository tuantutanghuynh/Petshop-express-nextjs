import { Router } from 'express';
import authRoute from './auth.route';
import categoryRoute from './category.route';
import productRoute from './product.route';
import cartRoute from './cart.route';
import orderRoute from './order.route';
import settingRoute from './setting.route';
import quoteRequestRoute from './quoteRequest.route';
import blogRoute from './blog.route';
import uploadRoute from './upload.route';
import galleryRoute from './gallery.route';
import contactRoute from './contact.route';
import newsletterRoute from './newsletter.route';
import reviewRoute from './review.route';

const router = Router();

router.use('/auth', authRoute);
router.use('/categories', categoryRoute);
router.use('/products', productRoute);
router.use('/cart', cartRoute);
router.use('/orders', orderRoute);
router.use('/settings', settingRoute);
router.use('/quote-requests', quoteRequestRoute);

router.use('/blog', blogRoute);
router.use('/uploads', uploadRoute);
router.use('/gallery', galleryRoute);
router.use('/contact', contactRoute);
router.use('/newsletter', newsletterRoute);
router.use('/reviews', reviewRoute);

export default router;
