import type { Metadata } from 'next';
import Link from 'next/link';
import { PostForm } from '../../../../components/admin/posts/PostForm';

export const metadata: Metadata = { title: 'Sửa bài viết' };

type Props = { params: Promise<{ id: string }> };

export default async function AdminEditPostPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/admin/posts" className="inline-flex min-h-11 items-center underline">Bài viết</Link> › <span>Sửa bài</span>
      </nav>
      <h1 className="text-2xl leading-[1.3] font-extrabold">Sửa bài viết</h1>
      <PostForm id={id} />
    </div>
  );
}
