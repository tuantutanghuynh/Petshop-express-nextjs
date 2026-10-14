import type { Request, Response } from 'express';
import prisma from '../services/prisma';
import ApiError from '../utils/ApiError';
import asyncHandler from '../utils/asyncHandler';
import { sendSuccess } from '../utils/ApiResponse';
import { parsePagination } from '../utils/pagination';

// Handles the public contact form and the admin inbox that reads it. This is the only place
// in the API where an anonymous visitor writes to the database, so the submit path carries
// its own anti-spam measures on top of the rate limiter mounted in the route file.

// Accepts a message from the public contact form. `website_url` is a honeypot: the field is
// hidden from real users by CSS, so anything filling it is an automated bot — the request is
// answered with a normal success response and quietly discarded, because a visible rejection
// would just teach the bot to skip the field next time. Name, email and message are checked
// here rather than left to express-validator to keep the honeypot short-circuit above them.
// Nothing is emailed anywhere; messages wait in the database for the admin inbox below.
export const submitContact = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, phone, subject, message, website_url } = req.body;

  // Honeypot check (Nếu website_url được điền => Là Bot spam)
  if (website_url) {
    // Trả về 200 OK giả để đánh lừa bot
    return sendSuccess(res, { message: 'Tin nhắn đã được gửi.' }, null, 200);
  }

  if (!name || !email || !message) {
    throw new ApiError(400, 'MISSING_FIELDS', 'Vui lòng điền họ tên, email và nội dung.');
  }

  await prisma.contactMessage.create({
    data: { name, email, phone, subject, message }
  });

  sendSuccess(res, { message: 'Tin nhắn đã được gửi.' }, null, 201);
});

// Admin-only listing of received messages, newest first, with pagination counters in `meta`.
// The optional `isRead` query param arrives as the string `"true"` or `"false"` and is
// compared as such, since query strings are never real booleans; an empty value means "no
// filter" so the UI can offer an "all" option. Unlike blog and gallery, there is no brand
// filter here — the contact table has no category, so both storefronts would share this
// inbox if the second one ever goes live.
export const adminList = asyncHandler(async (req: Request, res: Response) => {
  const { isRead } = req.query;
  const { page, take, skip } = parsePagination(req.query, 20, 100);

  const where: { isRead?: boolean } = {};
  if (isRead !== undefined && isRead !== '') {
    where.isRead = isRead === 'true';
  }

  const [items, total] = await Promise.all([
    prisma.contactMessage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
    }),
    prisma.contactMessage.count({ where }),
  ]);

  sendSuccess(res, items, { page, pageSize: take, total });
});

// Flags one message as read, which is what dims it in the admin inbox. The row is fetched
// first so an unknown id answers 404 instead of the 500 Prisma throws when `update` matches
// nothing. The flag only ever moves from false to true — there is no "mark as unread" —
// because the inbox uses it purely to highlight what has not been looked at yet.
export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const existing = await prisma.contactMessage.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'MESSAGE_NOT_FOUND', 'Không tìm thấy tin nhắn');

  const updated = await prisma.contactMessage.update({
    where: { id },
    data: { isRead: true }
  });

  sendSuccess(res, updated);
});

// Permanently deletes a message, used to clear spam that slipped past the honeypot. The
// existence check again exists to turn a stale id into a clean 404. There is no soft delete
// and no undo, so the admin UI asks for confirmation before calling this.
export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const existing = await prisma.contactMessage.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'MESSAGE_NOT_FOUND', 'Không tìm thấy tin nhắn');

  await prisma.contactMessage.delete({ where: { id } });
  sendSuccess(res, { message: 'Đã xoá tin nhắn' });
});

export default { submitContact, adminList, markAsRead, remove };
