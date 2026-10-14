import type { Request, Response } from 'express';
import prisma from '../services/prisma';
import asyncHandler from '../utils/asyncHandler';
import ApiError from '../utils/ApiError';
import { sendSuccess } from '../utils/ApiResponse';

// Lấy danh sách các cài đặt. Public endpoint để frontend load trang chủ
export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  const rawKeys = req.query.keys as string | undefined;
  const keys = rawKeys ? rawKeys.split(',') : [];

  const where = keys.length > 0 ? { key: { in: keys } } : {};
  const settings = await prisma.siteSetting.findMany({ where });

  // Chuyển array thành object { key: value } cho Frontend dễ gọi
  const configMap = settings.reduce((acc: Record<string, string>, curr: { key: string; value: string }) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});

  sendSuccess(res, configMap);
});

// Admin cập nhật (hoặc tạo mới) một hoặc nhiều setting cùng lúc
export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const { settings } = req.body; // Expect: { "homepage_hero_image": "url...", "homepage_quote": "..." }

  if (!settings || typeof settings !== 'object') {
    // Through ApiError like every other endpoint, so the answer is the standard
    // { data, meta, error } envelope the frontend reads (`json.error?.message`).
    throw new ApiError(422, 'VALIDATION_ERROR', 'Dữ liệu không hợp lệ');
  }

  const upsertPromises = Object.entries(settings).map(([key, value]) => {
    return prisma.siteSetting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
  });

  await prisma.$transaction(upsertPromises);

  sendSuccess(res, { message: 'Cập nhật cấu hình thành công' });
});

export default { getSettings, updateSettings };
