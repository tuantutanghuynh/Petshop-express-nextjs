import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ProductEditor } from '../../../../components/admin/products/ProductEditor';

export const metadata: Metadata = { title: 'Sửa sản phẩm' };

type Props = { params: Promise<{ id: string }> };

export default async function AdminEditProductPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/admin/san-pham" className="inline-flex min-h-11 items-center underline">Sản phẩm</Link> › <span>Sửa</span>
      </nav>
      <h1 className="text-2xl leading-[1.3] font-extrabold">Sửa sản phẩm</h1>
      {/* useSearchParams (the "just created" notice) needs a Suspense boundary (Next 16). */}
      <Suspense fallback={<div aria-busy="true" className="h-64 animate-pulse rounded-card bg-surface" />}>
        <ProductEditor id={id} />
      </Suspense>
    </div>
  );
}
