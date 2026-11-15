# Product reviews Implementation Plan (spec 2026-11-10-product-reviews-design.md)

Wave 1 (backend): schema + migration `add_product_reviews`; constants/review.ts;
services/review.service.ts (eligibility, create, edit, mine, public list + summary, author name);
services/reviewModeration.service.ts (approve, hide, reply, admin list, pending count, counters);
controllers/review.controller.ts; routes/review.route.ts mounted at /reviews; product route
`GET /:slug/reviews`; customer image upload (magic bytes, 5 MB, per-user limit) reusing the
Cloudinary helper. Tests: test/reviewImage.test.ts, test/db/review.test.ts,
test/db/review.admin.test.ts, test/db/review.race.test.ts, authz entries.
Wave 2 (customer UI) and wave 3 (admin UI) planned after wave 1 lands.
