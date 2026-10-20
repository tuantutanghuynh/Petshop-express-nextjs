import { describe, expect, it } from 'vitest';
import { CATEGORY_TREE, flattenTree, planCategoryTree } from '../scripts/categoryTree';

// The petshop category tree (spec 2026-10-20) and the dry-run planner behind
// `npm run seed:category-tree`. The planner decides what a run would create or update; nothing
// is ever deleted.
describe('category tree data', () => {
  const flat = flattenTree('petshop', CATEGORY_TREE);

  it('has Chó and Mèo with the groups and leaves of the spec', () => {
    expect(flat.slice(0, 2).map((c) => c.slug)).toEqual(['cho', 'cho-thuc-an']);
    expect(flat.filter((c) => c.parentSlug === 'petshop').map((c) => c.name)).toEqual(['Chó', 'Mèo']);
    expect(flat.filter((c) => c.parentSlug === 'cho').length).toBe(4);
    expect(flat.filter((c) => c.parentSlug === 'meo').length).toBe(5);
    expect(flat.length).toBe(2 + 9 + 35);
  });

  it('uses unique, URL-safe slugs and lists parents before children', () => {
    const slugs = flat.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]{1,80}$/);
    const seen = new Set(['petshop']);
    for (const c of flat) {
      expect(seen.has(c.parentSlug), c.slug).toBe(true);
      seen.add(c.slug);
    }
  });

  it('numbers siblings in listed order', () => {
    expect(flat.filter((c) => c.parentSlug === 'cho-thuc-an').map((c) => c.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe('planCategoryTree', () => {
  const wanted = [
    { slug: 'cho', name: 'Chó', parentSlug: 'petshop', sortOrder: 0 },
    { slug: 'meo', name: 'Mèo', parentSlug: 'petshop', sortOrder: 1 },
    { slug: 'cho-thuc-an', name: 'Thức ăn', parentSlug: 'cho', sortOrder: 0 },
  ];

  it('creates what is missing, updates what differs, keeps the rest', () => {
    const plan = planCategoryTree(
      [
        { slug: 'cho', name: 'Cho chó', parentSlug: 'petshop', sortOrder: 0 },
        { slug: 'meo', name: 'Mèo', parentSlug: 'petshop', sortOrder: 1 },
      ],
      wanted,
    );
    expect(plan.map((s) => `${s.action}:${s.category.slug}`)).toEqual(['update:cho', 'keep:meo', 'create:cho-thuc-an']);
  });

  it('moves a category whose parent differs', () => {
    const plan = planCategoryTree([{ slug: 'cho-thuc-an', name: 'Thức ăn', parentSlug: 'petshop', sortOrder: 0 }], wanted);
    expect(plan.find((s) => s.category.slug === 'cho-thuc-an')?.action).toBe('update');
  });
});
