'use client';
import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '../../../../lib/adminAuth';
import type { BlogPost, UploadResult } from '../../../../lib/types';

async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);
  const json = await authFetch<UploadResult>('/uploads/image', {
    method: 'POST',
    body: formData,
  });
  return json.data.url;
}

export default function NewPostPage() {
  const router = useRouter();
  const [form, setForm] = useState({ title: '', slug: '', excerpt: '', content: '', coverImageUrl: '' });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleCoverUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const url = await uploadImage(file);
      setForm((f) => ({ ...f, coverImageUrl: url }));
    } catch {
      setErrorMsg('Lỗi khi tải ảnh lên. Vui lòng thử lại.');
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await authFetch<BlogPost>('/blog', { method: 'POST', body: JSON.stringify(form) });
      router.push('/admin/posts');
    } catch {
      setErrorMsg('Lỗi khi lưu bài viết. Vui lòng kiểm tra lại (có thể trùng slug).');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto mt-8">
      <h1 className="text-2xl font-bold mb-4">Viết bài mới</h1>
      {errorMsg && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{errorMsg}</div>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          required placeholder="Tiêu đề" value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="border border-gray-300 rounded px-3 py-2"
        />
        <input
          required placeholder="Slug (vd: cach-chon-hat-cho-cho)" value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          className="border border-gray-300 rounded px-3 py-2"
        />
        <input
          placeholder="Tóm tắt" value={form.excerpt}
          onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
          className="border border-gray-300 rounded px-3 py-2"
        />
        <input type="file" accept="image/*" onChange={handleCoverUpload} />
        {form.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${process.env.NEXT_PUBLIC_BACKEND_ORIGIN}${form.coverImageUrl}`}
            alt="preview"
            className="max-w-[200px] rounded"
          />
        )}
        <textarea
          required rows={12} placeholder="Nội dung (Markdown)" value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          className="border border-gray-300 rounded px-3 py-2 font-mono text-sm"
        />
        <button
          type="submit" disabled={submitting}
          className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
        >
          {submitting ? 'Đang lưu...' : 'Lưu bài viết'}
        </button>
      </form>
    </div>
  );
}
