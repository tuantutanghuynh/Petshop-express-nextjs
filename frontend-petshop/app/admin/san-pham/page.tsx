import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProductsManager } from '../../../components/admin/products/ProductsManager';

export const metadata: Metadata = { title: 'Sản phẩm' };

// useSearchParams inside the manager needs a Suspense boundary (Next 16).
export default function AdminProductsPage() {
  return (
    <Suspense fallback={<div aria-busy="true" className="h-48 animate-pulse rounded-card bg-surface" />}>
      <ProductsManager />
    </Suspense>
  );
}
