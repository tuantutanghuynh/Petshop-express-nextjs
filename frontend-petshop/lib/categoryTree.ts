import type { Category } from './types';

// The shop's categories as a tree under the brand root (test/categoryTree.test.ts). GET /categories
// returns every storefront's rows flat; this keeps only our branch, nested and in sortOrder.
export type CategoryNode = Category & { children: CategoryNode[] };

const order = (a: Category, b: Category) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'vi');

export function buildCategoryTree(all: Category[], rootSlug: string): CategoryNode[] {
  const root = all.find((c) => c.parentId === null && c.slug === rootSlug);
  if (!root) return [];
  // Each row has one parent, so a walk down from the root can never meet a loop.
  const build = (parentId: string): CategoryNode[] =>
    all.filter((c) => c.parentId === parentId).sort(order).map((c) => ({ ...c, children: build(c.id) }));
  return build(root.id);
}

export function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

// Species → … → the category itself, for breadcrumbs; [] when the slug is not in the tree.
export function categoryTrail(nodes: CategoryNode[], slug: string): CategoryNode[] {
  for (const n of nodes) {
    if (n.slug === slug) return [n];
    const below = categoryTrail(n.children, slug);
    if (below.length > 0) return [n, ...below];
  }
  return [];
}
