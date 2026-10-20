import { categoryPath, type Crumb } from './structuredData';

// Trang chủ › species › group › leaf (› product). The last crumb is the current page and has no
// link, on the page and in BreadcrumbList JSON-LD alike (test/catalog.seo.test.ts).
export function categoryCrumbs(trail: { name: string; slug: string }[], current?: string): Crumb[] {
  const crumbs: Crumb[] = [{ name: 'Trang chủ', path: '/' }, ...trail.map((c) => ({ name: c.name, path: categoryPath(c.slug) }))];
  if (current) return [...crumbs, { name: current }];
  const last = crumbs.pop();
  return last ? [...crumbs, { name: last.name }] : crumbs;
}
