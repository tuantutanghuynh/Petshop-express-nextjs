// Teal strip above the header. Lines come from /admin/cau-hinh (announcement_items); until the owner
// writes some, it shows promises the shop keeps today (COD, 24h hold for bank transfers, free
// advice) — never the mock-up's free shipping or 30-day returns, which do not exist.
const DEFAULTS = [
  '🚚 Giao hàng toàn quốc · Thanh toán khi nhận hàng (COD)',
  '🏦 Chuyển khoản: giữ hàng 24 giờ',
  '💬 Tư vấn miễn phí qua điện thoại / Zalo',
];

export function AnnouncementBar({ items }: { items: string[] | null }) {
  const lines = items ?? DEFAULTS;
  return (
    <div className="bg-brand-ink text-[0.8rem] font-bold text-white">
      <div className="mx-auto flex min-h-8 max-w-[1200px] items-center justify-center gap-6 overflow-hidden px-4 whitespace-nowrap md:px-6 lg:justify-between">
        {lines.map((line, i) => (
          // Phones show the first line only; the others join from 1024px.
          <span key={i} className={i === 0 ? 'truncate' : 'hidden truncate lg:inline'}>{line}</span>
        ))}
      </div>
    </div>
  );
}
