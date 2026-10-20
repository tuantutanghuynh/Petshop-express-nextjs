import type { Metadata } from 'next';
import { CategoryManager } from '../../../components/admin/categories/CategoryManager';

export const metadata: Metadata = { title: 'Danh mục' };

export default function AdminCategoriesPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl leading-[1.3] font-extrabold">Danh mục &amp; thông số</h1>
      <CategoryManager />
    </>
  );
}
