import type { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../services/prisma';
import ApiError from '../utils/ApiError';
import asyncHandler from '../utils/asyncHandler';
import { sendSuccess } from '../utils/ApiResponse';
import { parsePagination } from '../utils/pagination';

// CRUD for gallery images. Image files themselves are uploaded separately through
// upload.controller.js and reach this file as a URL string. Rows created before the move to
// Cloudinary still point at local `/uploads/...` paths, which is why the write paths below
// carry extra logic to clean up files on disk.

// Returns a page of gallery items ordered by their `position` field, optionally narrowed to
// one brand through `categorySlug`. The filter expands to include child categories so the
// brand's landing page shows everything underneath it, not only items pinned directly to the
// root category. `pageSize` is capped at 50 to keep a single request from pulling the whole
// gallery. Ordering by `position` leaves room for manual curation; nothing sets it yet, so
// in practice every item currently shares position 0 and ties fall back to database order.
export const list = asyncHandler(async (req: Request, res: Response) => {
  const { categorySlug } = req.query;
  const { page, take, skip } = parsePagination(req.query, 10, 50);

  const where: { categoryId?: { in: string[] } } = {};
  if (categorySlug && typeof categorySlug === 'string') {
    const category = await prisma.category.findUnique({ where: { slug: categorySlug } });
    if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục');

    // Tìm thêm các danh mục con (ví dụ: Bình Gốm, Lọ Hoa...)
    const children = await prisma.category.findMany({ where: { parentId: category.id } });
    const categoryIds = [category.id, ...children.map((c) => c.id)];

    where.categoryId = { in: categoryIds };
  }

  const [items, total] = await Promise.all([
    prisma.galleryItem.findMany({
      where,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      include: { category: true },
      skip,
      take,
    }),
    prisma.galleryItem.count({ where }),
  ]);

  sendSuccess(res, items, { page, pageSize: take, total });
});

// Stores a new gallery item pointing at an already-uploaded image URL and answers 201.
// `position` defaults to 0 rather than being left null so the ordering in `list` never has
// to deal with nulls. `altText` matters more than it looks: it is the text screen readers
// announce and the main signal Google Images has about the photo, which is why the admin
// form marks it required.
export const create = asyncHandler(async (req: Request, res: Response) => {
  const { title, imageUrl, altText, categoryId, position } = req.body;
  const item = await prisma.galleryItem.create({
    data: { title, imageUrl, altText, categoryId: categoryId || null, position: position ?? 0 },
  });
  sendSuccess(res, item, null, 201);
});

// Fetches a single item by id, used by the admin edit form to prefill its fields. A missing
// id answers 404. There is no visibility rule to apply here — unlike blog posts, gallery
// items have no draft state, so anything in the table is live.
export const getById = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const item = await prisma.galleryItem.findUnique({ where: { id } });
  if (!item) throw new ApiError(404, 'GALLERY_ITEM_NOT_FOUND', 'Không tìm thấy ảnh');
  sendSuccess(res, item);
});

const UPLOADS_DIR = path.resolve(__dirname, '..', 'public', 'uploads');

// Deletes the file behind a legacy `/uploads/<name>` URL, and nothing else. `imageUrl` is plain
// text an admin typed or pasted, so it can contain `../`: joining it onto the uploads folder as-is
// let "/uploads/../../package.json" walk out of the folder and unlink any file the server process
// can write. The resolved path must therefore stay strictly inside UPLOADS_DIR, otherwise the URL
// is ignored. A missing file is only logged — it must not abort an otherwise valid update/delete.
async function deleteLocalUpload(imageUrl: string | null): Promise<void> {
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;

  const filePath = path.resolve(UPLOADS_DIR, imageUrl.slice('/uploads/'.length));
  if (!filePath.startsWith(UPLOADS_DIR + path.sep)) {
    console.error(`Bỏ qua xoá file ngoài thư mục uploads: ${imageUrl}`);
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch (err) {
    console.error(`Lỗi khi xoá file ảnh: ${filePath}`, err);
  }
}

// Updates an item, falling back to the stored value for every field the request omits so a
// partial form submission cannot blank out the rest of the row. When the image is replaced
// and the previous one was a local `/uploads/` file, that file is deleted from disk to stop
// orphaned images accumulating; Cloudinary URLs are skipped because they are not ours to
// unlink here. The deletion is wrapped in try/catch and only logged on failure — a file that
// is already gone must not abort an otherwise valid update.
export const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { title, imageUrl, altText, categoryId, position } = req.body;
  const existing = await prisma.galleryItem.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'GALLERY_ITEM_NOT_FOUND', 'Không tìm thấy ảnh');

  // Nêu đổi ảnh, xoá ảnh cũ
  if (imageUrl && existing.imageUrl !== imageUrl) {
    await deleteLocalUpload(existing.imageUrl);
  }

  const updated = await prisma.galleryItem.update({
    where: { id },
    data: {
      title: title !== undefined ? title : existing.title,
      imageUrl: imageUrl || existing.imageUrl,
      altText: altText || existing.altText,
      categoryId: categoryId !== undefined ? categoryId : existing.categoryId,
      position: position !== undefined ? position : existing.position
    },
  });
  sendSuccess(res, updated);
});

// Deletes an item and, for legacy local images, the file behind it. The file is removed
// before the database row, which means a crash in between leaves a row pointing at a missing
// file — a broken thumbnail. The opposite order would leave an unreferenced file on disk
// instead. Neither is ideal; this order was chosen because a visible broken image gets
// noticed and fixed, whereas an orphaned file silently eats storage forever.
export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const existing = await prisma.galleryItem.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'GALLERY_ITEM_NOT_FOUND', 'Không tìm thấy ảnh');

  // Xoá file vật lý trên ổ cứng nếu imageUrl là đường dẫn cục bộ
  await deleteLocalUpload(existing.imageUrl);

  // Xoá record trong Database
  await prisma.galleryItem.delete({ where: { id } });

  sendSuccess(res, { message: 'Đã xoá ảnh' });
});

export default { list, create, getById, update, remove };
