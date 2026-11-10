import { redirect } from 'next/navigation';

// The write form moved to /admin/posts/moi (Vietnamese path, like /admin/san-pham/moi); old links
// and bookmarks still land on it.
export default function OldNewPostPage() {
  redirect('/admin/posts/moi');
}
