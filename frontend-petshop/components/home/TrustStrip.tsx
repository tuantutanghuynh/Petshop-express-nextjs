// Commitments the shop keeps today (no loyalty points or 24/7 support, unlike the mock-up).
const ITEMS = [
  { icon: '🩺', title: 'Kiến thức thú y', text: 'Bài viết có nguồn tham khảo' },
  { icon: '✔', title: 'Hàng chính hãng', text: 'Chọn lọc kỹ' },
  { icon: '☺', title: 'Bé cưng là trên hết', text: 'Tư vấn tận tâm' },
  { icon: '🧾', title: 'Theo dõi đơn', text: 'Xem lại trong tài khoản' },
  { icon: '☎', title: 'Hỗ trợ', text: 'Gọi / Zalo giờ hành chính' },
];

export function TrustStrip() {
  return (
    <section aria-label="Cam kết của cửa hàng" className="mx-auto max-w-[1200px] px-4 py-6">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {ITEMS.map((item) => (
          <li key={item.title} className="flex items-center gap-3 rounded-card bg-surface-alt p-3.5 text-xs">
            <span aria-hidden="true" className="text-2xl text-pink">{item.icon}</span>
            <span><b className="block text-sm text-ink">{item.title}</b>{item.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
