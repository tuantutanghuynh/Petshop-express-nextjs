import { describe, expect, it } from 'vitest';
import { expiringOrders, rangeFor, timeAgo, timeLeft } from '../lib/adminDashboard';

// Dashboard helpers (spec 2026-10-21 admin shell): the quote-revenue period in Vietnam time, bank
// transfer orders closest to losing their stock hold first, and short Vietnamese relative times.
const now = new Date('2026-10-21T05:00:00.000Z'); // 12:00 in Vietnam

describe('rangeFor', () => {
  it('covers the last 30 days up to now', () => {
    expect(rangeFor('30d', now)).toEqual({ from: '2026-09-21T05:00:00.000Z', to: '2026-10-21T05:00:00.000Z' });
  });
  it('starts "this month" at 00:00 on the 1st in Vietnam', () => {
    expect(rangeFor('month', now).from).toBe('2026-09-30T17:00:00.000Z');
    expect(rangeFor('month', new Date('2026-10-31T18:00:00.000Z')).from).toBe('2026-10-31T17:00:00.000Z'); // already 1 Nov in Vietnam
  });
});

describe('expiringOrders', () => {
  it('sorts by hold expiry, skips orders without one, and caps the list', () => {
    const o = (code: string, expiresAt: string | null) => ({ code, expiresAt });
    const list = [o('C', '2026-10-21T09:00:00Z'), o('A', '2026-10-21T06:00:00Z'), o('X', null), o('B', '2026-10-21T07:00:00Z')];
    expect(expiringOrders(list, 2).map((x) => x.code)).toEqual(['A', 'B']);
  });
});

describe('timeLeft / timeAgo', () => {
  it('says how long a hold still runs', () => {
    expect(timeLeft('2026-10-21T07:30:00.000Z', now)).toBe('còn 2 giờ');
    expect(timeLeft('2026-10-21T05:15:00.000Z', now)).toBe('còn 15 phút');
    expect(timeLeft('2026-10-21T04:59:00.000Z', now)).toBe('đã quá hạn');
  });
  it('says how long ago something arrived', () => {
    expect(timeAgo('2026-10-21T04:59:30.000Z', now)).toBe('vừa xong');
    expect(timeAgo('2026-10-21T04:50:00.000Z', now)).toBe('10 phút trước');
    expect(timeAgo('2026-10-21T04:00:00.000Z', now)).toBe('1 giờ trước');
    expect(timeAgo('2026-10-18T05:00:00.000Z', now)).toBe('3 ngày trước');
  });
});
