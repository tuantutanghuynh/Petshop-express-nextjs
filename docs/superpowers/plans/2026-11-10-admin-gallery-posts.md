# Admin Gallery & Posts Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** The admin lists, edits and deletes gallery photos and blog posts from `/admin/gallery` and `/admin/posts`.
**Architecture:** Backend gains one admin read (`GET /blog/admin/:id`), a slug lock on published posts and length rules. Frontend follows the product admin pattern: pure rules in `lib/adminGallery.ts` / `lib/adminPosts.ts` (tested), a Manager (cards + filters + pages) and a Form per feature, thin route pages.
**Tech Stack:** Express 5 + express-validator + Prisma 7, Next.js 16 / React 19 / Tailwind 4, Vitest + supertest + testcontainers.
Spec: `docs/superpowers/specs/2026-11-10-admin-gallery-posts-design.md`.

## Global Constraints
- No new dependency, no schema change. Code / comments English; UI text Vietnamese.
- Envelope `{ data, meta, error }`; validation failures 422 `VALIDATION_ERROR`; delete answers 200 with a message (authFetch parses JSON).
- Touch targets ≥ 44px, inputs 16px, labels above inputs, no horizontal overflow 320–1024px, loading / error / empty states.
- No `any`, no `eslint-disable`, no `<img>` (use `next/image`).
- Commits one short line, no attribution, only after the user's "ok".

