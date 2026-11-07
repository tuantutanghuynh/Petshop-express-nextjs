'use client';

import { useState, type FormEvent } from 'react';
import { slugify } from '../../../lib/adminCategories';
import { dropFixedErrors, validateProductForm, type ProductFormValues } from '../../../lib/adminProducts';
import type { FieldErrors } from '../../../lib/forms';
import { TextField } from '../../ui/TextField';
import { AttributeFields } from './AttributeFields';
import { ImageList, type ImageItem, type ImageOps } from './ImageList';
import { MarkdownField } from './MarkdownField';
import { ProductSidebar } from './ProductSidebar';
import { useCategoryData } from './useCategoryData';
import { VariantRows } from './VariantRows';

export type SaveResult = { errors?: FieldErrors; message?: string } | null;

type Props = {
  mode: 'create' | 'edit';
  initial: ProductFormValues;
  initialImages: ImageItem[];
  // Saves the whole form; resolves to null when it worked, or to field errors / a message.
  onSave: (values: ProductFormValues, images: ImageItem[], defs: { attributeKey: string; attributeType: string }[]) => Promise<SaveResult>;
  // Edit mode only (see ProductEditor).
  wasActive?: boolean;
  imageOps?: ImageOps;
  onRemoveVariant?: (id: string) => Promise<string | null>;
  onDelete?: () => void;
  notice?: string | null;
};

// The first field in form order that has an error gets focus (ids are "f-" + the key with dots as
// dashes, so variant rows are told apart — focusFirstError matches by the last key segment only).
function focusError(form: HTMLFormElement, errors: FieldErrors) {
  const ids = new Set(Object.keys(errors).map((k) => `f-${k.replace(/\./g, '-')}`));
  for (const el of Array.from(form.elements)) if (ids.has(el.id) && el instanceof HTMLElement) return el.focus();
}

// Create and edit form of /admin/san-pham (wireframe admin-product-edit.html).
export function ProductForm(p: Props) {
  const categories = useCategoryData();
  const [values, setValues] = useState(p.initial);
  const [images, setImages] = useState(p.initialImages);
  const [slugTouched, setSlugTouched] = useState(p.mode === 'edit');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Each edit also clears the message of the field it fixed.
  const set = (patch: Partial<ProductFormValues>) => {
    const next = { ...values, ...patch };
    setErrors((e) => dropFixedErrors(e, values, next));
    setValues(next);
  };
  const defs = values.categoryId && categories ? (categories.attributesById[values.categoryId] ?? []) : null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const found = validateProductForm(values, p.mode);
    setErrors(found);
    setMessage(null);
    if (Object.keys(found).length > 0) return focusError(form, found);
    setSaving(true);
    const result = await p.onSave(values, images, defs ?? []);
    setSaving(false);
    if (result?.errors) {
      setErrors(result.errors);
      focusError(form, result.errors);
    }
    if (result?.message) setMessage(result.message);
  }

  // A stock adjustment is already saved in the ledger: only the numbers shown change, the rest of the
  // form stays as typed (stock is never part of "Lưu thay đổi").
  const updateStock = (id: string, stock: number, reserved: number) =>
    setValues((v) => ({ ...v, variants: v.variants.map((r) => (r.id === id ? { ...r, stock: String(stock), reserved } : r)) }));

  // A saved variant is deleted at once; its row then leaves the form, the rest stays as typed.
  const removeVariant = p.onRemoveVariant
    ? async (id: string) => {
        const failed = await p.onRemoveVariant?.(id);
        if (!failed) setValues((v) => ({ ...v, variants: v.variants.filter((r) => r.id !== id) }));
        return failed ?? null;
      }
    : undefined;

  const slugMoved = p.mode === 'edit' && p.wasActive && values.slug !== p.initial.slug;
  const submitLabel = p.mode === 'create' ? 'Tạo sản phẩm' : 'Lưu thay đổi';

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 max-md:pb-24 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
      <div className="flex min-w-0 flex-col gap-6">
        {message && <p role="alert" className="rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink">{message}</p>}
        {p.notice && <p role="status" className="rounded-card bg-mint px-4 py-3 text-sm font-bold text-brand-deep">{p.notice}</p>}
        <fieldset className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <legend className="px-1 text-lg leading-[1.3] font-extrabold text-ink">Thông tin chung</legend>
          <TextField name="name" label="Tên sản phẩm *" maxLength={200} value={values.name} error={errors.name}
            onChange={(e) => set({ name: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <TextField name="slug" label="Slug (URL) *" maxLength={120} value={values.slug} error={errors.slug}
                hint="Chỉ a-z, 0-9 và dấu -. Tự tạo từ tên khi thêm mới."
                onChange={(e) => { setSlugTouched(true); set({ slug: e.target.value.trim() }); }} />
              {slugMoved && <p role="status" className="text-sm font-bold text-orange-text">URL cũ sẽ tự chuyển sang URL mới.</p>}
            </div>
            <TextField name="brand" label="Thương hiệu" maxLength={100} value={values.brand} hint="Ghi giống tên thương hiệu trong menu để lọc đúng."
              onChange={(e) => set({ brand: e.target.value })} />
          </div>
          <MarkdownField value={values.description} error={errors.description} onChange={(d) => set({ description: d })} />
        </fieldset>
        <AttributeFields defs={defs} values={values.attributes} onChange={(attributes) => set({ attributes })} />
        <VariantRows mode={p.mode} rows={values.variants} errors={errors} onChange={(variants) => set({ variants })}
          onRemoveSaved={removeVariant} onStockChange={p.mode === 'edit' ? updateStock : undefined} />
        <ImageList images={images} onChange={setImages} ops={p.imageOps} />
      </div>
      <ProductSidebar status={values.status} categoryId={values.categoryId} categoryError={errors.categoryId} options={categories?.options ?? null}
        saving={saving} submitLabel={submitLabel} onStatus={(status) => set({ status })} onCategory={(categoryId) => set({ categoryId })} onDelete={p.onDelete} />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <button type="submit" disabled={saving} className="min-h-12 w-full rounded-full bg-brand-ink px-6 font-bold text-white disabled:opacity-60">
          {saving ? 'Đang lưu…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
