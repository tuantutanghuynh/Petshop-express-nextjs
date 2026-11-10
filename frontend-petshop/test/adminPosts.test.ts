import { describe, expect, it } from 'vitest';
import { POSTS_PAGE_SIZE, POST_LIMITS, POST_STATE_LABELS, POST_TABS, canEditSlug, parsePostsQuery, postBody, postState, postToForm, postsAdminHref, postsApiPath, validatePostForm, type PostFormValues } from '../lib/adminPosts';
import type { BlogPost } from '../lib/types';

// Post form and list rules (spec 2026-11-10). The backend enforces the same limits and the slug lock
// (routes/blog.route.ts, blog.controller.ts update).
const form = (over: Partial<PostFormValues> = {}): PostFormValues => ({
  title: 'Bao lâu tẩy giun cho mèo?', slug: 'bao-lau-tay-giun-cho-meo', excerpt: '', coverImageUrl: '', categoryId: '',
  content: '# Nội dung', seoTitle: '', seoDescription: '', status: 'draft', publishedAt: '', ...over,
});
const post = (over: Partial<BlogPost> = {}): BlogPost => ({
  id: 'p1', title: 'T', slug: 's', excerpt: null, content: 'c', coverImageUrl: null, status: 'draft', seoTitle: null,
  seoDescription: null, publishedAt: null, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...over,
});

describe('validatePostForm', () => {
  it('accepts a complete draft', () => {
    expect(validatePostForm(form())).toEqual({});
  });

  it('needs a title, a slug and content', () => {
    expect(validatePostForm(form({ title: ' ', slug: '', content: '  ' }))).toEqual({ title: 'Nhập tiêu đề', slug: 'Nhập đường dẫn', content: 'Nhập nội dung' });
  });

  it('refuses a slug the URL cannot carry', () => {
    for (const slug of ['Co Dau', 'meo--con', '-meo', 'mèo']) {
      expect(validatePostForm(form({ slug })).slug, slug).toBe('Chỉ dùng chữ thường không dấu, số và dấu gạch ngang');
    }
  });

  it('allows every limit and refuses one character more', () => {
    const atMax = form({ title: 'a'.repeat(POST_LIMITS.title), excerpt: 'a'.repeat(500), seoTitle: 'a'.repeat(70), seoDescription: 'a'.repeat(160) });
    expect(validatePostForm(atMax)).toEqual({});
    expect(validatePostForm(form({ title: 'a'.repeat(201), excerpt: 'a'.repeat(501), seoTitle: 'a'.repeat(71), seoDescription: 'a'.repeat(161) }))).toEqual({
      title: 'Tối đa 200 ký tự', excerpt: 'Tối đa 500 ký tự', seoTitle: 'Tối đa 70 ký tự', seoDescription: 'Tối đa 160 ký tự',
    });
  });

  it('refuses a publish date that is not a date', () => {
    expect(validatePostForm(form({ publishedAt: '2026-13-40T99:00' })).publishedAt).toBe('Ngày giờ không hợp lệ');
  });
});

describe('postBody', () => {
  it('trims, sends empty optional fields as null and leaves out an empty date', () => {
    expect(postBody(form({ title: ' T ', excerpt: '  ' }))).toEqual({
      title: 'T', slug: 'bao-lau-tay-giun-cho-meo', excerpt: null, coverImageUrl: null, categoryId: null,
      content: '# Nội dung', seoTitle: null, seoDescription: null, status: 'draft',
    });
  });

  it('reads the date as Vietnam time (UTC+7)', () => {
    expect(postBody(form({ status: 'published', publishedAt: '2026-11-20T08:30' })).publishedAt).toBe('2026-11-20T01:30:00.000Z');
  });
});

describe('postToForm', () => {
  it('shows a stored date in Vietnam time and nulls as empty fields', () => {
    const v = postToForm(post({ status: 'published', publishedAt: '2026-11-20T01:30:00.000Z', category: { id: 'c1', name: 'Mèo', slug: 'meo' } }));
    expect(v).toMatchObject({ publishedAt: '2026-11-20T08:30', status: 'published', excerpt: '', categoryId: 'c1' });
  });

  it('round-trips a date through the form', () => {
    const iso = '2026-12-31T17:05:00.000Z';
    expect(postBody(postToForm(post({ status: 'published', publishedAt: iso }))).publishedAt).toBe(iso);
  });
});

describe('postState / canEditSlug', () => {
  const now = new Date('2026-11-10T00:00:00.000Z');

  it('tells drafts, live posts and scheduled posts apart', () => {
    expect(postState(post(), now)).toBe('draft');
    expect(postState(post({ status: 'published', publishedAt: '2026-11-09T00:00:00.000Z' }), now)).toBe('published');
    expect(postState(post({ status: 'published', publishedAt: '2026-11-11T00:00:00.000Z' }), now)).toBe('scheduled');
    expect(Object.keys(POST_STATE_LABELS).sort()).toEqual(['draft', 'published', 'scheduled']);
  });

  it('locks the slug once the post is published, scheduled included', () => {
    expect(canEditSlug(null)).toBe(true);
    expect(canEditSlug(post())).toBe(true);
    expect(canEditSlug(post({ status: 'published', publishedAt: '2026-11-11T00:00:00.000Z' }))).toBe(false);
  });
});

describe('post list URLs', () => {
  it('reads tab, search and page, falling back to the defaults', () => {
    expect(parsePostsQuery(new URLSearchParams('tab=draft&q=%20giun%20&page=2'))).toEqual({ tab: 'draft', q: 'giun', page: 2 });
    expect(parsePostsQuery(new URLSearchParams('tab=nope&page=0'))).toEqual({ tab: 'all', q: '', page: 1 });
  });

  it('leaves defaults out of the address', () => {
    expect(postsAdminHref({ tab: 'all', q: '', page: 1 })).toBe('/admin/posts');
    expect(postsAdminHref({ tab: 'scheduled', q: 'mèo', page: 3 })).toBe('/admin/posts?tab=scheduled&q=m%C3%A8o&page=3');
  });

  it('asks the API for the tab status, a search from 2 characters, 20 a page', () => {
    expect(postsApiPath({ tab: 'all', q: 'a', page: 1 })).toBe(`/blog/admin/list?page=1&pageSize=${POSTS_PAGE_SIZE}`);
    expect(postsApiPath({ tab: 'published', q: 'giun', page: 2 })).toBe(`/blog/admin/list?page=2&pageSize=${POSTS_PAGE_SIZE}&status=published&search=giun`);
    expect(POST_TABS.map((t) => t.key)).toEqual(['all', 'draft', 'published', 'scheduled']);
  });
});
