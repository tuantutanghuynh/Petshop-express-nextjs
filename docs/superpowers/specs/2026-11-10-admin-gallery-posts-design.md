# Admin gallery and posts management — design

Date: 2026-11-10 · Level: LARGE (> 3 files, one new admin endpoint, one rule change in an admin endpoint)

## Goal

The admin can list, edit and delete gallery photos and blog posts. Today `/admin/gallery` and
`/admin/posts` are the old pages: a bare list (gallery: only the first 10 photos), no edit, no
delete, no loading / error state; the "new" pages have no labels and break the mobile rules.

## Decisions (agreed 2026-11-10)

- Both features in one go (B), following the product admin pattern (Manager + card list + Form,
  pure validation in `lib/`, `window.confirm` before delete).
- A published post's slug is locked (A): editable while draft; once published the field is
  read-only and the backend refuses a change (409 `SLUG_LOCKED`). No redirect table.
- Not in scope: drag-and-drop ordering of photos (`position` stays as is), deleting files on
  Cloudinary, the site colour palette.

## Backend

- `GET /blog/admin/:id` (authenticate + admin): one post of any status, with category and author.
  404 `POST_NOT_FOUND`. Declared before `/:slug`.
- `PATCH /blog/:id`: when the stored post is `published` and `slug` differs → 409 `SLUG_LOCKED`
  "Bài đã đăng không đổi được đường dẫn". Length rules: title ≤ 200, slug ≤ 200 and
  `^[a-z0-9]+(?:-[a-z0-9]+)*$`, excerpt ≤ 500, seoTitle ≤ 70, seoDescription ≤ 160,
  coverImageUrl ≤ 500; same rules on `POST /blog`. Validation failures stay 422.
- `POST` / `PUT /gallery`: title ≤ 120, altText ≤ 200 (trimmed, required), imageUrl ≤ 500.
- Tests (supertest + DB): admin get by id (draft visible; 401 without token; 403 customer; 404),
  slug lock (published 409, draft can change, published same slug OK), length rules 422,
  gallery update and delete (404 on unknown id).

## Frontend

Shared:
- `lib/adminGallery.ts`: `validateGalleryForm`, `galleryBody`.
- `lib/adminPosts.ts`: `validatePostForm` (title, slug format, lengths, a scheduled date must be a
  real date), `postBody`, `postStatusLabel(post, now)` → Nháp / Đã đăng / Hẹn giờ,
  `canEditSlug(post)`.
- `slugify` from `lib/adminCategories.ts` for the auto slug.

Gallery (`components/admin/gallery/`):
- `GalleryManager` at `/admin/gallery`: grid of cards (2 columns, 3 from md, 4 from lg), 24 per
  page with "Trang trước / sau", each card image (next/image), title, alt, **Sửa** link and
  **Xoá** button (≥ 44px). Delete: confirm → `DELETE` → remove from the list → revalidate
  `gallery`. Loading skeleton visible on the page background, error with "Thử lại", empty state
  with a link to add.
- `GalleryForm` for `/admin/gallery/moi` and `/admin/gallery/[id]`: image upload / replace with
  preview, title, alt (required, counter). Labels above inputs, errors under fields, submit
  disabled while sending, `w-full md:w-auto`. Save → revalidate `gallery` → back to the list.
  `/admin/gallery/new` redirects to `/admin/gallery/moi`.

Posts (`components/admin/posts/`):
- `PostsManager` at `/admin/posts`: status chips (Tất cả / Nháp / Đã đăng / Hẹn giờ, backend
  `status` filter), title search, 20 per page. Cards: cover, title, status label, date, **Sửa**,
  **Xem** (published and live only), **Xoá** (confirm). Same loading / error / empty states.
- `PostForm` for `/admin/posts/moi` and `/admin/posts/[id]`: title; slug (auto from title until
  edited by hand; read-only with a note once published); excerpt; cover image upload; topic
  (categories of the `petshop` tree, optional); content (`MarkdownField`, preview); SEO title and
  description with counters; status Nháp / Đăng; publish date (`datetime-local`, empty = now,
  future = scheduled). 409 `SLUG_TAKEN` / `SLUG_LOCKED` shows under the slug field. Save →
  revalidate `blog` → back to the list. `/admin/posts/new` redirects to `/admin/posts/moi`.

## Testing

- Vitest for `lib/adminGallery.ts` and `lib/adminPosts.ts`; backend tests above.
- `lint`, `typecheck`, `test`, `test:db`, `build`.
- Browser (CDP): 320 / 390 / 768 / 1024 px on both lists and forms, no horizontal overflow.
