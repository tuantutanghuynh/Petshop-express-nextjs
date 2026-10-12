import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { apiFetch } from '../../lib/apiClient';
import type { BlogPost } from '../../lib/types';

export const metadata: Metadata = { title: 'Blog' };

export default async function BlogListPage() {
  // cache: 'no-store' vì chưa có cơ chế revalidate on-demand khi admin publish bài —
  // dùng next.revalidate sẽ khiến bài mới publish "biến mất tạm thời" tới 60s (đã tự
  // gặp bug này với /gallery, xem log buổi 11). Đổi lại thành ISR đúng khi xây revalidate
  // on-demand (gọi revalidatePath từ 1 Route Handler ngay sau khi admin publish).
  const { data: posts } = await apiFetch<BlogPost[]>('/blog', { cache: 'no-store' });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Blog</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {posts.map((post) => (
          <article key={post.id} className="border border-gray-200 rounded-lg overflow-hidden">
            {post.coverImageUrl && (
              <Image
                src={`${process.env.NEXT_PUBLIC_BACKEND_ORIGIN}${post.coverImageUrl}`}
                alt={post.title}
                width={400}
                height={250}
                className="w-full h-auto"
              />
            )}
            <div className="p-4">
              <h2 className="text-lg font-semibold">
                <Link href={`/blog/${post.slug}`} className="hover:underline">{post.title}</Link>
              </h2>
              <p className="text-gray-600 mt-1">{post.excerpt}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
