// Three promises under the hero — only what the shop does today (see design/README.md:
// no free-shipping threshold or 30-day returns until those policies exist).
const FEATURES = [
  { icon: '🚚', title: 'Giao toàn quốc', text: 'Thanh toán khi nhận hàng', bg: 'bg-brand-ink' },
  { icon: '🛡', title: 'Chuyển khoản an toàn', text: 'Giữ hàng cho bạn 24 giờ', bg: 'bg-orange-ink' },
  { icon: '💬', title: 'Tư vấn miễn phí', text: 'Gọi lại trong giờ làm việc', bg: 'bg-purple' },
];

// Phones: one row of three (icon above, centred text), so the promises take one short band
// instead of a screen; from md: icon beside the text, as before.
export function FeatureStrip() {
  return (
    <ul className="mx-auto grid max-w-[1200px] grid-cols-3 gap-2 border-b border-line px-4 py-4 md:gap-3 md:border-b-0 md:px-6">
      {FEATURES.map((f) => (
        <li key={f.title} className="flex min-w-0 flex-col items-center gap-2 text-center text-xs leading-[1.4] text-muted md:flex-row md:justify-center md:gap-3 md:text-left md:text-sm md:text-ink">
          <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-full text-white md:size-10 ${f.bg}`}>{f.icon}</span>
          <span className="min-w-0"><b className="block text-[13px] leading-[1.3] text-ink md:text-sm">{f.title}</b>{f.text}</span>
        </li>
      ))}
    </ul>
  );
}
