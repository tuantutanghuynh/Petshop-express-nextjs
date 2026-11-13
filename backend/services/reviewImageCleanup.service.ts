import { v2 as cloudinary } from 'cloudinary';
import config from '../config/env';
import prisma from './prisma';

// Orphan review photos (ADR-028). A customer can upload a photo and never send the review, remove a
// photo while editing, or lose the review with a deleted product or account; the file then stays on
// Cloudinary. Once a day this lists the reviews folder, compares it with every photo any review
// still uses (whatever its status) and deletes what nobody uses — only files older than a grace
// period, so a photo uploaded for a review being written right now is safe.
//
// Deletion cannot be undone, so the sweep is narrow and stops on doubt: only the reviews/ prefix
// (never shop images), the full listing and the database read must succeed before anything is
// deleted, and one run deletes at most MAX_DELETE files.

export const GRACE_HOURS = 24;
export const MAX_DELETE = 500;
const MAX_PAGES = 10; // 500 files a page
const DELETE_BATCH = 100; // Cloudinary's limit per delete_resources call

export type CloudResource = { public_id: string; created_at: string };
export type CleanupDeps = {
  list: (cursor?: string) => Promise<{ resources: CloudResource[]; next_cursor?: string }>;
  destroy: (publicIds: string[]) => Promise<void>;
};

// "https://res.cloudinary.com/<cloud>/image/upload/v123/<folder>/<id>.jpg" → "<folder>/<id>"; null for
// anything not delivered from our cloud.
export function publicIdFromUrl(url: string, cloudName: string): string | null {
  const m = new RegExp(`^https://res\\.cloudinary\\.com/${cloudName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/image/upload/(?:v\\d+/)?(.+)\\.[a-z0-9]+$`, 'i').exec(url);
  return m ? m[1] : null;
}

export function selectOrphans(
  resources: CloudResource[],
  referenced: Set<string>,
  opts: { prefix: string; now: Date; graceHours: number; max: number },
): string[] {
  const cutoff = opts.now.getTime() - opts.graceHours * 60 * 60 * 1000;
  return resources
    .filter((r) => r.public_id.startsWith(opts.prefix) && !referenced.has(r.public_id))
    .filter((r) => {
      const created = Date.parse(r.created_at);
      return Number.isFinite(created) && created < cutoff; // an unreadable date is kept
    })
    .map((r) => r.public_id)
    .slice(0, opts.max);
}

// Same folder the customer upload writes to (controllers/upload.controller.ts, subfolder "reviews").
export const reviewImagePrefix = () => `${process.env.CLOUDINARY_FOLDER || 'miniecom-petshop'}/reviews/`;

async function referencedPublicIds(cloudName: string): Promise<Set<string>> {
  const rows = await prisma.productReview.findMany({ select: { images: true } });
  const ids = new Set<string>();
  for (const r of rows) {
    if (!Array.isArray(r.images)) continue;
    for (const url of r.images) if (typeof url === 'string') {
      const id = publicIdFromUrl(url, cloudName);
      if (id) ids.add(id);
    }
  }
  return ids;
}

export async function cleanupReviewImages(
  now = new Date(),
  deps: CleanupDeps = cloudinaryDeps(),
  prefix = reviewImagePrefix(),
  cloudName: string | null = config.cloudinary.cloudName ?? null,
): Promise<{ scanned: number; deleted: number }> {
  // Without the cloud name no stored URL could be matched and every file would look unused: stop
  // before even listing.
  if (!cloudName) throw new Error('CLOUDINARY_CLOUD_NAME is not set; review image cleanup skipped');
  // The whole listing first: a page that fails throws here, before any deletion.
  const resources: CloudResource[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await deps.list(cursor);
    resources.push(...res.resources);
    cursor = res.next_cursor;
    if (!cursor) break;
  }
  const referenced = await referencedPublicIds(cloudName);
  const orphans = selectOrphans(resources, referenced, { prefix, now, graceHours: GRACE_HOURS, max: MAX_DELETE });
  for (let i = 0; i < orphans.length; i += DELETE_BATCH) await deps.destroy(orphans.slice(i, i + DELETE_BATCH));
  return { scanned: resources.length, deleted: orphans.length };
}

export const isCloudinaryConfigured = () => Boolean(config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret);

function cloudinaryDeps(): CleanupDeps {
  cloudinary.config({ cloud_name: config.cloudinary.cloudName, api_key: config.cloudinary.apiKey, api_secret: config.cloudinary.apiSecret });
  return {
    list: async (cursor) => {
      const res = (await cloudinary.api.resources({ type: 'upload', resource_type: 'image', prefix: reviewImagePrefix(), max_results: 500, ...(cursor && { next_cursor: cursor }) })) as { resources: CloudResource[]; next_cursor?: string };
      return { resources: res.resources.map((r) => ({ public_id: r.public_id, created_at: r.created_at })), next_cursor: res.next_cursor };
    },
    destroy: async (ids) => {
      await cloudinary.api.delete_resources(ids, { type: 'upload', resource_type: 'image' });
    },
  };
}
