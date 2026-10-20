// Dashboard helpers (test/adminDashboard.test.ts). Times are compared in UTC; "this month" starts at
// 00:00 on the 1st in Vietnam (UTC+7, no daylight saving), like the shop's own calendar.
const VN_OFFSET_MS = 7 * 3_600_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type Period = '30d' | 'month';

export function rangeFor(period: Period, now: Date): { from: string; to: string } {
  if (period === '30d') return { from: new Date(now.getTime() - 30 * DAY).toISOString(), to: now.toISOString() };
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const monthStart = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), 1) - VN_OFFSET_MS;
  return { from: new Date(monthStart).toISOString(), to: now.toISOString() };
}

// Bank-transfer orders whose stock hold ends soonest first; orders without a hold are skipped.
export function expiringOrders<T extends { expiresAt: string | null }>(orders: T[], limit = 5): T[] {
  return orders
    .filter((o): o is T & { expiresAt: string } => o.expiresAt !== null)
    .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt))
    .slice(0, limit);
}

export function timeLeft(expiresAt: string, now: Date): string {
  const ms = Date.parse(expiresAt) - now.getTime();
  if (ms <= 0) return 'đã quá hạn';
  return ms < HOUR ? `còn ${Math.ceil(ms / MINUTE)} phút` : `còn ${Math.floor(ms / HOUR)} giờ`;
}

export function timeAgo(createdAt: string, now: Date): string {
  const ms = now.getTime() - Date.parse(createdAt);
  if (ms < MINUTE) return 'vừa xong';
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} phút trước`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} giờ trước`;
  return `${Math.floor(ms / DAY)} ngày trước`;
}
