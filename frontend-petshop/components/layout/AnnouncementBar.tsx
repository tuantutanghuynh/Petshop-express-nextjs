// Teal strip above the header. Only promises the shop keeps today (COD, 24h hold for bank
// transfers, free advice) — not the mock-up's free shipping / 30-day returns, which do not exist.
export function AnnouncementBar() {
  return (
    <div className="bg-brand-ink text-white text-[0.8rem] font-bold">
      <div className="mx-auto flex min-h-8 max-w-[1200px] items-center justify-center gap-6 overflow-hidden px-4 whitespace-nowrap lg:justify-between">
        <span className="truncate">🚚 Giao hàng toàn quốc · Thanh toán khi nhận hàng (COD)</span>
        <span className="hidden lg:inline">🏦 Chuyển khoản: giữ hàng 24 giờ</span>
        <span className="hidden lg:inline">💬 Tư vấn miễn phí qua điện thoại / Zalo</span>
      </div>
    </div>
  );
}
