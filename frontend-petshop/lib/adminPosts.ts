import type { FieldErrors } from './forms';
import type { BlogPost } from './types';
import { fromVietnamLocal, toVietnamLocal } from './vnTime';

// Rules of the admin post form and list (test/adminPosts.test.ts). The backend enforces the same
// limits and refuses a new slug on a published post (routes/blog.route.ts, blog.controller.ts).
export const POST_LIMITS = { title: 200, slug: 200, excerpt: 500, seoTitle: 70, seoDescription: 160 } as const;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type PostFormValues = {
  title: string;
  slug: string;
  excerpt: string;
  coverImageUrl: string;
  categoryId: string;
  content: string;
  seoTitle: string;
  seoDescription: string;
  status: 'draft' | 'published';
  // "YYYY-MM-DDTHH:mm" in Vietnam time (a datetime-local value), or '' for "now".
  publishedAt: string;
};

export type PostState = 'draft' | 'published' | 'scheduled';

export const POST_STATE_LABELS: Record<PostState, string> = { draft: 'Nháp', published: 'Đã đăng', scheduled: 'Hẹn giờ' };

export function emptyPost(): PostFormValues {
  return { title: '', slug: '', excerpt: '', coverImageUrl: '', categoryId: '', content: '', seoTitle: '', seoDescription: '', status: 'draft', publishedAt: '' };
}

export function postToForm(post: BlogPost): PostFormValues {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? '',
    coverImageUrl: post.coverImageUrl ?? '',
    categoryId: post.category?.id ?? '',
    content: post.content,
    seoTitle: post.seoTitle ?? '',
    seoDescription: post.seoDescription ?? '',
    status: post.status === 'published' ? 'published' : 'draft',
    publishedAt: post.publishedAt ? toVietnamLocal(post.publishedAt) : '',
  };
}

export function validatePostForm(v: PostFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const tooLong = (field: keyof typeof POST_LIMITS) => {
    if (v[field].trim().length > POST_LIMITS[field]) errors[field] = `Tối đa ${POST_LIMITS[field]} ký tự`;
  };
  if (!v.title.trim()) errors.title = 'Nhập tiêu đề';
  else tooLong('title');
  const slug = v.slug.trim();
  if (!slug) errors.slug = 'Nhập đường dẫn';
  else if (!SLUG_PATTERN.test(slug)) errors.slug = 'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang';
  else tooLong('slug');
  if (!v.content.trim()) errors.content = 'Nhập nội dung';
  tooLong('excerpt');
  tooLong('seoTitle');
  tooLong('seoDescription');
  if (v.publishedAt && !fromVietnamLocal(v.publishedAt)) errors.publishedAt = 'Ngày giờ không hợp lệ';
  return errors;
}

export function postBody(v: PostFormValues) {
  const optional = (s: string) => s.trim() || null;
  const publishedAt = v.publishedAt ? fromVietnamLocal(v.publishedAt) : null;
  return {
    title: v.title.trim(),
    slug: v.slug.trim(),
    excerpt: optional(v.excerpt),
    coverImageUrl: optional(v.coverImageUrl),
    categoryId: optional(v.categoryId),
    content: v.content,
    seoTitle: optional(v.seoTitle),
    seoDescription: optional(v.seoDescription),
    status: v.status,
    ...(publishedAt && { publishedAt }),
  };
}

export function postState(post: Pick<BlogPost, 'status' | 'publishedAt'>, now: Date = new Date()): PostState {
  if (post.status !== 'published') return 'draft';
  return post.publishedAt && new Date(post.publishedAt) > now ? 'scheduled' : 'published';
}

// A published post's URL is already out there (spec 2026-11-10: no redirect table for posts).
export function canEditSlug(post: Pick<BlogPost, 'status'> | null): boolean {
  return !post || post.status !== 'published';
}

// /admin/posts list state lives in the URL, like the other admin lists (lib/newsletter.ts).
export const POST_TABS = [
  { key: 'all', label: 'Tất cả', status: null },
  { key: 'draft', label: 'Nháp', status: 'draft' },
  { key: 'published', label: 'Đã đăng', status: 'published' },
  { key: 'scheduled', label: 'Hẹn giờ', status: 'scheduled' },
] as const;
export type PostTab = (typeof POST_TABS)[number]['key'];
export type PostsQuery = { tab: PostTab; q: string; page: number };
export const POSTS_PAGE_SIZE = 20;
const POSTS_BASE = '/admin/posts';

export function parsePostsQuery(sp: URLSearchParams): PostsQuery {
  const page = Number(sp.get('page'));
  return {
    tab: POST_TABS.find((t) => t.key === sp.get('tab'))?.key ?? 'all',
    q: (sp.get('q') ?? '').trim().slice(0, 100),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function postsAdminHref(s: PostsQuery): string {
  const p = new URLSearchParams();
  if (s.tab !== 'all') p.set('tab', s.tab);
  if (s.q) p.set('q', s.q);
  if (s.page > 1) p.set('page', String(s.page));
  const qs = p.toString();
  return qs ? `${POSTS_BASE}?${qs}` : POSTS_BASE;
}

export function postsApiPath(s: PostsQuery): string {
  const p = new URLSearchParams({ page: String(s.page), pageSize: String(POSTS_PAGE_SIZE) });
  const status = POST_TABS.find((t) => t.key === s.tab)?.status;
  if (status) p.set('status', status);
  if (s.q.length >= 2) p.set('search', s.q);
  return `/blog/admin/list?${p}`;
}
