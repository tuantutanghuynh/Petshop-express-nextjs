import Image from 'next/image';
import type { Metadata } from 'next';
import { apiFetch } from '../../lib/apiClient';
import type { GalleryItem } from '../../lib/types';

export const metadata: Metadata = { title: 'Gallery' };

export default async function GalleryPage() {
  // cache: 'no-store' vì chưa có cơ chế revalidate on-demand khi admin thêm/xoá ảnh —
  // dùng next.revalidate ở đây sẽ khiến ảnh mới "biến mất tạm thời" tới 60s sau khi thêm
  // (đã tự gặp bug này, xem log buổi 11). Sẽ đổi lại thành ISR đúng khi xây revalidate
  // on-demand (gọi revalidatePath từ 1 Route Handler ngay sau khi admin tạo/xoá thành công).
  const { data: items } = await apiFetch<GalleryItem[]>('/gallery', { cache: 'no-store' });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Gallery</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((item) => (
          <Image
            key={item.id}
            src={`${process.env.NEXT_PUBLIC_BACKEND_ORIGIN}${item.imageUrl}`}
            alt={item.altText}
            width={300}
            height={300}
            className="w-full h-auto object-cover rounded-lg"
          />
        ))}
      </div>
    </div>
  );
}
