import { describe, expect, it } from 'vitest';
import { buildAdminTree, deleteBlockReason, moveInSiblings, parentOptions, slugify, validateCategoryForm } from '../lib/adminCategories';
import type { AdminCategory } from '../lib/types';

// Rules of the /admin/danh-muc screen (spec 2026-10-20 admin categories): slugs from Vietnamese names,
// a three-level limit, ↑/↓ within siblings and a clear reason when a category cannot be deleted.
const zero = { products: 0, blogPosts: 0, galleryItems: 0, children: 0 };
const row = (id: string, parentId: string | null, sortOrder = 0): AdminCategory => ({ id, parentId, slug: id, name: id, description: null, sortOrder, _count: zero });
const rows = [row('petshop', null), row('cho', 'petshop', 0), row('meo', 'petshop', 1), row('cho-thuc-an', 'cho'), row('hat-cho-cho', 'cho-thuc-an')];

describe('slugify', () => {
  it('makes a URL slug from a Vietnamese name', () => {
    expect(slugify('  Pate cho Mèo & Chó  ')).toBe('pate-cho-meo-cho');
    expect(slugify('Đồ chơi')).toBe('do-choi');
    expect(slugify('!!!')).toBe('');
    expect(slugify('a'.repeat(100)).length).toBe(80);
  });
});

describe('buildAdminTree / parentOptions', () => {
  const { root, nodes } = buildAdminTree(rows, 'petshop');

  it('nests the shop rows with their depth', () => {
    expect(root?.slug).toBe('petshop');
    expect(nodes.map((n) => [n.slug, n.depth])).toEqual([['cho', 1], ['meo', 1]]);
    expect(nodes[0].children[0].children[0]).toMatchObject({ slug: 'hat-cho-cho', depth: 3 });
  });

  it('offers only parents that keep the tree within 3 levels and away from the node itself', () => {
    if (!root) throw new Error('root expected');
    const forNew = parentOptions(nodes, root, null).map((o) => o.id);
    expect(forNew).toEqual(['petshop', 'cho', 'cho-thuc-an', 'meo']);
    const group = nodes[0].children[0]; // cho-thuc-an (height 1)
    expect(parentOptions(nodes, root, group).map((o) => o.id)).toEqual(['petshop', 'cho', 'meo']);
    expect(parentOptions(nodes, root, nodes[0]).map((o) => o.id)).toEqual(['petshop']); // cho has height 2
  });

  it('labels each option with its full path, so same-named groups (Thức ăn of Chó / Mèo) differ', () => {
    if (!root) throw new Error('root expected');
    expect(parentOptions(nodes, root, null).map((o) => o.label)).toEqual(['petshop (gốc)', 'cho', 'cho › cho-thuc-an', 'meo']);
  });
});

describe('moveInSiblings', () => {
  it('swaps with the neighbour and stops at the edges', () => {
    expect(moveInSiblings(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveInSiblings(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveInSiblings(['a', 'b'], 'a', -1)).toBeNull();
    expect(moveInSiblings(['a', 'b'], 'b', 1)).toBeNull();
  });
});

describe('deleteBlockReason', () => {
  it('explains what still uses the category', () => {
    expect(deleteBlockReason(zero)).toBeNull();
    expect(deleteBlockReason({ ...zero, products: 3, children: 2 })).toBe('Còn 2 danh mục con, 3 sản phẩm.');
  });
});

describe('validateCategoryForm', () => {
  const ok = { name: 'Pate', slug: 'pate-cho-meo', description: '', parentId: 'p' };

  it('accepts what the server accepts', () => {
    expect(validateCategoryForm(ok)).toEqual({});
  });

  it('flags each field the server would refuse', () => {
    expect(validateCategoryForm({ ...ok, name: '  ' }).name).toBeTruthy();
    expect(validateCategoryForm({ ...ok, name: 'x'.repeat(101) }).name).toBeTruthy();
    expect(validateCategoryForm({ ...ok, slug: 'Pate Mèo' }).slug).toBeTruthy();
    expect(validateCategoryForm({ ...ok, description: 'x'.repeat(501) }).description).toBeTruthy();
    expect(validateCategoryForm({ ...ok, parentId: '' }).parentId).toBeTruthy();
  });
});
