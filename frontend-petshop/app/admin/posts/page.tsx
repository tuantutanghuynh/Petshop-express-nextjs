import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PostsManager } from '../../../components/admin/posts/PostsManager';

export const metadata: Metadata = { title: 'Bài viết' };

// useSearchParams (tab, search, page) needs a Suspense boundary for the static shell (Next 16).
export default function AdminPostsPage() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Đang tải bài viết" className="h-60 animate-pulse rounded-card bg-line" />}>
      <PostsManager />
    </Suspense>
  );
}
