import { timeLeft } from './adminDashboard';
import { orderStatusLabel, type StatusTone } from './orders';
import { BRAND_SLUG } from './site';

// Rules of /admin/don-hang (spec 2026-10-21 admin orders, test/adminOrders.test.ts): the list state
// lives in the URL (shareable, Back works, one address per state), labels match the customer pages,
// and each status offers only the moves the backend's ORDER_TRANSITIONS accept.
export const ORDER_TABS = [
  { key: 'all', label: 'Tất cả', status: null },
  { key: 'pending', label: 'Chờ thanh toán', status: 'PENDING_PAYMENT' },
  { key: 'confirmed', label: 'Đã xác nhận', status: 'CONFIRMED' },
  { key: 'processing', label: 'Đang xử lý', status: 'PROCESSING' },
  { key: 'completed', label: 'Hoàn tất', status: 'COMPLETED' },
  { key: 'cancelled', label: 'Đã huỷ', status: 'CANCELLED' },
] as const;

export type OrderTab = (typeof ORDER_TABS)[number]['key'];
export type OrdersQuery = { tab: OrderTab; q: string; page: number; ma: string | null };

export const ORDERS_PAGE_SIZE = 20;
// Admin order endpoints are scoped to the storefront named here.
export const ADMIN_BRAND_HEADERS = { 'X-Brand-Slug': BRAND_SLUG };
const BASE = '/admin/don-hang';
const CODE = /^[A-Za-z0-9-]{3,40}$/;

export function parseOrdersQuery(sp: URLSearchParams): OrdersQuery {
  const tab = ORDER_TABS.find((t) => t.key === sp.get('tab'))?.key ?? 'all';
  const q = (sp.get('q') ?? '').trim();
  const page = Number(sp.get('page'));
  const ma = sp.get('ma');
  return {
    tab,
    q: q.length >= 2 && q.length <= 50 ? q : '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
    ma: ma && CODE.test(ma) ? ma : null,
  };
}

export function ordersHref(s: Partial<OrdersQuery>): string {
  const p = new URLSearchParams();
  if (s.tab && s.tab !== 'all') p.set('tab', s.tab);
  if (s.q) p.set('q', s.q);
  if (s.page && s.page > 1) p.set('page', String(s.page));
  if (s.ma) p.set('ma', s.ma);
  const qs = p.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

export function ordersApiPath(s: OrdersQuery): string {
  const p = new URLSearchParams({ page: String(s.page), pageSize: String(ORDERS_PAGE_SIZE) });
  const status = ORDER_TABS.find((t) => t.key === s.tab)?.status;
  if (status) p.set('orderStatus', status);
  if (s.q) p.set('q', s.q);
  return `/orders/admin/list?${p}`;
}

type StatusFields = { orderStatus: string; paymentStatus: string; expiresAt: string | null };

// The customer-page label, plus how long a pending transfer still holds its stock.
export function orderBadge(o: StatusFields, now: Date): { label: string; tone: StatusTone } {
  const base = orderStatusLabel(o);
  if (o.orderStatus !== 'PENDING_PAYMENT' || !o.expiresAt) return base;
  const left = timeLeft(o.expiresAt, now);
  return { ...base, label: `${base.label} · ${left === 'đã quá hạn' ? 'quá hạn' : left}` };
}

const METHOD: Record<string, string> = { COD: 'COD', BANK_TRANSFER: 'Chuyển khoản', VNPAY: 'VNPay' };
const PAYMENT: Record<string, string> = { PAID: 'Đã thanh toán', PENDING: 'Chờ thanh toán', UNPAID: 'Thu khi giao', EXPIRED: 'Quá hạn', FAILED: 'Thất bại' };

export function paymentLabel(method: string, status: string): string {
  return `${METHOD[method] ?? method} · ${PAYMENT[status] ?? status}`;
}

// "HH:mm dd/MM" in Vietnam time (UTC+7, no daylight saving).
export function holdUntilText(expiresAt: string): string {
  const d = new Date(Date.parse(expiresAt) + 7 * 3_600_000);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())} ${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}`;
}

export type OrderActionKind = 'confirm-payment' | 'processing' | 'completed' | 'cancel';
export type OrderAction = { kind: OrderActionKind; label: string; danger: boolean; ask: boolean; note?: string };

const CANCEL: OrderAction = { kind: 'cancel', label: 'Huỷ đơn & hoàn kho', danger: true, ask: true };

// Mirrors backend ORDER_TRANSITIONS; money and stock moves ask for confirmation first.
export function orderActions(o: { orderStatus: string; paymentMethod: string; paymentStatus: string }): OrderAction[] {
  switch (o.orderStatus) {
    case 'PENDING_PAYMENT':
      return o.paymentMethod === 'BANK_TRANSFER' ? [{ kind: 'confirm-payment', label: '✓ Xác nhận đã nhận tiền', danger: false, ask: true }, CANCEL] : [CANCEL];
    case 'CONFIRMED':
      return [{ kind: 'processing', label: 'Đang giao', danger: false, ask: false }, CANCEL];
    case 'PROCESSING':
      return [{ kind: 'completed', label: 'Hoàn tất', danger: false, ask: false, ...(o.paymentStatus === 'UNPAID' && { note: 'Đơn COD: hoàn tất nghĩa là đã thu tiền mặt.' }) }];
    default:
      return [];
  }
}

export function actionRequest(kind: OrderActionKind, id: string): { path: string; body?: string } {
  const base = `/orders/admin/${encodeURIComponent(id)}`;
  if (kind === 'confirm-payment') return { path: `${base}/confirm-payment` };
  if (kind === 'cancel') return { path: `${base}/cancel` };
  return { path: `${base}/status`, body: JSON.stringify({ status: kind === 'processing' ? 'PROCESSING' : 'COMPLETED' }) };
}
