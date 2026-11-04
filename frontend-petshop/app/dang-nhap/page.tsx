import type { Metadata } from 'next';
import { LoginForm } from '../../components/auth/LoginForm';
import { safeNext } from '../../lib/forms';

// Private page: kept out of search results (also disallowed in robots.txt).
export const metadata: Metadata = { title: 'Đăng nhập', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ next?: string | string[]; 'da-doi-mat-khau'?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = params.next;
  // Arrived from /dat-lai-mat-khau after a successful reset.
  const notice = params['da-doi-mat-khau'] === '1' ? 'Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới.' : undefined;
  return (
    <main id="main" className="mx-auto w-full max-w-md px-4 md:px-6 py-8">
      <h1 className="mb-6 text-2xl font-extrabold">Đăng nhập</h1>
      <LoginForm next={safeNext(typeof next === 'string' ? next : undefined)} notice={notice} />
    </main>
  );
}
