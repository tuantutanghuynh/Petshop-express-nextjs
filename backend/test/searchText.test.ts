import { describe, expect, it } from 'vitest';
import { PRODUCT_SORTS, escapeLike, productOrderBy, toSearchText } from '../utils/searchText';

// Customers type without diacritics ("pate meo") far more often than with them. Product names and
// search terms are both reduced to the same accent-free, lower-case form, so either spelling finds
// "Pate mèo". The SQL backfill in the migration must produce exactly the same text (checked in
// test/db/catalog.search.test.ts).
describe('toSearchText', () => {
  it('drops Vietnamese diacritics and case', () => {
    expect(toSearchText('Pate mèo vị cá ngừ')).toBe('pate meo vi ca ngu');
    expect(toSearchText('ĐỆM NGỦ êm cho chó')).toBe('dem ngu em cho cho');
    expect(toSearchText('Sữa tắm Ưu đãi')).toBe('sua tam uu dai');
  });

  it('treats composed and decomposed input the same', () => {
    expect(toSearchText('mèo'.normalize('NFD'))).toBe(toSearchText('mèo'.normalize('NFC')));
  });

  it('trims and collapses whitespace', () => {
    expect(toSearchText('  pate \t  meo  ')).toBe('pate meo');
  });
});

describe('productOrderBy', () => {
  it('maps every allowed sort to a stable order with id as the tie-breaker', () => {
    expect(PRODUCT_SORTS).toEqual(['-createdAt', 'price', '-price']);
    expect(productOrderBy('-createdAt')).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    // A product without variants has no price: it goes last in both directions (PostgreSQL would
    // put NULL first when sorting descending).
    expect(productOrderBy('price')).toEqual([{ minPrice: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]);
    expect(productOrderBy('-price')).toEqual([{ minPrice: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]);
  });
});

// Prisma's `contains` becomes LIKE '%value%' WITHOUT escaping, so a search for "%" matched every
// product and "_" matched any character (found by test/db/catalog.search.test.ts).
describe('escapeLike', () => {
  it('escapes the LIKE wildcards and the escape character itself', () => {
    expect(escapeLike('50%')).toBe('50\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('c\\d')).toBe('c\\\\d');
    expect(escapeLike('pate meo')).toBe('pate meo');
  });
});
