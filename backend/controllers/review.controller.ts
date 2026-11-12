import type { Request, Response } from 'express';
import type { ReviewStatus } from '@prisma/client';
import { REVIEW_ADMIN_PAGE_SIZE, REVIEW_MAX_PAGE_SIZE, REVIEW_PAGE_SIZE, type ReviewSort } from '../constants/review';
import * as reviews from '../services/review.service';
import * as moderation from '../services/reviewModeration.service';
import ApiError from '../utils/ApiError';
import sendSuccess from '../utils/ApiResponse';
import asyncHandler from '../utils/asyncHandler';
import { detectImageType } from '../utils/imageType';
import { logger } from '../utils/logger';
import parsePagination from '../utils/pagination';
import { uploadBufferToCloudinary } from './upload.controller';

// Reviews (spec 2026-11-10, ADR-027). The routes validated every field; rules live in the services.

const userId = (req: Request) => req.user?.id ?? '';
const id = (req: Request) => req.params.id as string;
const optionalInt = (v: unknown) => (typeof v === 'string' && v !== '' ? Number(v) : undefined);

export const eligibility = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await reviews.eligibility(userId(req), req.query.productId as string));
});

export const mine = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await reviews.myReviews(userId(req)));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const { productId, rating, content, images } = req.body as reviews.ReviewInput;
  sendSuccess(res, await reviews.createReview(userId(req), { productId, rating, content, images }), null, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { rating, content, images } = req.body as reviews.ReviewPatch;
  sendSuccess(res, await reviews.editReview(userId(req), id(req), { rating, content, images }));
});

// The browser's claimed type was checked by multer; the bytes are checked here, before anything is
// sent to Cloudinary.
export const uploadImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(422, 'FILE_REQUIRED', 'Thiếu file ảnh');
  if (!detectImageType(req.file.buffer)) throw new ApiError(422, 'INVALID_FILE_TYPE', 'Chỉ nhận ảnh JPG, PNG hoặc WebP');
  try {
    const result = await uploadBufferToCloudinary(req.file.buffer, 'reviews');
    sendSuccess(res, { url: result.secure_url }, null, 201);
  } catch (err) {
    logger.error({ errorName: err instanceof Error ? err.name : 'unknown' }, '[reviews] image upload failed');
    throw new ApiError(500, 'UPLOAD_FAILED', 'Chưa tải được ảnh lên. Thử lại sau.');
  }
});

export const publicList = asyncHandler(async (req: Request, res: Response) => {
  const { page, take, skip } = parsePagination(req.query, REVIEW_PAGE_SIZE, REVIEW_MAX_PAGE_SIZE);
  const { items, total, summary } = await reviews.publicReviews(req.params.slug as string, {
    rating: optionalInt(req.query.rating),
    hasImages: req.query.hasImages === 'true',
    sort: (typeof req.query.sort === 'string' && req.query.sort ? req.query.sort : 'newest') as ReviewSort,
    take,
    skip,
  });
  sendSuccess(res, items, { page, pageSize: take, total, summary });
});

export const adminList = asyncHandler(async (req: Request, res: Response) => {
  const { page, take, skip } = parsePagination(req.query, REVIEW_ADMIN_PAGE_SIZE, REVIEW_MAX_PAGE_SIZE * 5);
  const status = typeof req.query.status === 'string' && req.query.status ? (req.query.status as ReviewStatus) : undefined;
  const { items, total } = await moderation.adminReviews({ status, rating: optionalInt(req.query.rating), take, skip });
  sendSuccess(res, items, { page, pageSize: take, total });
});

export const pendingCount = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, { pending: await moderation.pendingReviewCount() });
});

export const approve = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await moderation.approveReview(id(req)));
});

export const hide = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await moderation.hideReview(id(req)));
});

export const reply = asyncHandler(async (req: Request, res: Response) => {
  const text = (req.body as { reply?: unknown }).reply;
  sendSuccess(res, await moderation.replyToReview(id(req), typeof text === 'string' ? text : null));
});
