import { describe, expect, it } from 'vitest';
import { publicIdFromUrl, selectOrphans } from '../services/reviewImageCleanup.service';

// Orphan review photos (ADR-028): only files under the reviews folder, older than the grace period,
// and used by no review are ever chosen for deletion.

const CLOUD = 'test-cloud';
const PREFIX = 'miniecom-petshop/reviews/';

describe('publicIdFromUrl', () => {
  it('takes the public id out of a delivery URL, with or without a version', () => {
    expect(publicIdFromUrl(`https://res.cloudinary.com/${CLOUD}/image/upload/v1731/miniecom-petshop/reviews/abc123.jpg`, CLOUD)).toBe('miniecom-petshop/reviews/abc123');
    expect(publicIdFromUrl(`https://res.cloudinary.com/${CLOUD}/image/upload/miniecom-petshop/reviews/x_y.webp`, CLOUD)).toBe('miniecom-petshop/reviews/x_y');
  });
  it('is null for anything that is not one of our uploads', () => {
    expect(publicIdFromUrl('https://res.cloudinary.com/other/image/upload/v1/a.jpg', CLOUD)).toBeNull();
    expect(publicIdFromUrl('https://evil.example/image/upload/v1/a.jpg', CLOUD)).toBeNull();
    expect(publicIdFromUrl('not a url', CLOUD)).toBeNull();
  });
});

describe('selectOrphans', () => {
  const NOW = new Date('2026-11-12T12:00:00.000Z');
  const old = '2026-11-10T00:00:00Z';
  const fresh = '2026-11-12T11:00:00Z';
  const res = (public_id: string, created_at = old) => ({ public_id, created_at });

  it('picks old files in the reviews folder that no review uses', () => {
    const files = [res(`${PREFIX}used`), res(`${PREFIX}orphan`), res(`${PREFIX}new`, fresh), res('miniecom-petshop/products/p1')];
    expect(selectOrphans(files, new Set([`${PREFIX}used`]), { prefix: PREFIX, now: NOW, graceHours: 24, max: 500 })).toEqual([`${PREFIX}orphan`]);
  });

  it('never picks more than the per-run cap', () => {
    const files = Array.from({ length: 10 }, (_, i) => res(`${PREFIX}o${i}`));
    expect(selectOrphans(files, new Set(), { prefix: PREFIX, now: NOW, graceHours: 24, max: 3 })).toHaveLength(3);
  });

  it('keeps a file whose date cannot be read', () => {
    expect(selectOrphans([res(`${PREFIX}x`, 'garbage')], new Set(), { prefix: PREFIX, now: NOW, graceHours: 24, max: 500 })).toEqual([]);
  });
});
