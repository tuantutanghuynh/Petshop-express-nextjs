import type { Metadata } from 'next';
import { LoginForm } from '../../components/auth/LoginForm';
import { safeNext } from '../../lib/forms';

// Private page: kept out of search results (also disallowed in robots.txt).
export const metadata: Metadata = { title: 'Đăng nhập', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  return (
    <main id="main" className="mx-auto w-full max-w-md px-4 md:px-6 py-8">
      <h1 className="mb-6 text-2xl font-extrabold">Đăng nhập</h1>
      <LoginForm next={safeNext(typeof next === 'string' ? next : undefined)} />
    </main>
  );
}
