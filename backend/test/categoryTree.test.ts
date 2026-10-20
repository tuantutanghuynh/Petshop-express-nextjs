import { describe, expect, it } from 'vitest';
import { categorySubtreeIds } from '../utils/categoryTree';

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
