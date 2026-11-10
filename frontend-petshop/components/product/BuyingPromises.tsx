import Link from 'next/link';
import { zaloHref } from '../../lib/settings';

type Props = { shippingPolicyPath: string | null; zalo?: string };

// Under the buy button: answers to "how do I pay / can I return it / who do I ask" while the
// visitor decides. Only what the shop really does today — COD and bank transfer exist, orders are
// visible in the account, the genuine-goods line is the one the homepage already makes. The policy
// link appears only once the owner has written that page (an empty policy is a 404), and Zalo only
// when a number is set. No "giao 2 giờ" or "freeship" the shop does not offer.
export function BuyingPromises({ shippingPolicyPath, zalo }: Props) {
  const zaloLink = zaloHref(zalo);
  const link = 'font-bold text-brand-ink underline';
  const items = [
    { icon: '💵', text: <>Thanh toán khi nhận hàng (COD) hoặc chuyển khoản</> },
    { icon: '✔', text: <>Hàng chính hãng, chọn lọc kỹ</> },
    ...(shippingPolicyPath ? [{ icon: '🚚', text: <><Link href={shippingPolicyPath} className={link}>Chính sách giao hàng &amp; đổi trả</Link></> }] : []),
    { icon: '🧾', text: <>Theo dõi đơn trong <Link href="/tai-khoan/don-hang" className={link}>tài khoản</Link></> },
    ...(zaloLink ? [{ icon: '💬', text: <>Cần tư vấn chọn loại? <a href={zaloLink} target="_blank" rel="noopener noreferrer" className={link}>Nhắn Zalo</a></> }] : []),
  ];
  return (
    <section aria-label="Mua hàng tại cửa hàng" className="rounded-card bg-surface-alt">
      <ul className="flex flex-col divide-y divide-line">
        {items.map((item) => (
          <li key={item.icon} className="flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm leading-[1.4] text-ink">
            <span aria-hidden="true" className="w-6 shrink-0 text-center text-lg">{item.icon}</span>
            <span className="min-w-0">{item.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
