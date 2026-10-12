'use client';
import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '../../../../lib/adminAuth';
import type { GalleryItem, UploadResult } from '../../../../lib/types';

export default function NewGalleryItemPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [altText, setAltText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const json = await authFetch<UploadResult>('/uploads/image', {
        method: 'POST',
        body: formData,
      });
      setImageUrl(json.data.url);
    } catch {
      setErrorMsg('Lỗi tải ảnh lên.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await authFetch<GalleryItem>('/gallery', { method: 'POST', body: JSON.stringify({ title, altText, imageUrl }) });
      // Chuyển về trang quản lý gallery của admin
      router.push('/admin/gallery');
    } catch {
      setErrorMsg('Lỗi lưu ảnh Gallery.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-8">
      <h1 className="text-2xl font-bold mb-4">Thêm ảnh Gallery</h1>
      {errorMsg && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{errorMsg}</div>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input type="file" accept="image/*" required onChange={handleUpload} />
        {uploading && <p className="text-sm text-gray-500">Đang tải ảnh lên...</p>}
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${process.env.NEXT_PUBLIC_BACKEND_ORIGIN}${imageUrl}`} alt="preview" className="rounded max-h-40 object-cover" />
        )}
        <input
          placeholder="Tiêu đề (tuỳ chọn)" value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2"
        />
        <input
          required placeholder="Mô tả ảnh (alt text — bắt buộc cho SEO)" value={altText}
          onChange={(e) => setAltText(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2"
        />
        <button
          type="submit" disabled={!imageUrl || submitting || uploading}
          className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
        >
          {submitting ? 'Đang lưu...' : 'Lưu'}
        </button>
      </form>
    </div>
  );
}
