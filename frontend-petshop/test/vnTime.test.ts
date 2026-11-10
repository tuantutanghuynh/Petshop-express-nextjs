import { describe, expect, it } from 'vitest';
import { formatVietnamDateTime, fromVietnamLocal, toVietnamLocal } from '../lib/vnTime';

// The admin types dates in Vietnam time (UTC+7) whatever their computer is set to; the API stores UTC.
describe('Vietnam local time', () => {
  it('turns a UTC instant into the datetime-local text seen in Vietnam', () => {
    expect(toVietnamLocal('2026-11-10T01:30:00.000Z')).toBe('2026-11-10T08:30');
    expect(toVietnamLocal('2026-11-10T20:00:00.000Z')).toBe('2026-11-11T03:00');
  });

  it('reads a datetime-local text as Vietnam time', () => {
    expect(fromVietnamLocal('2026-11-10T08:30')).toBe('2026-11-10T01:30:00.000Z');
    expect(fromVietnamLocal('2026-11-11T03:00')).toBe('2026-11-10T20:00:00.000Z');
  });

  it.each(['', '2026-02-30T10:00', '2026-11-10 08:30', 'abc', '2026-11-10T25:00'])('refuses %j', (v) => {
    expect(fromVietnamLocal(v)).toBeNull();
  });

  it('formats an instant for display in Vietnam time', () => {
    expect(formatVietnamDateTime('2026-11-10T01:30:00.000Z')).toBe('08:30 10/11/2026');
  });
});
