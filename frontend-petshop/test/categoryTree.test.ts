import { describe, expect, it } from 'vitest';
import { buildCategoryTree, categoryTrail, flattenTree } from '../lib/categoryTree';
import type { Category } from '../lib/types';

// The shop's categories form a tree under the brand root (Chó → Thức ăn → Hạt cho chó). Menus,
// breadcrumbs and the sitemap all read it; other storefronts in the same table stay out.
const cat = (id: string, parentId: string | null, sortOrder = 0): Category => ({ id, parentId, slug: id, name: id, description: null, sortOrder });
const all = [
  cat('petshop', null), cat('gom-su', null), cat('gom-child', 'gom-su'),
  cat('meo', 'petshop', 1), cat('cho', 'petshop', 0),
  cat('cho-thuc-an', 'cho'), cat('hat-cho-cho', 'cho-thuc-an', 1), cat('pate-cho-cho', 'cho-thuc-an', 0),
];

describe('buildCategoryTree', () => {
  const tree = buildCategoryTree(all, 'petshop');

  it('nests children under their parents in sortOrder', () => {
    expect(tree.map((n) => n.slug)).toEqual(['cho', 'meo']);
    expect(tree[0].children[0].children.map((n) => n.slug)).toEqual(['pate-cho-cho', 'hat-cho-cho']);
  });

  it('leaves other storefronts out and returns [] for an unknown root', () => {
    expect(flattenTree(tree).some((n) => n.slug.startsWith('gom'))).toBe(false);
    expect(buildCategoryTree(all, 'nope')).toEqual([]);
  });
});

describe('flattenTree / categoryTrail', () => {
  const tree = buildCategoryTree(all, 'petshop');

  it('lists every node, parents first', () => {
    expect(flattenTree(tree).map((n) => n.slug)).toEqual(['cho', 'cho-thuc-an', 'pate-cho-cho', 'hat-cho-cho', 'meo']);
  });

  it('gives the path from the species down to the category', () => {
    expect(categoryTrail(tree, 'hat-cho-cho').map((n) => n.slug)).toEqual(['cho', 'cho-thuc-an', 'hat-cho-cho']);
    expect(categoryTrail(tree, 'meo').map((n) => n.slug)).toEqual(['meo']);
    expect(categoryTrail(tree, 'gom-child')).toEqual([]);
  });
});
