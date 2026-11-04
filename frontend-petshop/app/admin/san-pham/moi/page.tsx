import type { Metadata } from 'next';
import Link from 'next/link';
import { ProductCreate } from '../../../../components/admin/products/ProductCreate';

export const metadata: Metadata = { title: 'Thêm sản phẩm' };

export default function AdminNewProductPage() {
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/admin/san-pham" className="inline-flex min-h-11 items-center underline">Sản phẩm</Link> › <span>Thêm mới</span>
      </nav>
      <h1 className="text-2xl leading-[1.3] font-extrabold">Thêm sản phẩm</h1>
      <ProductCreate />
    </div>
  );
}
