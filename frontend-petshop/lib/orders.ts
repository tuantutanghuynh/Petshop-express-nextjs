import type { FieldErrors } from './forms';

// Pure order helpers (test/orders.test.ts). Field keys of checkout errors use the backend's own
// paths ("shippingAddress.phone") so a 422 from the server lands on the same inputs.

export type CheckoutForm = { fullName: string; phone: string; addressLine: string; city: string; note: string };

const NOTE_MAX = 500; // backend: body('note').isLength({ max: 500 })

// Vietnamese mobile / landline after removing spaces, dots and dashes: 0xxxxxxxxx or +84xxxxxxxxx.
const PHONE = /^(?:\+?84|0)\d{9,10}$/;

export function validateCheckout(v: CheckoutForm): FieldErrors {
  const errors: FieldErrors = {};
  if (!v.fullName.trim()) errors['shippingAddress.fullName'] = 'Nhập họ tên người nhận';
  const phone = v.phone.replace(/[\s.-]/g, '');
  if (!phone) errors['shippingAddress.phone'] = 'Nhập số điện thoại';
  else if (!PHONE.test(phone)) errors['shippingAddress.phone'] = 'Số điện thoại không hợp lệ';
  if (!v.addressLine.trim()) errors['shippingAddress.addressLine'] = 'Nhập địa chỉ';
  if (!v.city.trim()) errors['shippingAddress.city'] = 'Nhập tỉnh / thành phố';
  if (v.note.length > NOTE_MAX) errors.note = `Ghi chú tối đa ${NOTE_MAX} ký tự`;
  return errors;
}

// One key per checkout attempt, created when the checkout page opens. A double click or a retry
// after a dropped connection sends the same key, and the backend returns the first order instead of
// creating a second one (backend: Order.idempotencyKey).
// crypto.randomUUID is missing outside secure contexts (plain http) and in older browsers, so the
// key falls back to 16 random bytes from getRandomValues, which exists everywhere.
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Order codes look like NP-261016-K3F9A2. Anything else is refused before it reaches a backend URL.
export function isOrderCode(code: string): boolean {
  return /^[A-Za-z0-9-]{1,40}$/.test(code);
}

export type BankInfo = { name: string; account: string; holder: string };

// Bank transfer is offered only when the shop has filled all three settings: a half-configured
// account would take the customer's order and leave them with nowhere to send the money.
export function bankInfo(settings: Record<string, string | undefined>): BankInfo | null {
  const name = settings.bank_name?.trim();
  const account = settings.bank_account?.trim();
  const holder = settings.bank_holder?.trim();
  return name && account && holder ? { name, account, holder } : null;
}

export type StatusTone = 'wait' | 'ok' | 'done' | 'off';

export function orderStatusLabel(o: { orderStatus: string; paymentStatus: string }): { label: string; tone: StatusTone } {
  switch (o.orderStatus) {
    case 'PENDING_PAYMENT':
      return { label: 'Chờ chuyển khoản', tone: 'wait' };
    case 'CONFIRMED':
      return { label: 'Đã xác nhận', tone: 'ok' };
    case 'PROCESSING':
      return { label: 'Đang giao', tone: 'ok' };
    case 'COMPLETED':
      return { label: 'Hoàn tất', tone: 'done' };
    case 'CANCELLED':
      return { label: o.paymentStatus === 'EXPIRED' ? 'Đã huỷ · quá hạn thanh toán' : 'Đã huỷ', tone: 'off' };
    default:
      return { label: o.orderStatus, tone: 'ok' };
  }
}

// Whole hours left to pay (rounded up so "0" only appears once the hold has really ended).
export function hoursLeft(expiresAt: string | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 3_600_000));
}
