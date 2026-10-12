'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, getToken } from '../../../lib/adminAuth';
import type { BlogPost } from '../../../lib/types';

export default function AdminPostsPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = '/admin/login';
      return;
    }
    authFetch<BlogPost[]>('/blog/admin/list').then((res) => setPosts(res.data || []));
  }, []);

  return (
    <div className="max-w-2xl mx-auto mt-8">
      <h1 className="text-2xl font-bold mb-4">Bài viết</h1>
      <Link href="/admin/posts/new" className="text-blue-600 hover:underline">+ Viết bài mới</Link>
      <ul className="mt-4 divide-y divide-gray-200">
        {posts.map((post) => (
          <li key={post.id} className="py-2">
            {post.title} — <em className="text-gray-500">{post.status}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}
