# "Thường mua kèm" — design (2026-11-10)

Agreed with the owner: admin picks the products (no automatic co-purchase yet — too few orders);
a variant can be chosen per line inside the block.

- Data: `ProductRelated(productId, relatedProductId, position)`, PK pair, cascade both ways,
  CHECK not self / position ≥ 0. One-way. Rollback: DROP TABLE "ProductRelated".
- API: `PUT /products/:id/related { ids }` (admin, shop scope, ≤ 4, unique, not self, same shop →
  else 422 on `ids`; other shop's product 404). `GET /products/admin/:id` adds `related`
  [{id,name,slug,status}] (any status). `GET /products/:slug` adds `related` (active only, first
  image, variants by price) — additive public field.
- Admin: `RelatedPicker` on the edit page, saved at once like photos; refreshes the storefront cache.
- Storefront: `FrequentlyBought` under the buy box: this product + suggestions, tick boxes, variant
  select (cheapest in stock first), real total (no combo discount), one button → one cart call per
  item, failures named; signed out → login. Hidden when nothing is on sale.
- Tests: DB (save / order / replace / one-way / 422 / 404 / 401 / 403 / cascade / public filter),
  unit (default variant, total), browser at 320 / 390 / 768 / 1024.
