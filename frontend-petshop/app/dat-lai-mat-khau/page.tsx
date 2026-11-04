import type { Metadata } from 'next';
import { ResetPasswordForm } from '../../components/auth/ResetPasswordForm';

// Private page reached from the emailed link. The token is in the URL, so no Referer is sent to any
// page or resource it links to, and the page is kept out of search results.
export const metadata: Metadata = { title: 'Đặt lại mật khẩu', robots: { index: false, follow: false }, referrer: 'no-referrer' };

type Props = { searchParams: Promise<{ token?: string | string[]; email?: string | string[] }> };

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token, email } = await searchParams;
  return (
    <main id="main" className="mx-auto w-full max-w-md px-4 md:px-6 py-8">
      <h1 className="mb-6 text-2xl font-extrabold">Đặt mật khẩu mới</h1>
      <ResetPasswordForm email={one(email)} token={one(token)} />
    </main>
  );
}
