'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from './CartProvider';

// Signed out: a login link that brings the customer back to this page. Signed in: log out.
// (The account page with "my orders" arrives with checkout.)
export function AccountControl() {
  const { status, logout } = useCart();
  const pathname = usePathname();
  const base = 'flex min-h-11 items-center rounded-full px-3 text-sm font-bold text-ink hover:bg-mint';
  if (status === 'loading' || status === 'error') return null;
  if (status === 'signedOut') {
    return <Link href={`/dang-nhap?next=${encodeURIComponent(pathname)}`} className={base}>Đăng nhập</Link>;
  }
  return <button type="button" onClick={() => void logout()} className={base}>Đăng xuất</button>;
}
