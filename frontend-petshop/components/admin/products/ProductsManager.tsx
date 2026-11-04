'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { categoryPathOptions, parseProductsQuery, PRODUCTS_PAGE_SIZE, productsApiPath, productsHref, type ProductsQuery } from '../../../lib/adminProducts';
import { BRAND_SLUG } from '../../../lib/site';
import type { AdminCategory, PageMeta, Product } from '../../../lib/types';
import { Pagination } from '../../ui/Pagination';
import { categoryApi } from '../categories/adminCategoryApi';
import { productApi } from './productApi';
import { ProductsFilters } from './ProductsFilters';
import { ProductsList } from './ProductsList';

type Page = { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: Product[]; total: number };
type Loaded = { key: string; page: Page };
type Option = { id: string; slug: string; label: string };

async function fetchPage(key: string): Promise<Loaded> {
  const res = await productApi<Product[]>(productsApiPath(parseProductsQuery(new URLSearchParams(key))).replace(/^\/products/, ''));
  if (res.error || !res.data) return { key, page: { state: 'error' } };
  return { key, page: { state: 'ready', rows: res.data, total: (res.meta as PageMeta | null)?.total ?? res.data.length } };
}

async function fetchCategories(): Promise<Option[]> {
  const res = await categoryApi<AdminCategory[]>('/admin/list');
  return res.data ? categoryPathOptions(res.data, BRAND_SLUG) : [];
}

// /admin/san-pham (wireframe admin-products.html). The URL is the state (status, category, search,
// page); state is set only from promise callbacks, tagged with the URL it was loaded for.
export function ProductsManager() {
  const router = useRouter();
  const query = parseProductsQuery(new URLSearchParams(useSearchParams().toString()));
  const key = new URLSearchParams(productsHref(query).split('?')[1] ?? '').toString();
  const [list, setList] = useState<Loaded | null>(null);
  const [categories, setCategories] = useState<Option[]>([]);

  useEffect(() => {
    let active = true;
    fetchPage(key).then((next) => active && setList(next));
    return () => {
      active = false;
    };
  }, [key]);

  useEffect(() => {
    let active = true;
    fetchCategories().then((next) => active && setCategories(next));
    return () => {
      active = false;
    };
  }, []);

  const onFilter = useCallback(
    (patch: Partial<ProductsQuery>, mode: 'push' | 'replace') => {
      const href = productsHref({ ...parseProductsQuery(new URLSearchParams(window.location.search)), ...patch, page: 1 });
      if (mode === 'push') router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [router],
  );

  const page: Page = list && list.key === key ? list.page : { state: 'loading' };
  const labelOf = (id: string) => categories.find((c) => c.id === id)?.label ?? '';
  const filtered = Boolean(query.q || query.status || query.category);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl leading-[1.3] font-extrabold">Sản phẩm</h1>
        <Link href="/admin/san-pham/moi" className="inline-flex min-h-11 items-center rounded-full bg-brand-ink px-5 font-bold text-white">+ Thêm sản phẩm</Link>
      </div>
      <ProductsFilters query={query} categories={categories} onChange={onFilter} />
      {page.state === 'loading' && <div aria-busy="true" aria-label="Đang tải sản phẩm" className="h-48 animate-pulse rounded-card bg-surface" />}
      {page.state === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink">
          Chưa tải được sản phẩm.
          <button type="button" onClick={() => fetchPage(key).then(setList)} className="min-h-11 rounded-full border border-pink-ink px-4 font-bold">Thử lại</button>
        </div>
      )}
      {page.state === 'ready' &&
        (page.rows.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-4 text-muted">
            {filtered ? (query.q ? `Không tìm thấy sản phẩm khớp «${query.q}».` : 'Không có sản phẩm nào khớp bộ lọc.') : 'Chưa có sản phẩm nào.'}{' '}
            <Link href="/admin/san-pham/moi" className="inline-flex min-h-11 items-center font-bold text-brand-ink underline">Thêm sản phẩm</Link>
          </p>
        ) : (
          <ProductsList rows={page.rows} categoryLabel={labelOf} />
        ))}
      <Pagination page={query.page} totalPages={page.state === 'ready' ? Math.ceil(page.total / PRODUCTS_PAGE_SIZE) : 0} hrefFor={(p) => productsHref({ ...query, page: p })} />
    </div>
  );
}
