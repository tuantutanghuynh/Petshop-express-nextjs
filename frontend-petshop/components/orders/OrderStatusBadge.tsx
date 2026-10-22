import { orderStatusLabel, type StatusTone } from '../../lib/orders';

// Tone → colours, shared with the admin order list and drawer.
export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  wait: 'bg-yellow-bg text-yellow-ink',
  ok: 'bg-mint text-brand-deep',
  done: 'bg-mint-card text-brand-deep',
  off: 'bg-surface-alt text-muted',
};

export function OrderStatusBadge({ order }: { order: { orderStatus: string; paymentStatus: string } }) {
  const { label, tone } = orderStatusLabel(order);
  return <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${STATUS_TONE_CLASSES[tone]}`}>{label}</span>;
}