### Task 1: Blog admin API (backend)
**Files:** `backend/routes/blog.route.ts`, `backend/controllers/blog.controller.ts`, test `backend/test/db/content.posts.test.ts`.
**Produces:** `GET /api/v1/blog/admin/:id` → post with `category`, `author { id, fullName }`; `PATCH` 409 `SLUG_LOCKED`.
- [ ] Tests first (DB): admin reads a draft by id (200, has `content`, `status: 'draft'`); no token 401; customer 403; unknown id 404 `POST_NOT_FOUND`; published post + new slug → 409 `SLUG_LOCKED`, stored slug unchanged; published + same slug + new title → 200; draft slug change → 200; title 201 chars / slug `Bad Slug` / seoDescription 161 chars → 422 (POST and PATCH). Run `npm run test:db -- test/db/content.posts.test.ts` → FAIL.
- [ ] Route `router.get('/admin/:id', authenticate, requireRole('admin'), ctrl.adminGetById)` above `/:slug`; shared `postRules` array (`optional()` on PATCH): title ≤ 200 trim, slug ≤ 200 matches `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, excerpt ≤ 500, seoTitle ≤ 70, seoDescription ≤ 160, coverImageUrl ≤ 500, categoryId optional string.
- [ ] Controller `adminGetById`: `findUnique({ where: { id }, include: { category: true, author: { select: { id: true, fullName: true } } } })`, 404 when missing. In `update`, before the slug-taken check: `if (slug && slug !== existing.slug && existing.status === 'published') throw new ApiError(409, 'SLUG_LOCKED', 'Bài đã đăng không đổi được đường dẫn')`.
- [ ] Run → PASS; `npm test`, `npm run typecheck`.

### Task 2: Gallery API rules (backend)
**Files:** `backend/routes/gallery.route.ts`, test `backend/test/db/gallery.admin.test.ts`.
- [ ] Tests first: admin create 201; PUT changes title / altText / imageUrl; altText 201 chars → 422; title 121 chars → 422; customer PUT / DELETE 403; DELETE 200 then GET by id 404; DELETE unknown 404. Run → FAIL (length cases).
- [ ] Rules on POST and PUT: `body('imageUrl').trim().notEmpty().isLength({ max: 500 })`, `body('altText').trim().notEmpty().isLength({ max: 200 })`, `body('title').optional({ values: 'null' }).isString().trim().isLength({ max: 120 })`. Run → PASS.

### Task 3: Pure admin rules (frontend)
**Files:** create `frontend-petshop/lib/adminGallery.ts`, `frontend-petshop/lib/adminPosts.ts`, tests `test/adminGallery.test.ts`, `test/adminPosts.test.ts`.
**Produces:**
- `GALLERY_LIMITS = { title: 120, alt: 200 }`; `type GalleryFormValues = { imageUrl: string; title: string; altText: string }`; `validateGalleryForm(v): FieldErrors` (imageUrl required, altText required ≤ 200, title ≤ 120); `galleryBody(v) → { imageUrl, altText, title: string | null }` (trimmed, empty title → null).
- `POST_LIMITS = { title: 200, slug: 200, excerpt: 500, seoTitle: 70, seoDescription: 160 }`; `type PostFormValues = { title; slug; excerpt; coverImageUrl; categoryId; content; seoTitle; seoDescription; status: 'draft' | 'published'; publishedAt: string /* datetime-local or '' */ }`; `emptyPost(): PostFormValues`; `postToForm(post: BlogPost): PostFormValues` (publishedAt → local `YYYY-MM-DDTHH:mm` in Asia/Ho_Chi_Minh); `validatePostForm(v): FieldErrors` (title, slug format, content required, lengths, publishedAt parses); `postBody(v) → object` (trim, empty optional → null, publishedAt → ISO with +07:00 or omitted); `type PostState = 'draft' | 'published' | 'scheduled'`; `postState(post, now): PostState`; `POST_STATE_LABELS`; `canEditSlug(post: BlogPost | null): boolean` (true when null or status ≠ 'published').
- [ ] Tests first for every function above (limits at max and max+1, Vietnamese title slugged by `slugify` from `lib/adminCategories.ts`, scheduled vs published by `now`, timezone round trip `2026-11-20T08:30` ↔ `2026-11-20T01:30:00.000Z`). Run → FAIL. Implement. Run → PASS.

### Task 4: Gallery admin UI
**Files:** create `components/admin/gallery/{GalleryManager,GalleryCard,GalleryForm}.tsx`, `components/admin/ImageUploadField.tsx`; replace `app/admin/gallery/page.tsx`; create `app/admin/gallery/moi/page.tsx`, `app/admin/gallery/[id]/page.tsx`; `app/admin/gallery/new/page.tsx` becomes `redirect('/admin/gallery/moi')`.
- [ ] `ImageUploadField({ label, value, onChange, error })`: file input (accept image/*) → `authFetch('/uploads/image', FormData)` → `onChange(url)`; preview with `next/image` (`imageSrc`), "Đang tải ảnh lên…", upload error text.
- [ ] `GalleryManager`: `authFetch('/gallery?page=N&pageSize=24')`, states loading (skeleton `bg-line`), error + "Thử lại", empty + link; grid `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`; prev / next buttons from `meta`; delete → `window.confirm` → `DELETE` → drop from state → `revalidateStorefront(['gallery'])`.
- [ ] `GalleryForm({ item })`: values from item or empty, `validateGalleryForm`, `focusFirstError`, POST or PUT, then revalidate and `router.push('/admin/gallery')`; 422 / other errors shown with `FormAlert`.
- [ ] typecheck, lint, test.

### Task 5: Posts admin UI
**Files:** create `components/admin/posts/{PostsManager,PostCard,PostForm}.tsx`; replace `app/admin/posts/page.tsx`; create `app/admin/posts/moi/page.tsx`, `app/admin/posts/[id]/page.tsx`; `app/admin/posts/new/page.tsx` becomes a redirect.
- [ ] `PostsManager`: chips Tất cả / Nháp / Đã đăng / Hẹn giờ (`status=` query), search (debounced 300ms, `search=`), `pageSize=20`; cards with cover (or placeholder), title, state label, date (`formatDate`), Sửa, Xem (`/blog/<slug>` when `postState === 'published'`), Xoá (confirm → DELETE → revalidate `['blog']`). Same states as gallery.
- [ ] `PostForm({ post })`: fields per spec; slug follows `slugify(title)` until edited by hand (`slugTouched`), read-only + note when `!canEditSlug(post)`; topic select from `GET /categories` built with `buildCategoryTree(…, BRAND_SLUG)` + `flattenTree`; `MarkdownField` for content; counters for SEO fields; `datetime-local` publish date with hint; errors 409 `SLUG_TAKEN` / `SLUG_LOCKED` → `errors.slug`; save → revalidate `['blog']` → list.
- [ ] typecheck, lint, test.

### Task 6: Verify + docs
- [ ] Backend `typecheck`, `test`, `test:db`; frontend `typecheck`, `lint`, `test`, `build`.
- [ ] Browser (CDP, local production build against the dev backend with a local admin): lists and forms at 320 / 390 / 768 / 1024, create → edit → delete one photo and one post.
- [ ] PROGRESS entry; propose commits `add admin post read and slug lock`, `validate gallery fields`, `add gallery and post admin rules`, `add gallery admin`, `add posts admin`.
