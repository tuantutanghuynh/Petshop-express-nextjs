import type { FieldErrors } from './forms';
import type { AdminCategory } from './types';

// Rules of the /admin/danh-muc screen (test/adminCategories.test.ts). The backend enforces the same
// limits; these keep the form from offering choices the server would refuse.
export const MAX_CATEGORY_DEPTH = 3;

export type AdminNode = AdminCategory & { depth: number; children: AdminNode[] };

// "Pate cho Mèo" → "pate-cho-meo": accents removed, đ → d, anything else → "-", max 80 characters.
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

const order = (a: AdminCategory, b: AdminCategory) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'vi');

export function buildAdminTree(rows: AdminCategory[], rootSlug: string): { root: AdminCategory | null; nodes: AdminNode[] } {
  const root = rows.find((r) => r.parentId === null && r.slug === rootSlug) ?? null;
  if (!root) return { root: null, nodes: [] };
  const build = (parentId: string, depth: number): AdminNode[] =>
    rows.filter((r) => r.parentId === parentId).sort(order).map((r) => ({ ...r, depth, children: build(r.id, depth + 1) }));
  return { root, nodes: build(root.id, 1) };
}

export function subtreeHeightOf(node: AdminNode): number {
  return node.children.length === 0 ? 0 : 1 + Math.max(...node.children.map(subtreeHeightOf));
}

const flatten = (nodes: AdminNode[]): AdminNode[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);

// Every node with its path from the species ("Chó › Thức ăn"), parents first.
const withPaths = (nodes: AdminNode[], prefix = ''): { node: AdminNode; path: string }[] =>
  nodes.flatMap((n) => {
    const path = prefix ? `${prefix} › ${n.name}` : n.name;
    return [{ node: n, path }, ...withPaths(n.children, path)];
  });

// Where a category may go: the root or any node whose depth + 1 + the moved subtree's height stays
// within 3 levels, never the category itself or something below it.
export function parentOptions(nodes: AdminNode[], root: AdminCategory, editing: AdminNode | null): { id: string; label: string }[] {
  const height = editing ? subtreeHeightOf(editing) : 0;
  const banned = new Set(editing ? flatten([editing]).map((n) => n.id) : []);
  const fits = (depth: number) => depth + 1 + height <= MAX_CATEGORY_DEPTH;
  return [
    ...(fits(0) ? [{ id: root.id, label: `${root.name} (gốc)` }] : []),
    // Full path labels: Chó and Mèo both have a "Thức ăn" group.
    ...withPaths(nodes).filter(({ node }) => !banned.has(node.id) && fits(node.depth)).map(({ node, path }) => ({ id: node.id, label: path })),
  ];
}

export function moveInSiblings(ids: string[], id: string, dir: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function deleteBlockReason(c: AdminCategory['_count']): string | null {
  const parts = [
    c.children > 0 && `${c.children} danh mục con`,
    c.products > 0 && `${c.products} sản phẩm`,
    c.blogPosts > 0 && `${c.blogPosts} bài viết`,
    c.galleryItems > 0 && `${c.galleryItems} ảnh`,
  ].filter(Boolean);
  return parts.length > 0 ? `Còn ${parts.join(', ')}.` : null;
}

export type CategoryFormValues = { name: string; slug: string; description: string; parentId: string };

// Same limits as backend/routes/category.route.ts, so the owner sees the problem on the field.
export function validateCategoryForm(v: CategoryFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const name = v.name.trim();
  if (name.length < 1 || name.length > 100) errors.name = 'Nhập tên danh mục (tối đa 100 ký tự)';
  if (!/^[a-z0-9-]{1,80}$/.test(v.slug)) errors.slug = 'Slug chỉ gồm a-z, 0-9 và dấu - (tối đa 80 ký tự)';
  if (v.description.length > 500) errors.description = 'Mô tả tối đa 500 ký tự';
  if (!v.parentId) errors.parentId = 'Chọn danh mục cha';
  return errors;
}
