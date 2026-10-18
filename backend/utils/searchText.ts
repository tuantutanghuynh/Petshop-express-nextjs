import type { Prisma } from '@prisma/client';

// Accent-free, lower-case form of a product name or a search term. Customers type "pate meo" far
// more often than "pate mèo"; both sides are reduced to the same text so either spelling matches.
// "đ" is not a combining mark in Unicode, so it is mapped by hand. Stored in Product.searchName.
// The SQL backfill in migration 20261019120000 must give exactly the same output (tested).
export function toSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Public sort options for GET /products. Only these reach the database; anything else is a 422 at
// the route. id is always the tie-breaker so a row never jumps between pages.
export const PRODUCT_SORTS = ['-createdAt', 'price', '-price'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export function productOrderBy(sort: ProductSort): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'price':
      return [{ minPrice: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
    case '-price':
      return [{ minPrice: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
    default:
      return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
}

// Prisma turns `contains` into LIKE '%value%' without escaping, so "%" in a search term matched
// every product and "_" any character. PostgreSQL's default LIKE escape character is the backslash.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
