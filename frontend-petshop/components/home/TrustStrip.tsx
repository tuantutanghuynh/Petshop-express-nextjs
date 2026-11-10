// Commitments the shop keeps today (no loyalty points or 24/7 support, unlike the mock-up).
const ITEMS = [
  { icon: '🩺', title: 'Kiến thức thú y', text: 'Bài viết có nguồn tham khảo' },
  { icon: '✔', title: 'Hàng chính hãng', text: 'Chọn lọc kỹ' },
  { icon: '☺', title: 'Bé cưng là trên hết', text: 'Tư vấn tận tâm' },
  { icon: '🧾', title: 'Theo dõi đơn', text: 'Xem lại trong tài khoản' },
  { icon: '☎', title: 'Hỗ trợ', text: 'Gọi / Zalo giờ hành chính' },
];

// Phones: one panel with five rows split by lines (five cards in two columns left the last one
// alone); from md: five cards in one row, icon above the text.
export function TrustStrip() {
  return (
    <section aria-label="Cam kết của cửa hàng" className="mx-auto max-w-[1200px] px-4 py-6 md:px-6">
      <ul className="flex flex-col divide-y divide-line rounded-card bg-surface-alt md:grid md:grid-cols-5 md:gap-3 md:divide-y-0 md:bg-transparent">
        {ITEMS.map((item) => (
          <li key={item.title} className="flex items-center gap-3 px-4 py-3 text-xs leading-[1.4] md:flex-col md:rounded-card md:bg-surface-alt md:p-3.5 md:text-center">
            <span aria-hidden="true" className="w-7 shrink-0 text-center text-xl text-pink md:w-auto md:text-2xl">{item.icon}</span>
            <span className="min-w-0"><b className="block text-sm text-ink">{item.title}</b>{item.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
