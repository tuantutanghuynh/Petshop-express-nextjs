import { describe, expect, it } from 'vitest';
import { bankInfo, hoursLeft, isOrderCode, newIdempotencyKey, orderStatusLabel, validateCheckout } from '../lib/orders';

describe('validateCheckout', () => {
  const ok = { fullName: 'Nguyễn Thị Ánh', phone: '0901 234 567', addressLine: '12 Lê Lợi, P. Bến Nghé', city: 'TP. HCM', note: '' };

  it('accepts a complete Vietnamese address', () => {
    expect(validateCheckout(ok)).toEqual({});
    expect(validateCheckout({ ...ok, phone: '+84901234567' })).toEqual({});
  });

  it('names every missing field (the backend requires all four)', () => {
    expect(validateCheckout({ fullName: ' ', phone: '', addressLine: '', city: '', note: '' })).toEqual({
      'shippingAddress.fullName': 'Nhập họ tên người nhận',
      'shippingAddress.phone': 'Nhập số điện thoại',
      'shippingAddress.addressLine': 'Nhập địa chỉ',
      'shippingAddress.city': 'Nhập tỉnh / thành phố',
    });
  });

  it('rejects a phone number a courier cannot call', () => {
    expect(validateCheckout({ ...ok, phone: '12345' })['shippingAddress.phone']).toMatch(/không hợp lệ/);
    expect(validateCheckout({ ...ok, phone: '09012345678901' })['shippingAddress.phone']).toMatch(/không hợp lệ/);
  });

  it('caps the note at the backend limit of 500 characters', () => {
    expect(validateCheckout({ ...ok, note: 'a'.repeat(501) }).note).toMatch(/500/);
  });
});

describe('newIdempotencyKey', () => {
  it('matches the backend header rule and differs every time', () => {
    const a = newIdempotencyKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
    expect(newIdempotencyKey()).not.toBe(a);
  });
});

describe('isOrderCode', () => {
  it('accepts order codes and nothing that could change the backend path', () => {
    expect(isOrderCode('NP-261016-K3F9A2')).toBe(true);
    for (const bad of ['', '../admin/list', 'a/b', 'x'.repeat(41)]) expect(isOrderCode(bad)).toBe(false);
  });
});

describe('bankInfo', () => {
  it('is available only when all three bank settings are filled', () => {
    expect(bankInfo({ bank_name: 'VCB', bank_account: '0123', bank_holder: 'NGUYEN VAN A' })).toEqual({ name: 'VCB', account: '0123', holder: 'NGUYEN VAN A' });
    expect(bankInfo({ bank_name: 'VCB', bank_account: '0123' })).toBeNull();
    expect(bankInfo({ bank_name: ' ', bank_account: '0123', bank_holder: 'A' })).toBeNull();
  });
});

describe('orderStatusLabel', () => {
  it('describes the order the way the customer experiences it', () => {
    expect(orderStatusLabel({ orderStatus: 'PENDING_PAYMENT', paymentStatus: 'PENDING' }).label).toBe('Chờ chuyển khoản');
    expect(orderStatusLabel({ orderStatus: 'CONFIRMED', paymentStatus: 'UNPAID' }).label).toBe('Đã xác nhận');
    expect(orderStatusLabel({ orderStatus: 'PROCESSING', paymentStatus: 'PAID' }).label).toBe('Đang giao');
    expect(orderStatusLabel({ orderStatus: 'COMPLETED', paymentStatus: 'PAID' }).label).toBe('Hoàn tất');
    expect(orderStatusLabel({ orderStatus: 'CANCELLED', paymentStatus: 'EXPIRED' }).label).toBe('Đã huỷ · quá hạn thanh toán');
    expect(orderStatusLabel({ orderStatus: 'CANCELLED', paymentStatus: 'PENDING' }).label).toBe('Đã huỷ');
  });
});

describe('hoursLeft', () => {
  it('rounds up the time left to pay, never below zero', () => {
    const now = new Date('2026-10-18T00:00:00Z');
    expect(hoursLeft('2026-10-18T23:30:00Z', now)).toBe(24);
    expect(hoursLeft('2026-10-18T00:10:00Z', now)).toBe(1);
    expect(hoursLeft('2026-10-17T00:00:00Z', now)).toBe(0);
    expect(hoursLeft(null, now)).toBeNull();
  });
});
