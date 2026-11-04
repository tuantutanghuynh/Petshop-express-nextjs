'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { variantChanges, type ProductFormValues } from '../../../lib/adminProducts';
import { productPath } from '../../../lib/seo/structuredData';
import type { AdminProduct, ProductImage } from '../../../lib/types';
import type { ImageItem, ImageOps } from './ImageList';
import { ProductForm } from './ProductForm';
import { jsonBody, productApi, refreshProducts } from './productApi';
import { errorResult, productFields, variantBody } from './productSave';

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error' } | { state: 'ready'; product: AdminProduct; version: number };

async function fetchProduct(id: string, version: number): Promise<Load> {
  const res = await productApi<AdminProduct>(`/admin/${encodeURIComponent(id)}`);
  if (res.data) return { state: 'ready', product: res.data, version };
  return res.error?.code === 'PRODUCT_NOT_FOUND' ? { state: 'missing' } : { state: 'error' };
}

function toForm(p: AdminProduct): ProductFormValues {
  return {
    name: p.name, slug: p.slug, brand: p.brand ?? '', description: p.description ?? '', status: p.status, categoryId: p.categoryId,
    attributes: Object.fromEntries(Object.entries(p.attributes ?? {}).map(([k, v]) => [k, String(v)])),
    variants: p.variants.map((x) => ({
      id: x.id, label: x.variantAttributes.label ?? '', sku: x.sku, price: String(x.price),
      compareAtPrice: x.compareAtPrice === null ? '' : String(x.compareAtPrice), stock: String(x.stockQuantity), reserved: x.reservedQuantity,
    })),
  };
}

const toImage = (i: ProductImage): ImageItem => ({ id: i.id, url: i.url, altText: i.altText ?? '' });
const failure = (res: { error: { message: string } | null }, fallback: string) => (res.error ? res.error.message || fallback : null);

// /admin/san-pham/[id]: product fields, changed and new variants are saved by "Lưu thay đổi";
// deleting a variant and every photo change are saved at once.
export function ProductEditor({ id }: { id: string }) {
  const router = useRouter();
  const justCreated = useSearchParams().get('da-tao') === '1';
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [notice, setNotice] = useState<string | null>(justCreated ? 'Đã tạo sản phẩm.' : null);

  useEffect(() => {
    let active = true;
    fetchProduct(id, 0).then((next) => active && setLoad(next));
    return () => {
      active = false;
    };
  }, [id]);

  if (load.state === 'loading') return <div aria-busy="true" aria-label="Đang tải sản phẩm" className="h-64 animate-pulse rounded-card bg-surface" />;
  if (load.state === 'missing') {
    return <p className="rounded-card border border-line bg-surface p-4">Không tìm thấy sản phẩm. <Link href="/admin/san-pham" className="inline-flex min-h-11 items-center font-bold text-brand-ink underline">Về danh sách</Link></p>;
  }
  if (load.state === 'error') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink">
        Chưa tải được sản phẩm.
        <button type="button" onClick={() => fetchProduct(id, 0).then(setLoad)} className="min-h-11 rounded-full border border-pink-ink px-4 font-bold">Thử lại</button>
      </div>
    );
  }

  const { product, version } = load;
  const initial = toForm(product);
  const touched = async () => refreshProducts();

  const imageOps: ImageOps = {
    add: async (url) => {
      const res = await productApi<ProductImage>(`/${product.id}/images`, jsonBody('POST', { url }));
      if (!res.data) return res.error?.message ?? 'Chưa thêm được ảnh';
      await touched();
      return toImage(res.data);
    },
    setAlt: async (imageId, altText) => failure(await productApi(`/images/${imageId}`, jsonBody('PATCH', { altText: altText || null })), 'Chưa lưu được mô tả ảnh'),
    reorder: async (next) => {
      for (const [position, img] of next.entries()) {
        const failed = failure(await productApi(`/images/${img.id}`, jsonBody('PATCH', { position })), 'Chưa đổi được thứ tự ảnh');
        if (failed) return failed;
      }
      await touched();
      return null;
    },
    remove: async (imageId) => {
      const failed = failure(await productApi(`/images/${imageId}`, { method: 'DELETE' }), 'Chưa xoá được ảnh');
      if (!failed) await touched();
      return failed;
    },
  };

  async function onDelete() {
    if (!window.confirm(`Xoá vĩnh viễn «${product.name}»? Sản phẩm đã có người mua nên chuyển sang Lưu trữ thay vì xoá.`)) return;
    const failed = failure(await productApi(`/${product.id}`, { method: 'DELETE' }), 'Chưa xoá được sản phẩm');
    if (failed) return setNotice(failed);
    await refreshProducts();
    router.replace('/admin/san-pham');
  }

  return (
    <div className="flex flex-col gap-4">
      {product.status === 'active' && (
        <Link href={productPath(product.slug)} target="_blank" className="inline-flex min-h-11 items-center self-start font-bold text-brand-ink underline">Xem trên web ↗</Link>
      )}
      <ProductForm
        // A new version after each save: the form starts again from what the server now holds.
        key={version}
        mode="edit"
        initial={initial}
        initialImages={product.images.map(toImage)}
        wasActive={product.status === 'active'}
        notice={notice}
        imageOps={imageOps}
        onDelete={onDelete}
        onRemoveVariant={async (variantId) => {
          const failed = failure(await productApi(`/variants/${variantId}`, { method: 'DELETE' }), 'Chưa xoá được biến thể');
          if (!failed) await touched();
          return failed;
        }}
        onSave={async (v, _images, defs) => {
          setNotice(null);
          const res = await productApi<AdminProduct>(`/${product.id}`, jsonBody('PATCH', { ...productFields(v, defs), ...(v.slug !== initial.slug && { slug: v.slug }) }));
          if (res.error) return errorResult(res.error, 'Chưa lưu được sản phẩm.');
          for (const change of variantChanges(initial.variants, v.variants)) {
            const r = await productApi(`/variants/${change.id}`, jsonBody('PATCH', change.body));
            if (r.error) return errorResult(r.error, 'Chưa lưu được biến thể.');
          }
          for (const row of v.variants.filter((x) => x.id === null)) {
            const r = await productApi(`/${product.id}/variants`, jsonBody('POST', variantBody(row)));
            if (r.error) return errorResult(r.error, `Chưa thêm được biến thể ${row.sku}.`);
          }
          await refreshProducts();
          const next = await fetchProduct(product.id, version + 1);
          setLoad(next);
          setNotice('Đã lưu thay đổi.');
          return null;
        }}
      />
    </div>
  );
}
