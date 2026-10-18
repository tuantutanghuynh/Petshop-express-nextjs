'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from './CartProvider';

// Signed out: a login link that brings the customer back to this page. Signed in: the account
// page (orders, log out).
export function AccountControl() {
  const { status } = useCart();
  const pathname = usePathname();
  const base = 'flex min-h-11 items-center rounded-full px-3 text-sm font-bold text-ink hover:bg-mint';
  if (status === 'loading' || status === 'error') return null;
  if (status === 'signedOut') {
    return <Link href={`/dang-nhap?next=${encodeURIComponent(pathname)}`} className={base}>Đăng nhập</Link>;
  }
  return <Link href="/tai-khoan" className={base}>Tài khoản</Link>;
}
