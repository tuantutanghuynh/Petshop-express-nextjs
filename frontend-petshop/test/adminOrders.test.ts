import { describe, expect, it } from 'vitest';
import { actionRequest, holdUntilText, orderActions, orderBadge, ordersApiPath, ordersHref, parseOrdersQuery, paymentLabel } from '../lib/adminOrders';

// /admin/don-hang rules (spec 2026-10-21 admin orders): list state lives in the URL with one
// address per state, labels match the customer pages, and each status offers only the moves the
// backend's state machine accepts.
const now = new Date('2026-10-21T05:00:00.000Z');

describe('URL state', () => {
  it('reads tab, search, page and the open order, falling back to defaults', () => {
    expect(parseOrdersQuery(new URLSearchParams('tab=pending&q=%20NP-26%20&page=3&ma=NP-261016-K3F9A2'))).toEqual({ tab: 'pending', q: 'NP-26', page: 3, ma: 'NP-261016-K3F9A2' });
    expect(parseOrdersQuery(new URLSearchParams('tab=weird&q=a&page=-2&ma=<x>'))).toEqual({ tab: 'all', q: '', page: 1, ma: null });
  });

  it('writes only what differs from the defaults', () => {
    expect(ordersHref({})).toBe('/admin/don-hang');
    expect(ordersHref({ tab: 'pending', q: 'mai', page: 2, ma: 'NP-1' })).toBe('/admin/don-hang?tab=pending&q=mai&page=2&ma=NP-1');
    expect(ordersHref({ tab: 'all', page: 1 })).toBe('/admin/don-hang');
  });

  it('builds the API request for a list state', () => {
    expect(ordersApiPath({ tab: 'processing', q: '0901', page: 2, ma: null })).toBe('/orders/admin/list?page=2&pageSize=20&orderStatus=PROCESSING&q=0901');
    expect(ordersApiPath({ tab: 'all', q: '', page: 1, ma: null })).toBe('/orders/admin/list?page=1&pageSize=20');
  });
});

describe('labels', () => {
  it('adds the remaining hold to a pending transfer', () => {
    expect(orderBadge({ orderStatus: 'PENDING_PAYMENT', paymentStatus: 'PENDING', expiresAt: '2026-10-21T07:30:00.000Z' }, now)).toEqual({ label: 'Chờ chuyển khoản · còn 2 giờ', tone: 'wait' });
    expect(orderBadge({ orderStatus: 'PENDING_PAYMENT', paymentStatus: 'PENDING', expiresAt: '2026-10-21T04:00:00.000Z' }, now).label).toBe('Chờ chuyển khoản · quá hạn');
    expect(orderBadge({ orderStatus: 'CONFIRMED', paymentStatus: 'UNPAID', expiresAt: null }, now)).toEqual({ label: 'Đã xác nhận', tone: 'ok' });
  });

  it('describes how the order is paid', () => {
    expect(paymentLabel('COD', 'UNPAID')).toBe('COD · Thu khi giao');
    expect(paymentLabel('BANK_TRANSFER', 'PAID')).toBe('Chuyển khoản · Đã thanh toán');
    expect(paymentLabel('BANK_TRANSFER', 'EXPIRED')).toBe('Chuyển khoản · Quá hạn');
  });

  it('shows the hold deadline in Vietnam time', () => {
    expect(holdUntilText('2026-10-21T07:30:00.000Z')).toBe('14:30 21/10');
  });
});

describe('orderActions', () => {
  const kinds = (o: { orderStatus: string; paymentMethod: string; paymentStatus: string }) => orderActions(o).map((a) => a.kind);

  it('follows the order state machine', () => {
    expect(kinds({ orderStatus: 'PENDING_PAYMENT', paymentMethod: 'BANK_TRANSFER', paymentStatus: 'PENDING' })).toEqual(['confirm-payment', 'cancel']);
    expect(kinds({ orderStatus: 'CONFIRMED', paymentMethod: 'COD', paymentStatus: 'UNPAID' })).toEqual(['processing', 'cancel']);
    expect(kinds({ orderStatus: 'PROCESSING', paymentMethod: 'COD', paymentStatus: 'UNPAID' })).toEqual(['completed']);
    expect(kinds({ orderStatus: 'COMPLETED', paymentMethod: 'COD', paymentStatus: 'PAID' })).toEqual([]);
    expect(kinds({ orderStatus: 'CANCELLED', paymentMethod: 'BANK_TRANSFER', paymentStatus: 'EXPIRED' })).toEqual([]);
  });

  it('asks before money or stock moves, and notes COD cash on completion', () => {
    const pending = orderActions({ orderStatus: 'PENDING_PAYMENT', paymentMethod: 'BANK_TRANSFER', paymentStatus: 'PENDING' });
    expect(pending.map((a) => a.ask)).toEqual([true, true]);
    expect(pending[1].danger).toBe(true);
    expect(orderActions({ orderStatus: 'PROCESSING', paymentMethod: 'COD', paymentStatus: 'UNPAID' })[0].note).toMatch(/tiền mặt/);
  });

  it('maps each action to its endpoint', () => {
    expect(actionRequest('confirm-payment', 'o1')).toEqual({ path: '/orders/admin/o1/confirm-payment' });
    expect(actionRequest('cancel', 'o1')).toEqual({ path: '/orders/admin/o1/cancel' });
    expect(actionRequest('processing', 'o1')).toEqual({ path: '/orders/admin/o1/status', body: '{"status":"PROCESSING"}' });
    expect(actionRequest('completed', 'o1')).toEqual({ path: '/orders/admin/o1/status', body: '{"status":"COMPLETED"}' });
  });
});
