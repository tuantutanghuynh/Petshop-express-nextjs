import type { Metadata } from 'next';
import { UnsubscribeButton } from '../../components/newsletter/UnsubscribeButton';

// Private page reached from the newsletter welcome email. The token is in the URL, so no Referer
// leaves the page and it stays out of search results.
export const metadata: Metadata = { title: 'Huỷ đăng ký nhận tin', robots: { index: false, follow: false }, referrer: 'no-referrer' };

type Props = { searchParams: Promise<{ token?: string | string[] }> };

export default async function UnsubscribePage({ searchParams }: Props) {
  const { token } = await searchParams;
  return (
    <main id="main" className="mx-auto w-full max-w-md px-4 py-8 md:px-6">
      <h1 className="mb-6 text-2xl leading-[1.3] font-extrabold">Huỷ đăng ký nhận tin</h1>
      <UnsubscribeButton token={typeof token === 'string' ? token : ''} />
    </main>
  );
}
