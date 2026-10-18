import type { Metadata } from 'next';
import { RegisterForm } from '../../components/auth/RegisterForm';
import { safeNext } from '../../lib/forms';

// Private page: kept out of search results (also disallowed in robots.txt).
export const metadata: Metadata = { title: 'Đăng ký', robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function RegisterPage({ searchParams }: Props) {
  const { next } = await searchParams;
  return (
    <main id="main" className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="mb-6 text-2xl font-extrabold">Tạo tài khoản</h1>
      <RegisterForm next={safeNext(typeof next === 'string' ? next : undefined)} />
    </main>
  );
}
