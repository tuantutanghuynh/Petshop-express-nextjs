import type { Product } from '../../lib/types';
import { ProductCard } from '../product/ProductCard';
import { EmptyState } from '../ui/EmptyState';
import { SectionHeading } from '../ui/SectionHeading';

type Props = { products: Product[] | null };

// null = the API call failed (shown as an error), [] = no products yet (empty state).
export function FeaturedProducts({ products }: Props) {
  return (
    <section aria-labelledby="products-title" className="mx-auto max-w-[1200px] px-4 md:px-6 py-6">
      <SectionHeading id="products-title" title="🐾 Sản phẩm mới" />
      {products === null ? (
        <EmptyState tone="error" message="Chưa tải được sản phẩm. Vui lòng thử lại sau ít phút." />
      ) : products.length === 0 ? (
        <EmptyState message="Sản phẩm đang được cập nhật — quay lại sớm nhé!" />
      ) : (
        <ul className="grid grid-cols-2 gap-3 max-[239px]:grid-cols-1 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
          {products.map((p) => (
            <li key={p.id}><ProductCard product={p} /></li>
          ))}
        </ul>
      )}
    </section>
  );
}
