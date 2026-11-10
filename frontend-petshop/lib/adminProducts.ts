import { buildAdminTree, type AdminNode } from './adminCategories';
import type { FieldErrors } from './forms';
import { formatVnd } from './storefront';
import type { AdminCategory } from './types';
import { TEMPLATE_HINT, hasTemplateHints } from './productTemplates';

// Rules of the /admin/san-pham screens (test/adminProducts.test.ts). The backend checks the same
// limits (routes/product.route.ts); these show mistakes on the field before a round trip.

export const PRODUCT_STATUSES = [
  { key: 'active', label: 'Đang bán' },
  { key: 'draft', label: 'Nháp' },
  { key: 'archived', label: 'Lưu trữ' },
] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]['key'];

export type ProductsQuery = { status: ProductStatus | null; category: string | null; q: string; page: number };
export const PRODUCTS_PAGE_SIZE = 20;
const MAX_PRICE = 2_000_000_000;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isStatus = (s: string | null): s is ProductStatus => PRODUCT_STATUSES.some((x) => x.key === s);

export const statusLabel = (s: string): string => PRODUCT_STATUSES.find((x) => x.key === s)?.label ?? s;

export function parseProductsQuery(sp: URLSearchParams): ProductsQuery {
  const status = sp.get('trang-thai');
  const page = Number(sp.get('page'));
  return {
    status: isStatus(status) ? status : null,
    category: sp.get('danh-muc')?.trim() || null,
    q: (sp.get('q') ?? '').trim(),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function productsHref(q: Partial<ProductsQuery>): string {
  const sp = new URLSearchParams();
  if (q.status) sp.set('trang-thai', q.status);
  if (q.category) sp.set('danh-muc', q.category);
  if (q.q?.trim()) sp.set('q', q.q.trim());
  if (q.page && q.page > 1) sp.set('page', String(q.page));
  const s = sp.toString();
  return s ? `/admin/san-pham?${s}` : '/admin/san-pham';
}

// The admin list API searches accent-free names and needs at least 2 characters.
export function productsApiPath(q: ProductsQuery): string {
  const sp = new URLSearchParams();
  if (q.status) sp.set('status', q.status);
  if (q.category) sp.set('categorySlug', q.category);
  if (q.q.length >= 2) sp.set('search', q.q);
  sp.set('page', String(q.page));
  sp.set('pageSize', String(PRODUCTS_PAGE_SIZE));
  return `/products/admin/list?${sp}`;
}

export function priceRange(variants: { price: number }[]): string {
  if (variants.length === 0) return '—';
  const prices = variants.map((x) => x.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  return lo === hi ? formatVnd(lo) : `${formatVnd(lo)} – ${formatVnd(hi)}`;
}

export function stockSummary(variants: { stockQuantity: number; reservedQuantity: number }[]) {
  const stock = variants.reduce((s, x) => s + x.stockQuantity, 0);
  const reserved = variants.reduce((s, x) => s + x.reservedQuantity, 0);
  return { stock, reserved, sellable: stock - reserved };
}

// "120.000" and "120000" are both accepted (owners type the dots); null when not a whole number in range.
export function parseMoney(text: string): number | null {
  const digits = text.replace(/[.\s]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return n <= MAX_PRICE ? n : null;
}

// One row of the variants table. Prices and stock stay text while typed; `id` is null until saved.
export type VariantForm = { id: string | null; label: string; sku: string; price: string; compareAtPrice: string; stock: string; reserved: number };
export type ProductFormValues = {
  name: string;
  slug: string;
  brand: string;
  description: string;
  status: string;
  categoryId: string;
  attributes: Record<string, string>;
  variants: VariantForm[];
};

export function validateProductForm(v: ProductFormValues, mode: 'create' | 'edit'): FieldErrors {
  const e: FieldErrors = {};
  const name = v.name.trim();
  if (!name || name.length > 200) e.name = 'Nhập tên sản phẩm (tối đa 200 ký tự)';
  if (!SLUG.test(v.slug) || v.slug.length > 120) e.slug = 'Slug chỉ gồm a-z, 0-9 và dấu - giữa các chữ';
  if (!v.categoryId) e.categoryId = 'Chọn danh mục';
  // A hint line from a description outline (lib/productTemplates.ts) must never be published.
  if (hasTemplateHints(v.description)) e.description = `Còn dòng gợi ý (${TEMPLATE_HINT}) chưa thay bằng nội dung thật`;
  const seen = new Set<string>();
  v.variants.forEach((x, i) => {
    const sku = x.sku.trim();
    if (!sku || sku.length > 64) e[`variants.${i}.sku`] = 'Nhập SKU (tối đa 64 ký tự)';
    else if (seen.has(sku)) e[`variants.${i}.sku`] = 'SKU bị trùng';
    seen.add(sku);
    const price = parseMoney(x.price);
    if (price === null) e[`variants.${i}.price`] = 'Giá là số nguyên ≥ 0';
    if (x.compareAtPrice.trim()) {
      const was = parseMoney(x.compareAtPrice);
      if (was === null || (price !== null && was <= price)) e[`variants.${i}.compareAtPrice`] = 'Giá gạch phải lớn hơn giá bán';
    }
    // Stock is typed only for a variant being created; saved ones change stock in D2 (ledger).
    if ((mode === 'create' || x.id === null) && !/^\d+$/.test(x.stock.trim())) e[`variants.${i}.stock`] = 'Tồn đầu là số nguyên ≥ 0';
  });
  return e;
}

type VariantPatch = { label?: string; price?: number; compareAtPrice?: number | null };
const oldPrice = (t: string) => (t.trim() ? parseMoney(t) : null);

// PATCH bodies for the saved variants whose label or prices changed (new rows are posted apart).
export function variantChanges(before: VariantForm[], after: VariantForm[]): { id: string; body: VariantPatch }[] {
  const out: { id: string; body: VariantPatch }[] = [];
  for (const a of after) {
    const b = a.id ? before.find((x) => x.id === a.id) : undefined;
    if (!a.id || !b) continue;
    const body: VariantPatch = {};
    if (a.label.trim() !== b.label.trim()) body.label = a.label.trim();
    if (parseMoney(a.price) !== parseMoney(b.price)) body.price = parseMoney(a.price) ?? 0;
    if (oldPrice(a.compareAtPrice) !== oldPrice(b.compareAtPrice)) body.compareAtPrice = oldPrice(a.compareAtPrice);
    if (Object.keys(body).length > 0) out.push({ id: a.id, body });
  }
  return out;
}

// Every category of the shop, labelled with its path ("Chó › Thức ăn › Hạt cho chó"), parents first.
export function categoryPathOptions(rows: AdminCategory[], rootSlug: string): { id: string; slug: string; label: string }[] {
  const walk = (nodes: AdminNode[], prefix: string): { id: string; slug: string; label: string }[] =>
    nodes.flatMap((n) => {
      const label = prefix ? `${prefix} › ${n.name}` : n.name;
      return [{ id: n.id, slug: n.slug, label }, ...walk(n.children, label)];
    });
  return walk(buildAdminTree(rows, rootSlug).nodes, '');
}

// Spec values to save: empty fields dropped, number fields stored as numbers ("1,5" → 1.5).
export function attributeValues(attrs: Record<string, string>, defs: { attributeKey: string; attributeType: string }[]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const d of defs) {
    const raw = (attrs[d.attributeKey] ?? '').trim();
    if (!raw) continue;
    const n = Number(raw.replace(',', '.'));
    out[d.attributeKey] = d.attributeType === 'number' && Number.isFinite(n) ? n : raw;
  }
  return out;
}

// express-validator reports "variants[0].sku"; the form names its fields "variants.0.sku".
export function normalizeErrorKeys(errors: FieldErrors): FieldErrors {
  return Object.fromEntries(Object.entries(errors).map(([k, msg]) => [k.replace(/\[(\d+)\]/g, '.$1'), msg]));
}

const ROW_FIELDS = ['label', 'sku', 'price', 'compareAtPrice', 'stock'] as const;

// After an edit, the errors still worth showing: a field's message goes once that field changes.
// When a variant row is added or removed (rows keep their identity then), messages follow their
// row to its new index and the removed row's messages go with it.
export function dropFixedErrors(errors: FieldErrors, before: ProductFormValues, after: ProductFormValues): FieldErrors {
  const out: FieldErrors = {};
  const sameRows = before.variants.length === after.variants.length;
  for (const [key, msg] of Object.entries(errors)) {
    const row = /^variants\.(\d+)\.(\w+)$/.exec(key);
    if (!row) {
      const field = key as keyof ProductFormValues;
      if (!(field in before) || before[field] === after[field]) out[key] = msg;
      continue;
    }
    const [i, field] = [Number(row[1]), row[2] as (typeof ROW_FIELDS)[number]];
    if (sameRows) {
      if (before.variants[i]?.[field] === after.variants[i]?.[field]) out[key] = msg;
    } else {
      const to = after.variants.indexOf(before.variants[i]);
      if (to >= 0) out[`variants.${to}.${field}`] = msg;
    }
  }
  return out;
}
