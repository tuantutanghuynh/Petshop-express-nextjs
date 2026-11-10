import type { Metadata } from 'next';
import Link from 'next/link';
import { PostForm } from '../../../../components/admin/posts/PostForm';

export const metadata: Metadata = { title: 'Viết bài mới' };

export default function AdminNewPostPage() {
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/admin/posts" className="inline-flex min-h-11 items-center underline">Bài viết</Link> › <span>Viết bài mới</span>
      </nav>
      <h1 className="text-2xl leading-[1.3] font-extrabold">Viết bài mới</h1>
      <PostForm />
    </div>
  );
}
