import type { Metadata } from 'next';
import { ForgotPasswordForm } from '../../components/auth/ForgotPasswordForm';

// Private page: kept out of search results (also disallowed in robots.txt).
export const metadata: Metadata = { title: 'Quên mật khẩu', robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-md px-4 md:px-6 py-8">
      <h1 className="mb-2 text-2xl font-extrabold">Quên mật khẩu</h1>
      <p className="mb-6 text-muted">Nhập email bạn dùng để đăng ký, chúng tôi sẽ gửi link đặt mật khẩu mới.</p>
      <ForgotPasswordForm />
    </main>
  );
}
