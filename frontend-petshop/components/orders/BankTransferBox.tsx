import { hoursLeft, type BankInfo } from '../../lib/orders';
import { formatVnd } from '../../lib/storefront';

const TZ = 'Asia/Ho_Chi_Minh';
const TIME = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
const DAY = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });
const deadline = (iso: string) => `${TIME.format(new Date(iso))} ngày ${DAY.format(new Date(iso))}`;

type Props = { bank: BankInfo | null; amount: number; code: string; expiresAt: string | null };

// What to transfer, where, with which reference, and until when. The order code is the transfer
// reference so the shop can match the payment to the order when confirming it.
export function BankTransferBox({ bank, amount, code, expiresAt }: Props) {
  const left = hoursLeft(expiresAt);
  return (
    <section aria-labelledby="bank-title" className="flex flex-col gap-3 rounded-panel bg-yellow-bg p-5">
      <h2 id="bank-title" className="text-lg font-extrabold">Thông tin chuyển khoản</h2>
      {bank ? (
        <dl className="flex flex-col gap-2 text-sm">
          {[
            ['Ngân hàng', bank.name, ''],
            ['Số tài khoản', bank.account, 'break-all'],
            ['Chủ tài khoản', bank.holder, ''],
            ['Số tiền', formatVnd(amount), 'whitespace-nowrap'],
            ['Nội dung', code, 'whitespace-nowrap'],
          ].map(([label, value, extra]) => (
            // The value wraps under its label only when the row is too narrow (320px phones).
            <div key={label} className="flex flex-wrap justify-between gap-x-4">
              <dt className="text-yellow-ink">{label}</dt>
              <dd className={`font-bold text-ink ${extra}`}>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm">Cửa hàng sẽ liên hệ để gửi thông tin chuyển khoản cho đơn <b>{code}</b>.</p>
      )}
      {expiresAt && left !== null && (
        <p className="text-sm text-yellow-ink">
          Cửa hàng giữ hàng cho bạn tới <b>{deadline(expiresAt)}</b>
          {left > 0 ? ` (còn khoảng ${left} giờ)` : ''}. Quá hạn chưa nhận được tiền, đơn sẽ tự huỷ.
        </p>
      )}
    </section>
  );
}
