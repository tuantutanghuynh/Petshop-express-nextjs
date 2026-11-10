'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { slugify } from '../../../lib/adminCategories';
import { authFetch } from '../../../lib/adminAuth';
import { canEditSlug, emptyPost, postBody, postToForm, validatePostForm, type PostFormValues } from '../../../lib/adminPosts';
import { revalidateStorefront } from '../../../lib/adminRevalidate';
import { apiFetch } from '../../../lib/apiClient';
import { buildCategoryTree, type CategoryNode } from '../../../lib/categoryTree';
import { fieldErrors, focusFirstError, type FieldErrors } from '../../../lib/forms';
import { BRAND_SLUG } from '../../../lib/site';
import type { BlogPost, Category } from '../../../lib/types';
import { FormAlert } from '../../ui/FormAlert';
import { PostFields } from './PostFields';

type Ready = { state: 'ready'; post: BlogPost | null; values: PostFormValues; categories: (CategoryNode & { depth: number })[] };
type Load = { state: 'loading' } | { state: 'error' } | Ready;

const withDepth = (nodes: CategoryNode[], depth = 0): (CategoryNode & { depth: number })[] =>
  nodes.flatMap((n) => [{ ...n, depth }, ...withDepth(n.children, depth + 1)]);

async function loadForm(id?: string): Promise<Load> {
  try {
    const [postRes, cats] = await Promise.all([
      id ? authFetch<BlogPost>(`/blog/admin/${id}`) : Promise.resolve(null),
      apiFetch<Category[]>('/categories', { cache: 'no-store' }),
    ]);
    if (postRes && !postRes.data) return { state: 'error' };
    const post = postRes?.data ?? null;
    return { state: 'ready', post, values: post ? postToForm(post) : emptyPost(), categories: withDepth(buildCategoryTree(cats.data, BRAND_SLUG)) };
  } catch {
    return { state: 'error' };
  }
}

// Write (no id) or edit one post (spec 2026-11-10). The slug follows the title until it is typed
// by hand, and is locked once the post is published (the backend refuses it too: 409 SLUG_LOCKED).
// Saving refreshes the cached blog pages and goes back to the list.
export function PostForm({ id }: { id?: string }) {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(id));

  useEffect(() => {
    let active = true;
    loadForm(id).then((next) => active && setLoad(next));
    return () => {
      active = false;
    };
  }, [id]);

  if (load.state === 'loading') return <div aria-busy="true" aria-label="Đang tải bài viết" className="h-96 max-w-3xl animate-pulse rounded-card bg-line" />;
  if (load.state === 'error') return <FormAlert message="Không tìm thấy bài viết này, hoặc chưa tải được. Tải lại trang để thử lại." />;

  const ready = load;
  const slugLocked = !canEditSlug(ready.post);
  const set = (patch: Partial<PostFormValues>) => setLoad({ ...ready, values: { ...ready.values, ...patch } });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const found = validatePostForm(ready.values);
    setErrors(found);
    setAlert(null);
    if (Object.keys(found).length > 0) {
      setAlert('Có ô chưa hợp lệ, xem các dòng báo đỏ.');
      return focusFirstError(form, found);
    }
    setSaving(true);
    try {
      const res = await authFetch<BlogPost>(id ? `/blog/${id}` : '/blog', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(postBody(ready.values)) });
      if (res.error) {
        const server = fieldErrors(res.error.details);
        if (res.error.code === 'SLUG_TAKEN' || res.error.code === 'SLUG_LOCKED') server.slug = res.error.message;
        setErrors(server);
        setAlert(Object.keys(server).length > 0 ? 'Có ô chưa hợp lệ, xem các dòng báo đỏ.' : res.error.message || 'Chưa lưu được bài viết.');
        setSaving(false);
        requestAnimationFrame(() => focusFirstError(form, server));
        return;
      }
      await revalidateStorefront(['blog']);
      router.push('/admin/posts');
    } catch {
      setAlert('Chưa lưu được bài viết. Kiểm tra mạng rồi thử lại.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex max-w-3xl flex-col gap-4">
      <FormAlert message={alert} />
      <PostFields values={ready.values} errors={errors} categories={ready.categories} slugLocked={slugLocked} onChange={set} onUploading={setUploading}
        onTitle={(title) => set(slugTouched || slugLocked ? { title } : { title, slug: slugify(title) })}
        onSlug={(slug) => { setSlugTouched(true); set({ slug }); }} />
      <div className="flex flex-col gap-2 md:flex-row">
        <button type="submit" disabled={saving || uploading} className="min-h-12 w-full rounded-full bg-brand-ink px-6 font-bold text-white disabled:opacity-60 md:w-auto">
          {saving ? 'Đang lưu…' : ready.values.status === 'published' ? 'Lưu và đăng' : 'Lưu nháp'}
        </button>
        <button type="button" onClick={() => router.push('/admin/posts')} className="min-h-12 w-full rounded-full border border-line px-6 font-bold text-ink md:w-auto">Huỷ</button>
      </div>
    </form>
  );
}
