import { describe, expect, it } from 'vitest';
import { REASON_LABELS, adjustBody, parseCount, previewAfter, reasonsFor, stocktakeBody, validateAdjust, validateStocktake } from '../lib/adminStock';

// Stock adjustments in the product form (spec 2026-11-07 D2). The backend ledger is the authority;
// these rules only catch mistakes before the round trip.
describe('reasons', () => {
  it('names every reason the ledger can hold', () => {
    for (const r of ['OPENING', 'PURCHASE', 'DAMAGED', 'RETURN', 'OTHER', 'STOCKTAKE', 'SALE', 'CANCEL_RESTOCK']) expect(REASON_LABELS[r]).toBeTruthy();
  });

  it('offers only the reasons that fit the direction', () => {
    expect(reasonsFor('in').map((r) => r.value)).toEqual(['PURCHASE', 'RETURN', 'OTHER']);
    expect(reasonsFor('out').map((r) => r.value)).toEqual(['DAMAGED', 'OTHER']);
  });
});

describe('parseCount', () => {
  it('accepts plain non-negative integers only', () => {
    expect(parseCount(' 12 ')).toBe(12);
    expect(parseCount('0')).toBe(0);
    for (const bad of ['', '-1', '1.5', '1e3', 'abc', '2147483648']) expect(parseCount(bad)).toBeNull();
  });
});

describe('validateAdjust', () => {
  it('needs a positive quantity and a reason', () => {
    expect(validateAdjust({ quantity: '0', reason: 'PURCHASE', note: '' })).toEqual({ quantity: 'Nhập số lượng lớn hơn 0' });
    expect(validateAdjust({ quantity: '2', reason: '', note: '' })).toEqual({ reason: 'Chọn lý do' });
    expect(validateAdjust({ quantity: '2', reason: 'PURCHASE', note: '' })).toEqual({});
  });

  it('needs a note for "Khác", and at most 500 characters', () => {
    expect(validateAdjust({ quantity: '2', reason: 'OTHER', note: '  ' })).toEqual({ note: 'Ghi rõ lý do khi chọn “Khác”' });
    expect(validateAdjust({ quantity: '2', reason: 'PURCHASE', note: 'x'.repeat(501) })).toEqual({ note: 'Ghi chú tối đa 500 ký tự' });
  });
});

describe('validateStocktake', () => {
  it('refuses a count below what is held for pending orders', () => {
    expect(validateStocktake({ counted: '', note: '' }, 0)).toEqual({ counted: 'Nhập số đếm được (0 trở lên)' });
    expect(validateStocktake({ counted: '1', note: '' }, 2)).toEqual({ counted: 'Không thể thấp hơn 2 đang giữ cho đơn chờ thanh toán' });
    expect(validateStocktake({ counted: '2', note: '' }, 2)).toEqual({});
  });
});

describe('request bodies', () => {
  it('signs the delta by direction and sends a trimmed note or null', () => {
    expect(adjustBody('in', { quantity: '5', reason: 'PURCHASE', note: ' lô 11/2026 ' })).toEqual({ type: 'ADJUST', delta: 5, reason: 'PURCHASE', note: 'lô 11/2026' });
    expect(adjustBody('out', { quantity: '2', reason: 'DAMAGED', note: '' })).toEqual({ type: 'ADJUST', delta: -2, reason: 'DAMAGED', note: null });
    expect(stocktakeBody({ counted: '7', note: '' })).toEqual({ type: 'STOCKTAKE', countedQuantity: 7, note: null });
  });
});

describe('previewAfter', () => {
  it('shows the stock after the change, or null while the input is not a number', () => {
    expect(previewAfter(12, { kind: 'adjust', direction: 'in', quantity: '5' })).toBe(17);
    expect(previewAfter(12, { kind: 'adjust', direction: 'out', quantity: '2' })).toBe(10);
    expect(previewAfter(12, { kind: 'stocktake', counted: '9' })).toBe(9);
    expect(previewAfter(12, { kind: 'adjust', direction: 'in', quantity: 'x' })).toBeNull();
  });
});
