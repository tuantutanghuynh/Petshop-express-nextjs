import Link from 'next/link';
import './globals.css';

export const metadata = {
  title: { default: 'Petshop - Cửa hàng & Blog Thú Cưng', template: '%s | Petshop' },
  description: 'Chia sẻ kiến thức chăm sóc thú cưng, phụ kiện và thức ăn dinh dưỡng.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>
        <nav className="p-4 flex gap-4 flex-wrap border-b border-gray-200">
          <Link href="/blog" className="hover:underline">Blog</Link>
          <Link href="/gallery" className="hover:underline">Gallery</Link>
        </nav>
        <main className="p-4 max-w-3xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
