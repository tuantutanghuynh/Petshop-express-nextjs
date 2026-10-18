import { describe, expect, it } from 'vitest';
import { DEFAULT_SORT, listHref, parseSearchQuery, parseSortParam } from '../lib/catalogParams';

// URL state of catalogue lists. Every variant of a list must have exactly one URL: defaults are left
// out (page 1, newest first), unknown values are a 404 rather than a duplicate of the default page.
describe('parseSortParam', () => {
  it('accepts the backend whitelist and defaults to newest first', () => {
    expect(parseSortParam(undefined)).toBe(DEFAULT_SORT);
    expect(parseSortParam('price')).toBe('price');
    expect(parseSortParam('-price')).toBe('-price');
  });

  it('rejects anything else (the page answers 404)', () => {
    for (const bad of ['', 'name', '-createdAt', 'price;drop']) expect(parseSortParam(bad)).toBeNull();
    expect(parseSortParam(['price', '-price'])).toBeNull();
  });
});

describe('listHref', () => {
  it('omits defaults so each list state has one URL', () => {
    expect(listHref('/danh-muc/pate', {})).toBe('/danh-muc/pate');
    expect(listHref('/danh-muc/pate', { page: 1, sort: DEFAULT_SORT })).toBe('/danh-muc/pate');
    expect(listHref('/danh-muc/pate', { page: 2, sort: 'price' })).toBe('/danh-muc/pate?sort=price&page=2');
    expect(listHref('/tim-kiem', { q: 'pate mèo', page: 3 })).toBe('/tim-kiem?q=pate+m%C3%A8o&page=3');
  });
});

describe('parseSearchQuery', () => {
  it('keeps a usable search term and trims it', () => {
    expect(parseSearchQuery('  pate meo ')).toBe('pate meo');
  });

  it('returns null when there is nothing the backend would accept', () => {
    for (const bad of [undefined, '', ' ', 'a', 'x'.repeat(101)]) expect(parseSearchQuery(bad)).toBeNull();
    expect(parseSearchQuery(['a', 'b'])).toBeNull();
  });
});
