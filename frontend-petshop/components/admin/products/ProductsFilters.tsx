'use client';

import { useEffect, useState } from 'react';
import { PRODUCT_STATUSES, type ProductStatus, type ProductsQuery } from '../../../lib/adminProducts';

type Props = {
  query: ProductsQuery;
  categories: { slug: string; label: string }[];
  onChange: (patch: Partial<ProductsQuery>, mode: 'push' | 'replace') => void;
};

const SEARCH_DEBOUNCE_MS = 300;
const SELECT = 'min-h-12 w-full min-w-0 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base text-ink md:w-auto';

// Search by name (URL updated 300 ms after typing stops), status and category (wireframe
// admin-products.html). Selects push a history entry; the search box replaces it.
export function ProductsFilters({ query, categories, onChange }: Props) {
  const [text, setText] = useState(query.q);

  useEffect(() => {
    const t = text.trim();
    if (t === query.q || (t.length > 0 && t.length < 2)) return;
    const timer = setTimeout(() => onChange({ q: t }, 'replace'), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, query.q, onChange]);

  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
      <label className="min-w-0 flex-1 md:min-w-[200px]">
        <span className="sr-only">Tìm sản phẩm</span>
        <input type="search" inputMode="search" enterKeyHint="search" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Tìm theo tên…" maxLength={100}
          className="min-h-12 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base" />
      </label>
      <select aria-label="Trạng thái" value={query.status ?? ''} className={SELECT}
        onChange={(e) => onChange({ status: (e.target.value || null) as ProductStatus | null }, 'push')}>
        <option value="">Mọi trạng thái</option>
        {PRODUCT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <select aria-label="Danh mục" value={query.category ?? ''} className={SELECT}
        onChange={(e) => onChange({ category: e.target.value || null }, 'push')}>
        <option value="">Mọi danh mục</option>
        {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
      </select>
    </div>
  );
}
