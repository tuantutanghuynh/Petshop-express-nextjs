# Product reviews from verified buyers — design (2026-11-10)

Agreed: admin approves before anything shows; v1 has stars + text, up to 3 customer photos, edit
(back to pending), shop reply, filter / sort.

- Eligibility: signed in + a COMPLETED order containing a variant of the product. One review per
  (product, user). Deleted variants cannot be traced (accepted).
- Data: `ProductReview` (rating 1–5 CHECK, content 10–2000, images Json ≤ 3, status PENDING /
  APPROVED / HIDDEN, adminReply ≤ 1000, adminReplyAt, approvedAt, timestamps, unique (productId,
  userId)); `Product.reviewCount`, `Product.ratingSum` (approved only). Rollback: drop table +
  2 columns + enum.
- Every transition is an optimistic conditional UPDATE (`WHERE status = s0 AND rating = r0`) plus
  the product counter delta in the same transaction; 409 REVIEW_CHANGED when it lost a race.
  approve: PENDING|HIDDEN → APPROVED (+1, +rating); hide: APPROVED → HIDDEN (−1, −rating),
  PENDING → HIDDEN; customer edit: any → PENDING (−1, −old rating if it was APPROVED).
- Author shown as the last word of fullName (fallback "Khách hàng") + "Đã mua hàng"; never email.
- Photos: `POST /reviews/images` for signed-in customers, jpeg/png/webp checked by magic bytes,
  ≤ 5 MB, 10 / hour / user, folder `<CLOUDINARY_FOLDER>/reviews`; review images must be https URLs
  of our Cloudinary cloud.
- API: customer `GET /reviews/mine`, `GET /reviews/eligibility?productId`, `POST /reviews`,
  `PATCH /reviews/:id`; public `GET /products/:slug/reviews?rating&hasImages&sort&page` (approved
  only, meta.summary); admin `GET /reviews/admin`, `GET /reviews/admin/pending-count`,
  `POST /reviews/admin/:id/approve|hide`, `PATCH /reviews/admin/:id/reply`.
- Waves: 1 backend, 2 customer UI (+ BFF multipart relay, JSON-LD aggregateRating only with ≥ 1
  approved review, stars on cards), 3 admin `/admin/danh-gia` + pending badge. ADR-027.
