'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { categoryPathOptions } from '../../../lib/adminProducts';
import { BRAND_SLUG } from '../../../lib/site';
import type { AdminCategory, Category } from '../../../lib/types';
import { categoryApi } from '../categories/adminCategoryApi';
import type { AttributeDef } from './AttributeFields';

export type CategoryData = { options: { id: string; slug: string; label: string }[]; attributesById: Record<string, AttributeDef[]> };

// The shop's categories for the picker (admin list, shop only) and each one's spec fields (the
// public list is the one that carries attributes). null while loading or when a request failed.
async function load(): Promise<CategoryData | null> {
  const [admin, all] = await Promise.all([categoryApi<AdminCategory[]>('/admin/list'), authFetch<(Category & { attributes?: AttributeDef[] })[]>('/categories')]);
  if (!admin.data || !all.data) return null;
  const attributesById = Object.fromEntries(all.data.map((c) => [c.id, c.attributes ?? []]));
  return { options: categoryPathOptions(admin.data, BRAND_SLUG), attributesById };
}

export function useCategoryData(): CategoryData | null {
  const [data, setData] = useState<CategoryData | null>(null);
  useEffect(() => {
    let active = true;
    load().then((next) => active && setData(next));
    return () => {
      active = false;
    };
  }, []);
  return data;
}
