import type { Product } from '../../lib/types';
import { ProductCard } from './ProductCard';

// Pages hold 24 products (CATEGORY_PAGE_SIZE): 2, 3, 4 and 6 columns all end on a full row.
export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 max-[239px]:grid-cols-1 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {products.map((p) => (
        <li key={p.id}><ProductCard product={p} /></li>
      ))}
    </ul>
  );
}
