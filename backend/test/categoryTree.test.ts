import { describe, expect, it } from 'vitest';
import { categoryDepth, categorySubtreeIds, sameMembers, subtreeHeight } from '../utils/categoryTree';

// Category filters must reach every level below the chosen category (Chó → Thức ăn → Hạt cho chó),
// not just direct children, and a bad parentId loop must not hang the request.
const rows = [
  { id: 'root', parentId: null },
  { id: 'cho', parentId: 'root' },
  { id: 'cho-thuc-an', parentId: 'cho' },
  { id: 'hat-cho-cho', parentId: 'cho-thuc-an' },
  { id: 'meo', parentId: 'root' },
  { id: 'other', parentId: null },
];

describe('categorySubtreeIds', () => {
  it('returns the category and every descendant, root first', () => {
    expect(categorySubtreeIds(rows, 'cho')).toEqual(['cho', 'cho-thuc-an', 'hat-cho-cho']);
    expect(categorySubtreeIds(rows, 'root').sort()).toEqual(['cho', 'cho-thuc-an', 'hat-cho-cho', 'meo', 'root']);
  });

  it('returns just the id for a leaf', () => {
    expect(categorySubtreeIds(rows, 'hat-cho-cho')).toEqual(['hat-cho-cho']);
  });

  it('stops on a parent loop instead of running forever', () => {
    const loop = [{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }];
    expect(categorySubtreeIds(loop, 'a')).toEqual(['a', 'b']);
  });
});

// Admin category rules (spec 2026-10-20 admin categories): the tree may not grow past three levels
// below the brand root, and a reorder must list exactly the siblings.
describe('categoryDepth / subtreeHeight', () => {
  it('counts levels below the root', () => {
    expect(categoryDepth(rows, 'root', 'root')).toBe(0);
    expect(categoryDepth(rows, 'cho', 'root')).toBe(1);
    expect(categoryDepth(rows, 'hat-cho-cho', 'root')).toBe(3);
    expect(categoryDepth(rows, 'other', 'root')).toBe(-1);
  });

  it('gives -1 for a parent loop instead of hanging', () => {
    expect(categoryDepth([{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }], 'a', 'root')).toBe(-1);
  });

  it('measures how many levels hang below a category', () => {
    expect(subtreeHeight(rows, 'hat-cho-cho')).toBe(0);
    expect(subtreeHeight(rows, 'cho')).toBe(2);
    expect(subtreeHeight(rows, 'root')).toBe(3);
  });
});

describe('sameMembers', () => {
  it('accepts the same ids in any order and refuses missing, extra or repeated ids', () => {
    expect(sameMembers(['b', 'a'], ['a', 'b'])).toBe(true);
    expect(sameMembers(['a'], ['a', 'b'])).toBe(false);
    expect(sameMembers(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
    expect(sameMembers(['a', 'a'], ['a', 'b'])).toBe(false);
  });
});
