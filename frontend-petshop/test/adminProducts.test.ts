import { describe, expect, it } from 'vitest';
import {
  attributeValues,
  categoryPathOptions,
  dropFixedErrors,
  normalizeErrorKeys,
  parseMoney,
  parseProductsQuery,
  priceRange,
  productsApiPath,
  productsHref,
  stockSummary,
  validateProductForm,
  variantChanges,
  type ProductFormValues,
  type VariantForm,
} from '../lib/adminProducts';
import type { AdminCategory } from '../lib/types';

// Rules of the /admin/san-pham screens (spec 2026-11-04 admin products). The backend checks the
// same limits; these keep mistakes on the field instead of a failed round trip.

const v = (over: Partial<VariantForm> = {}): VariantForm => ({
  id: 'v1', label: 'Gói 1kg', sku: 'HAT-1', price: '120000', compareAtPrice: '', stock: '5', reserved: 0, ...over,
});
const form = (over: Partial<ProductFormValues> = {}): ProductFormValues => ({
  name: 'Hạt cho chó', slug: 'hat-cho-cho', brand: '', description: '', status: 'draft', categoryId: 'c1', attributes: {}, variants: [v({ id: null })], ...over,
});
const plain = (s: string) => s.replace(/\s/g, ' ');

describe('products query', () => {
  it('reads and writes the URL, leaving defaults out', () => {
    const q = parseProductsQuery(new URLSearchParams('trang-thai=draft&danh-muc=cho&q=%20pate%20&page=2'));
    expect(q).toEqual({ status: 'draft', category: 'cho', q: 'pate', page: 2 });
    expect(productsHref({ ...q, page: 1 })).toBe('/admin/san-pham?trang-thai=draft&danh-muc=cho&q=pate');
    expect(productsHref({ status: null, category: null, q: '', page: 1 })).toBe('/admin/san-pham');
    expect(productsApiPath(q)).toBe('/products/admin/list?status=draft&categorySlug=cho&search=pate&page=2&pageSize=20');
  });

  it('falls back on unknown or broken values', () => {
    expect(parseProductsQuery(new URLSearchParams('trang-thai=xoa&page=-3'))).toEqual({ status: null, category: null, q: '', page: 1 });
  });

  it('does not send a one-letter search (the API needs 2 characters)', () => {
    expect(productsApiPath({ status: null, category: null, q: 'a', page: 1 })).toBe('/products/admin/list?page=1&pageSize=20');
  });
});

describe('price and stock', () => {
  it('shows the cheapest and dearest variant', () => {
    expect(plain(priceRange([{ price: 590000 }, { price: 28000 }]))).toBe('28.000 ₫ – 590.000 ₫');
    expect(plain(priceRange([{ price: 28000 }, { price: 28000 }]))).toBe('28.000 ₫');
    expect(priceRange([])).toBe('—');
  });

  it('adds up stock and what can still be sold', () => {
    expect(stockSummary([{ stockQuantity: 30, reservedQuantity: 2 }, { stockQuantity: 4, reservedQuantity: 0 }])).toEqual({ stock: 34, reserved: 2, sellable: 32 });
  });

  it('reads money typed with or without dots', () => {
    expect(parseMoney('120.000')).toBe(120000);
    expect(parseMoney(' 0 ')).toBe(0);
    expect(parseMoney('12.5k')).toBeNull();
    expect(parseMoney('2000000001')).toBeNull();
  });
});

describe('validateProductForm', () => {
  it('accepts a complete product', () => {
    expect(validateProductForm(form(), 'create')).toEqual({});
  });

  it('points at each wrong field', () => {
    const e = validateProductForm(
      form({ name: ' ', slug: 'Có Dấu', categoryId: '', variants: [v({ id: null, sku: '', price: 'abc', compareAtPrice: '1000', stock: '-1' })] }),
      'create',
    );
    expect(Object.keys(e).sort()).toEqual(['categoryId', 'name', 'slug', 'variants.0.price', 'variants.0.sku', 'variants.0.stock'].sort());
  });

  it('wants the old price above the selling price', () => {
    expect(validateProductForm(form({ variants: [v({ id: null, compareAtPrice: '100000' })] }), 'create')['variants.0.compareAtPrice']).toBeDefined();
    expect(validateProductForm(form({ variants: [v({ id: null, compareAtPrice: '150.000' })] }), 'create')).toEqual({});
  });

  it('refuses two variants with the same SKU', () => {
    expect(validateProductForm(form({ variants: [v({ id: null }), v({ id: null })] }), 'create')['variants.1.sku']).toBeDefined();
  });

  it('does not check the stock of saved variants (read-only when editing)', () => {
    expect(validateProductForm(form({ variants: [v({ stock: '' })] }), 'edit')).toEqual({});
  });
});

