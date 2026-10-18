import type { Metadata } from 'next';
import { AccountView } from '../../components/account/AccountView';

export const metadata: Metadata = { title: 'Tài khoản', robots: { index: false, follow: false } };

export default function AccountPage() {
  return (
    <main id="main" className="mx-auto min-h-dvh max-w-3xl px-4 md:px-6 py-6">
      <h1 className="mb-6 text-2xl font-extrabold">Tài khoản</h1>
      <AccountView />
    </main>
  );
}
