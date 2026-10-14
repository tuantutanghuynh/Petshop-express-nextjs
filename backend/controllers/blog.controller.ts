import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../services/prisma';
import ApiError from '../utils/ApiError';
import asyncHandler from '../utils/asyncHandler';
import { sendSuccess } from '../utils/ApiResponse';
import { parsePagination } from '../utils/pagination';

// Every read and write path for blog posts, serving both the public site and the admin
// dashboard. Two ideas shape this file: scheduled publishing is derived from `publishedAt`
// rather than stored as its own status, and every listing can be scoped to one brand's
// category tree because a single backend serves several storefronts.

// Returns the paginated list of posts a visitor is allowed to see, honouring optional
// `page`, `pageSize` and `categorySlug` query params and putting the pagination counters in
// `meta`. A post is only public when its status is `published` **and** its `publishedAt` has
// already passed — that second condition is what keeps scheduled posts hidden until their
// time comes. `pageSize` is capped at 50 so a crafted request cannot ask for the entire
// table in one query. The category filter expands to include child categories, otherwise a
// post filed under "Bình gốm" would vanish from the parent brand's listing.
export const list = asyncHandler(async (req: Request, res: Response) => {
  const { categorySlug } = req.query;
  const { page, take, skip } = parsePagination(req.query, 10, 50);

  const where: Prisma.BlogPostWhereInput = {
    status: 'published',
    publishedAt: { lte: new Date() } // Lọc đi các bài được lên lịch trong tương lai
  };

  if (categorySlug && typeof categorySlug === 'string') {
    const category = await prisma.category.findUnique({ where: { slug: categorySlug } });
    if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục');
    const children = await prisma.category.findMany({ where: { parentId: category.id } });
    const categoryIds = [category.id, ...children.map(c => c.id)];
    where.categoryId = { in: categoryIds };
  }

  const [items, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      include: { category: true, author: { select: { id: true, fullName: true } } },
      skip,
      take,
    }),
    prisma.blogPost.count({ where }),
  ]);

  sendSuccess(res, items, { page, pageSize: take, total });
});

// Fetches one post by its slug for the public detail page, including its category and
// author. It repeats the same visibility rules as `list` — a draft or a post whose
// `publishedAt` is still in the future is reported as 404 rather than 403, so an outsider
// cannot probe the site to learn that an unpublished article exists at a given URL. The
// author is selected down to id and name only, keeping the email and password hash off the
// public response.
export const getBySlug = asyncHandler(async (req: Request, res: Response) => {
  const slug = req.params.slug as string;
  const post = await prisma.blogPost.findUnique({
    where: { slug },
    include: { category: true, author: { select: { id: true, fullName: true } } },
  });

  const isFutureScheduled = post && post.publishedAt && new Date(post.publishedAt) > new Date();

  if (!post || post.status !== 'published' || isFutureScheduled) {
    throw new ApiError(404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết');
  }
  sendSuccess(res, post);
});

// Admin-only listing that, unlike `list`, also returns drafts and scheduled posts, ordered
// by creation date so the newest work sits on top. It supports a case-insensitive `search`
// on the title and a `status` filter with three values. `scheduled` is not a value stored in
// the database: it is expressed here as "published with a future `publishedAt`", which is
// how the feature avoids a schema change and a migration of existing rows. The
// `categorySlug` filter is just as mandatory as on the public side — leaving it out is what
// once let one brand's dashboard display the other brand's articles.
export const adminList = asyncHandler(async (req: Request, res: Response) => {
  const { status, categorySlug, search } = req.query;
  const { page, take, skip } = parsePagination(req.query, 20, 100);

  const where: Prisma.BlogPostWhereInput = {};

  if (search && typeof search === 'string') {
    where.title = { contains: search, mode: 'insensitive' };
  }

  if (status === 'draft') {
    where.status = 'draft';
  } else if (status === 'published') {
    where.status = 'published';
    where.publishedAt = { lte: new Date() };
  } else if (status === 'scheduled') {
    where.status = 'published';
    where.publishedAt = { gt: new Date() };
  }

  if (categorySlug && typeof categorySlug === 'string') {
    const category = await prisma.category.findUnique({ where: { slug: categorySlug } });
    if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục');
    const children = await prisma.category.findMany({ where: { parentId: category.id } });
    const categoryIds = [category.id, ...children.map(c => c.id)];
    where.categoryId = { in: categoryIds };
  }

  const [items, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { category: true, author: { select: { id: true, fullName: true } } },
      skip,
      take,
    }),
    prisma.blogPost.count({ where }),
  ]);

  sendSuccess(res, items, { page, pageSize: take, total });
});

