// Three promises under the hero — only what the shop does today (see design/README.md:
// no free-shipping threshold or 30-day returns until those policies exist).
const FEATURES = [
  { icon: '🚚', title: 'Giao toàn quốc', text: 'Thanh toán khi nhận hàng', bg: 'bg-brand-ink' },
  { icon: '🛡', title: 'Chuyển khoản an toàn', text: 'Giữ hàng cho bạn 24 giờ', bg: 'bg-orange-ink' },
  { icon: '💬', title: 'Tư vấn miễn phí', text: 'Gọi lại trong giờ làm việc', bg: 'bg-purple' },
];

export function FeatureStrip() {
  return (
    <ul className="mx-auto grid max-w-[1200px] gap-3 px-4 py-4 md:grid-cols-3">
      {FEATURES.map((f) => (
        <li key={f.title} className="flex items-center gap-3 text-sm">
          <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-full text-white ${f.bg}`}>{f.icon}</span>
          <span><b className="block text-ink">{f.title}</b>{f.text}</span>
        </li>
      ))}
    </ul>
  );
}