describe('variantChanges', () => {
  it('sends only the saved variants whose label or prices changed', () => {
    const before = [v(), v({ id: 'v2', sku: 'HAT-2' })];
    const after = [v({ price: '125.000' }), v({ id: 'v2', sku: 'HAT-2' }), v({ id: null, sku: 'NEW' })];
    expect(variantChanges(before, after)).toEqual([{ id: 'v1', body: { price: 125000 } }]);
    expect(variantChanges([v()], [v({ label: 'Gói 2kg' })])).toEqual([{ id: 'v1', body: { label: 'Gói 2kg' } }]);
    expect(variantChanges([v({ compareAtPrice: '150000' })], [v({ compareAtPrice: '' })])).toEqual([{ id: 'v1', body: { compareAtPrice: null } }]);
  });
});

describe('category picker', () => {
  const c = (id: string, slug: string, name: string, parentId: string | null): AdminCategory => ({
    id, slug, name, parentId, description: null, sortOrder: 0, _count: { products: 0, blogPosts: 0, galleryItems: 0, children: 0 },
  });

  it('labels every shop category with its full path, parents first', () => {
    const rows = [c('r', 'petshop', 'Shop', null), c('a', 'cho', 'Chó', 'r'), c('b', 'cho-thuc-an', 'Thức ăn', 'a'), c('d', 'hat', 'Hạt cho chó', 'b'), c('g', 'gomsu', 'Gốm', null)];
    expect(categoryPathOptions(rows, 'petshop')).toEqual([
      { id: 'a', slug: 'cho', label: 'Chó' },
      { id: 'b', slug: 'cho-thuc-an', label: 'Chó › Thức ăn' },
      { id: 'd', slug: 'hat', label: 'Chó › Thức ăn › Hạt cho chó' },
    ]);
  });
});

describe('attributeValues', () => {
  it('drops empty fields and stores numbers as numbers', () => {
    const defs = [
      { attributeKey: 'weight', attributeType: 'number' },
      { attributeKey: 'origin', attributeType: 'text' },
      { attributeKey: 'flavor', attributeType: 'text' },
    ];
    expect(attributeValues({ weight: '1,5', origin: ' Thái Lan ', flavor: '' }, defs)).toEqual({ weight: 1.5, origin: 'Thái Lan' });
  });
});

describe('normalizeErrorKeys', () => {
  it('maps express-validator array paths onto the form field names', () => {
    expect(normalizeErrorKeys({ 'variants[0].sku': 'SKU từ 1 đến 64 ký tự', name: 'x' })).toEqual({ 'variants.0.sku': 'SKU từ 1 đến 64 ký tự', name: 'x' });
  });
});

describe('dropFixedErrors', () => {
  it('forgets the error of a field once it is edited, keeps the others', () => {
    const errors = { name: 'x', slug: 'x', 'variants.0.sku': 'x', 'variants.1.price': 'x' };
    const before = form({ variants: [v({ id: null }), v({ id: null, sku: 'B' })] });
    const after = { ...before, name: 'Tên mới', variants: [before.variants[0], { ...before.variants[1], price: '1' }] };
    expect(dropFixedErrors(errors, before, after)).toEqual({ slug: 'x', 'variants.0.sku': 'x' });
  });

  it('drops the errors of a removed variant row and renumbers the rows below it', () => {
    const before = form({ variants: [v({ id: null, sku: 'A' }), v({ id: null, sku: 'B' }), v({ id: null, sku: 'C' })] });
    const after = { ...before, variants: [before.variants[0], before.variants[2]] };
    expect(dropFixedErrors({ 'variants.1.sku': 'x', 'variants.2.price': 'y' }, before, after)).toEqual({ 'variants.1.price': 'y' });
  });
});