// Creates a post and answers 201 with the stored row. The slug is checked for collisions up
// front so a duplicate returns a clear 409 instead of a raw Prisma unique-constraint error.
// `publishedAt` is only set when the post is actually being published: an explicit date from
// the client schedules it for later, no date means publish now, and a draft gets `null` so
// it can never leak through the public visibility check. The author is taken from the
// verified access token rather than the request body, which prevents attributing an article
// to somebody else.
export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Chưa đăng nhập');
  const { title, slug, excerpt, content, coverImageUrl, categoryId, seoTitle, seoDescription, status, publishedAt } = req.body;

  // Kiểm tra trùng lặp Slug
  if (slug) {
    const existingSlug = await prisma.blogPost.findUnique({ where: { slug } });
    if (existingSlug) {
      throw new ApiError(409, 'SLUG_TAKEN', 'Slug đã tồn tại, vui lòng chọn slug khác');
    }
  }

  // Xác định ngày xuất bản
  let finalPublishedAt: Date | null = null;
  if (status === 'published') {
    finalPublishedAt = publishedAt ? new Date(publishedAt) : new Date();
  }

  const post = await prisma.blogPost.create({
    data: {
      title,
      slug,
      excerpt,
      content,
      coverImageUrl,
      categoryId: categoryId || null,
      seoTitle,
      seoDescription,
      authorId: req.user.id,
      status: status || 'draft',
      publishedAt: finalPublishedAt,
    },
  });
  sendSuccess(res, post, null, 201);
});

// Updates an existing post, accepting a partial body so the admin form can send only what
// changed. Fields left `undefined` are stripped before the write, because passing them to
// Prisma would overwrite good data with null. A changed slug is checked against other rows
// first — note the `slug !== existing.slug` guard, without which saving a post without
// touching its slug would collide with itself and always fail. The `publishedAt` rules
// mirror `create`: an explicit date wins, a first-time publish stamps now, and moving back
// to draft clears the date so the post leaves the public listing.
export const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết');

  const { title, slug, excerpt, content, coverImageUrl, categoryId, seoTitle, seoDescription, status, publishedAt } = req.body;

  // Kiểm tra trùng lặp Slug (nếu slug bị thay đổi)
  if (slug && slug !== existing.slug) {
    const existingSlug = await prisma.blogPost.findUnique({ where: { slug } });
    if (existingSlug) {
      throw new ApiError(409, 'SLUG_TAKEN', 'Slug đã tồn tại, vui lòng chọn slug khác');
    }
  }

  const data: Prisma.BlogPostUpdateInput = {
    title,
    slug,
    excerpt,
    content,
    coverImageUrl,
    category: categoryId !== undefined ? (categoryId ? { connect: { id: categoryId } } : { disconnect: true }) : undefined,
    seoTitle,
    seoDescription,
    status
  };

  if (publishedAt) {
    data.publishedAt = new Date(publishedAt);
  } else if (status === 'published' && existing.status !== 'published') {
    data.publishedAt = new Date();
  } else if (status === 'draft') {
    data.publishedAt = null;
  }

  const post = await prisma.blogPost.update({ where: { id }, data });
  sendSuccess(res, post);
});

// Deletes a post permanently. The row is read first purely so a missing id answers with a
// clean 404 instead of the 500 Prisma raises when `delete` finds nothing to remove. There is
// no soft delete here: the post is gone, and any search engine holding its URL will start
// getting 404s, which is the intended behaviour for content pulled on purpose.
export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  // Phải check tồn tại trước khi xoá để tránh lỗi 500 từ Prisma
  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết');

  await prisma.blogPost.delete({ where: { id } });
  sendSuccess(res, { message: 'Đã xoá bài viết' });
});

export default { list, getBySlug, adminList, create, update, remove };
