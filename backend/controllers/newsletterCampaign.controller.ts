import type { Request, Response } from 'express';
import type { NewsletterCampaignStatus } from '@prisma/client';
import { CAMPAIGN_MAX_PAGE_SIZE, CAMPAIGN_PAGE_SIZE } from '../constants/newsletter';
import * as campaigns from '../services/newsletterCampaign.service';
import type { CampaignInput } from '../services/newsletterCampaign.service';
import type { FeaturedRef } from '../services/newsletterSend.service';
import { unsubscribe } from '../services/newsletter.service';
import sendSuccess from '../utils/ApiResponse';
import asyncHandler from '../utils/asyncHandler';
import parsePagination from '../utils/pagination';

// Admin newsletter campaigns (spec 2026-11-10). The routes have validated every field, so the body
// is only picked apart here; the rules live in services/newsletterCampaign.service.ts.

const id = (req: Request) => req.params.id as string;

function input(body: Record<string, unknown>): Partial<CampaignInput> {
  return {
    ...(typeof body.subject === 'string' && { subject: body.subject }),
    ...(body.preheader !== undefined && { preheader: typeof body.preheader === 'string' && body.preheader.trim() ? body.preheader : null }),
    ...(typeof body.content === 'string' && { content: body.content }),
    ...(typeof body.isAdvertising === 'boolean' && { isAdvertising: body.isAdvertising }),
    ...(Array.isArray(body.featured) && { featured: (body.featured as FeaturedRef[]).map((f) => ({ type: f.type, id: f.id })) }),
  };
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { page, take, skip } = parsePagination(req.query, CAMPAIGN_PAGE_SIZE, CAMPAIGN_MAX_PAGE_SIZE);
  const status = typeof req.query.status === 'string' && req.query.status !== '' ? (req.query.status as NewsletterCampaignStatus) : undefined;
  const { items, total } = await campaigns.listCampaigns({ status, take, skip });
  sendSuccess(res, items, { page, pageSize: take, total });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const data = input(req.body as Record<string, unknown>);
  sendSuccess(res, await campaigns.createCampaign({ subject: data.subject ?? '', content: data.content ?? '', ...data }), null, 201);
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await campaigns.getCampaign(id(req)));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await campaigns.updateCampaign(id(req), input(req.body as Record<string, unknown>)));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await campaigns.deleteCampaign(id(req));
  sendSuccess(res, { message: 'Đã xoá bản tin' });
});

export const schedule = asyncHandler(async (req: Request, res: Response) => {
  const raw = (req.body as { scheduledAt?: unknown }).scheduledAt;
  sendSuccess(res, await campaigns.scheduleCampaign(id(req), typeof raw === 'string' && raw ? new Date(raw) : undefined));
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await campaigns.cancelCampaign(id(req)));
});

export const test = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await campaigns.sendTestCampaign(id(req), req.user?.id ?? ''));
});

// RFC 8058: the mail provider POSTs "List-Unsubscribe=One-Click" to the URL from the header; the
// token is in the query string, there is no page and no JavaScript.
export const oneClick = asyncHandler(async (req: Request, res: Response) => {
  await unsubscribe(req.query.token as string);
  sendSuccess(res, { unsubscribed: true });
});
