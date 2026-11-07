import type { Request, Response } from 'express';
import type { NewsletterStatus } from '@prisma/client';
import { siteUrl } from '../config/env';
import { ADMIN_MAX_PAGE_SIZE, ADMIN_PAGE_SIZE, SUBSCRIBE_MESSAGE } from '../constants/newsletter';
import { sendNewsletterConfirm, sendNewsletterWelcome } from '../services/email.service';
import * as newsletter from '../services/newsletter.service';
import asyncHandler from '../utils/asyncHandler';
import { logger } from '../utils/logger';
import parsePagination from '../utils/pagination';
import sendSuccess from '../utils/ApiResponse';

// Newsletter signup (spec 2026-11-07). Emails go out without the answer waiting for them: if it
// waited for SMTP, a new address would answer measurably slower than a subscribed one. A failure is
// logged by error name only — the links in these emails act on the subscription.
const logMailFailure = (what: string) => (err: unknown) => {
  logger.error({ errorName: err instanceof Error ? err.name : 'unknown error' }, `${what} email failed`);
};

export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  const email = req.body.email as string;
  const outcome = await newsletter.subscribe(email);
  if (outcome.send) {
    void sendNewsletterConfirm(email, `${siteUrl}/xac-nhan-dang-ky?token=${outcome.confirmToken}`).catch(logMailFailure('newsletter confirm'));
  }
  sendSuccess(res, { message: SUBSCRIBE_MESSAGE });
});

export const confirm = asyncHandler(async (req: Request, res: Response) => {
  const { email, unsubscribeToken } = await newsletter.confirm(req.body.token as string);
  void sendNewsletterWelcome(email, `${siteUrl}/huy-dang-ky?token=${unsubscribeToken}`).catch(logMailFailure('newsletter welcome'));
  sendSuccess(res, { confirmed: true });
});

export const unsubscribe = asyncHandler(async (req: Request, res: Response) => {
  await newsletter.unsubscribe(req.body.token as string);
  sendSuccess(res, { unsubscribed: true });
});

// The status value is already checked against the enum by the route.
export const list = asyncHandler(async (req: Request, res: Response) => {
  const { page, take, skip } = parsePagination(req.query, ADMIN_PAGE_SIZE, ADMIN_MAX_PAGE_SIZE);
  const status = typeof req.query.status === 'string' && req.query.status !== '' ? (req.query.status as NewsletterStatus) : undefined;
  const q = typeof req.query.q === 'string' && req.query.q.trim() !== '' ? req.query.q.trim() : undefined;
  const { items, total } = await newsletter.listSubscribers({ status, q, take, skip });
  sendSuccess(res, items, { page, pageSize: take, total });
});

export const exportCsv = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await newsletter.exportConfirmed());
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await newsletter.deleteSubscriber(req.params.id as string);
  sendSuccess(res, { message: 'Đã xoá người đăng ký' });
});
