import Link from 'next/link';

// "👤 Tài khoản" with its label under the icon (wireframe). The account page itself asks a
// signed-out visitor to log in, so this link is the same for everyone.
export function AccountControl() {
  return (
    <Link href="/tai-khoan" className="flex min-h-11 min-w-11 flex-col items-center justify-center rounded-card px-2 text-ink hover:bg-mint">
      <span aria-hidden="true" className="text-xl leading-none">👤</span>
      <span className="text-xs font-bold">Tài khoản</span>
    </Link>
  );
}
