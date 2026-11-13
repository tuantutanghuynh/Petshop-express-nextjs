import { describe, expect, it } from 'vitest';
import prisma from '../../services/prisma';
import { cleanupReviewImages, type CleanupDeps } from '../../services/reviewImageCleanup.service';
import { createUser } from './helpers/factories';
import { IMG, orderWith, productForReview } from './helpers/reviews';

// The daily sweep against a real database and a fake Cloudinary (ADR-028): photos used by any review
// (whatever its status) survive; old unused ones under reviews/ go; nothing is deleted when the
// listing fails.

const NOW = new Date('2026-11-12T12:00:00.000Z');
const OLD = '2026-11-10T00:00:00Z';
const PREFIX = 'miniecom-petshop/reviews/';

async function reviewWith(images: string[], status: 'PENDING' | 'HIDDEN' | 'APPROVED') {
  const product = await productForReview();
  const user = await createUser();
  await orderWith(user.id, product.variants[0].id);
  await prisma.productReview.create({ data: { productId: product.id, userId: user.id, rating: 5, content: 'Hàng tốt, đóng gói kỹ.', images, status } });
}

function fakeCloudinary(pages: { public_id: string; created_at: string }[][]) {
  const deleted: string[][] = [];
  const cursors: (string | undefined)[] = [];
  const deps: CleanupDeps = {
    list: async (cursor) => {
      cursors.push(cursor);
      const i = cursor ? Number(cursor) : 0;
      return { resources: pages[i] ?? [], next_cursor: i + 1 < pages.length ? String(i + 1) : undefined };
    },
    destroy: async (ids) => { deleted.push(ids); },
  };
  return { deps, deleted, cursors };
}

describe('cleanupReviewImages', () => {
  it('deletes only old photos no review uses, across listing pages', async () => {
    await reviewWith([IMG(1)], 'APPROVED');
    await reviewWith([IMG(2)], 'HIDDEN');
    await reviewWith([IMG(3)], 'PENDING');
    const cloud = fakeCloudinary([
      [{ public_id: `${PREFIX}p1`, created_at: OLD }, { public_id: `${PREFIX}orphan-a`, created_at: OLD }],
      [{ public_id: `${PREFIX}p2`, created_at: OLD }, { public_id: `${PREFIX}p3`, created_at: OLD }, { public_id: `${PREFIX}orphan-b`, created_at: OLD }, { public_id: `${PREFIX}just-uploaded`, created_at: '2026-11-12T11:30:00Z' }],
    ]);
    const result = await cleanupReviewImages(NOW, cloud.deps, PREFIX);
    expect(cloud.cursors).toEqual([undefined, '1']);
    expect(cloud.deleted.flat().sort()).toEqual([`${PREFIX}orphan-a`, `${PREFIX}orphan-b`]);
    expect(result).toEqual({ scanned: 6, deleted: 2 });
  });

  it('deletes nothing when the listing fails part-way', async () => {
    const cloud = fakeCloudinary([[{ public_id: `${PREFIX}orphan`, created_at: OLD }]]);
    let calls = 0;
    const deps: CleanupDeps = {
      list: async (cursor) => { calls += 1; if (calls > 1) throw new Error('rate limited'); return { resources: [{ public_id: `${PREFIX}orphan`, created_at: OLD }], next_cursor: 'more' }; void cursor; },
      destroy: cloud.deps.destroy,
    };
    await expect(cleanupReviewImages(NOW, deps, PREFIX)).rejects.toThrow('rate limited');
    expect(cloud.deleted).toEqual([]);
  });

  it('refuses to run without the cloud name (every file would look unused)', async () => {
    const cloud = fakeCloudinary([[{ public_id: `${PREFIX}p1`, created_at: OLD }]]);
    await expect(cleanupReviewImages(NOW, cloud.deps, PREFIX, null)).rejects.toThrow('CLOUDINARY_CLOUD_NAME');
    expect(cloud.cursors).toEqual([]);
    expect(cloud.deleted).toEqual([]);
  });

  it('deletes in batches of at most 100', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ public_id: `${PREFIX}o${i}`, created_at: OLD }));
    const cloud = fakeCloudinary([many]);
    await cleanupReviewImages(NOW, cloud.deps, PREFIX);
    expect(cloud.deleted.map((b) => b.length)).toEqual([100, 100, 50]);
  });
});
