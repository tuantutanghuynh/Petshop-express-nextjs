import { attributeValues, normalizeErrorKeys, parseMoney, type ProductFormValues, type VariantForm } from '../../../lib/adminProducts';
import { fieldErrors } from '../../../lib/forms';
import type { ApiError } from '../../../lib/types';
import type { SaveResult } from './ProductForm';

// Request bodies and error mapping shared by the create and edit screens.

export function variantBody(r: VariantForm) {
  return {
    sku: r.sku.trim(),
    ...(r.label.trim() && { label: r.label.trim() }),
    price: parseMoney(r.price) ?? 0,
    compareAtPrice: r.compareAtPrice.trim() ? parseMoney(r.compareAtPrice) : null,
    stockQuantity: Number(r.stock.trim() || 0),
  };
}

export function productFields(v: ProductFormValues, defs: { attributeKey: string; attributeType: string }[]) {
  return {
    categoryId: v.categoryId,
    name: v.name.trim(),
    brand: v.brand.trim() || null,
    description: v.description.trim() || null,
    status: v.status,
    attributes: attributeValues(v.attributes, defs),
  };
}

// 422 → messages under the fields; a taken slug under the slug field; anything else on top.
export function errorResult(error: ApiError | null, fallback: string): SaveResult {
  if (!error) return { message: fallback };
  if (error.code === 'VALIDATION_ERROR') {
    const errors = normalizeErrorKeys(fieldErrors(error.details));
    return Object.keys(errors).length > 0 ? { errors } : { message: error.message };
  }
  if (error.code === 'SLUG_TAKEN') return { errors: { slug: error.message } };
  return { message: error.message || fallback };
}
