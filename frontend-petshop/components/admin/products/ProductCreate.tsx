'use client';

import { useRouter } from 'next/navigation';
import type { ProductFormValues } from '../../../lib/adminProducts';
import type { AdminProduct } from '../../../lib/types';
import { ProductForm } from './ProductForm';
import { jsonBody, productApi, refreshProducts } from './productApi';
import { errorResult, productFields, variantBody } from './productSave';

const EMPTY: ProductFormValues = {
  name: '', slug: '', brand: '', description: '', status: 'draft', categoryId: '', attributes: {},
  variants: [{ id: null, label: '', sku: '', price: '', compareAtPrice: '', stock: '0', reserved: 0 }],
};

// /admin/san-pham/moi: product, variants (with opening stock) and photos in one request; a new
// product starts as a draft so nothing half-done shows on the shop.
export function ProductCreate() {
  const router = useRouter();
  return (
    <ProductForm
      mode="create"
      initial={EMPTY}
      initialImages={[]}
      onSave={async (v, images, defs) => {
        const res = await productApi<AdminProduct>('', jsonBody('POST', {
          ...productFields(v, defs),
          slug: v.slug,
          variants: v.variants.map(variantBody),
          images: images.map((img, position) => ({ url: img.url, altText: img.altText.trim() || null, position })),
        }));
        if (res.error || !res.data) return errorResult(res.error, 'Chưa tạo được sản phẩm, vui lòng thử lại.');
        await refreshProducts();
        router.replace(`/admin/san-pham/${res.data.id}?da-tao=1`);
        return null;
      }}
    />
  );
}
