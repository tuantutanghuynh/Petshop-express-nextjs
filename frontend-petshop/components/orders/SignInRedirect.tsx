'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { loginRedirectPath } from '../../lib/bff/privatePaths';

// Reached when a session cookie existed (so proxy.ts let the request through) but the session
// turned out dead. replace(), not push(): Back must not return to a page that redirects again.
export function SignInRedirect({ next }: { next: string }) {
  const router = useRouter();
  const href = loginRedirectPath(next);
  useEffect(() => router.replace(href), [router, href]);
  return (
    <p role="status">
      Đang chuyển tới trang đăng nhập…{' '}
      <Link href={href} className="font-bold text-brand-deep underline">Đăng nhập</Link>
    </p>
  );
}
