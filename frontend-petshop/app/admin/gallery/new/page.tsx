import { redirect } from 'next/navigation';

// The add form moved to /admin/gallery/moi (Vietnamese path, like /admin/san-pham/moi); old links
// and bookmarks still land on it.
export default function OldNewGalleryItemPage() {
  redirect('/admin/gallery/moi');
}
