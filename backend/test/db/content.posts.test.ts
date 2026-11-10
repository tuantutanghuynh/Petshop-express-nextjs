import { describe, expect, it } from 'vitest';
import { call } from './helpers/http';
import { createAdmin, createUser } from './helpers/factories';

// Admin post management (spec 2026-11-10): one post of any status for the edit form, the slug of a
// published post is locked (its URL is already out there), and length rules on every text field.

const post = (slug: string, extra: Record<string, unknown> = {}) => ({ title: 'Lịch tẩy giun cho mèo', slug, content: '# Nội dung', ...extra });
const create = async (token: string, slug: string, extra: Record<string, unknown> = {}) =>
  (await call('post', '/api/v1/blog', { token, brand: null }).send(post(slug, extra))).body.data as { id: string; slug: string };
const patch = (token: string, id: string, body: Record<string, unknown>) => call('patch', `/api/v1/blog/${id}`, { token, brand: null }).send(body);

describe('GET /blog/admin/:id', () => {
  it('gives the admin a draft with its content, category and author', async () => {
    const admin = await createAdmin();
    const { id } = await create(admin.token, 'nhap');
    const res = await call('get', `/api/v1/blog/admin/${id}`, { token: admin.token, brand: null });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id, slug: 'nhap', status: 'draft', content: '# Nội dung' });
    expect(Object.keys(res.body.data.author).sort()).toEqual(['fullName', 'id']);
  });

  it('is 401 without a token, 403 for a customer, 404 for an unknown id', async () => {
    const admin = await createAdmin();
    const customer = await createUser();
    const { id } = await create(admin.token, 'rieng');
    expect((await call('get', `/api/v1/blog/admin/${id}`, { brand: null })).status).toBe(401);
    expect((await call('get', `/api/v1/blog/admin/${id}`, { token: customer.token, brand: null })).status).toBe(403);
    const missing = await call('get', '/api/v1/blog/admin/00000000-0000-0000-0000-000000000000', { token: admin.token, brand: null });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('POST_NOT_FOUND');
  });
});

describe('slug of a published post', () => {
  it('cannot change (409 SLUG_LOCKED) and stays as it was', async () => {
    const admin = await createAdmin();
    const { id } = await create(admin.token, 'da-dang', { status: 'published' });
    const res = await patch(admin.token, id, { slug: 'duong-dan-moi' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLUG_LOCKED');
    expect((await call('get', '/api/v1/blog/da-dang', { brand: null })).status).toBe(200);
  });

  it('can be sent unchanged with other edits', async () => {
    const admin = await createAdmin();
    const { id } = await create(admin.token, 'giu-nguyen', { status: 'published' });
    const res = await patch(admin.token, id, { slug: 'giu-nguyen', title: 'Tiêu đề mới' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Tiêu đề mới');
  });

  it('of a draft can still change', async () => {
    const admin = await createAdmin();
    const { id } = await create(admin.token, 'ban-nhap');
    const res = await patch(admin.token, id, { slug: 'ban-nhap-moi' });
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('ban-nhap-moi');
  });
});

describe('length and format rules', () => {
  it.each([
    ['title over 200', { title: 'a'.repeat(201) }],
    ['slug with spaces and capitals', { slug: 'Bad Slug' }],
    ['excerpt over 500', { excerpt: 'a'.repeat(501) }],
    ['seoTitle over 70', { seoTitle: 'a'.repeat(71) }],
    ['seoDescription over 160', { seoDescription: 'a'.repeat(161) }],
  ])('rejects %s with 422 on create and on edit', async (_name, bad) => {
    const admin = await createAdmin();
    const created = await call('post', '/api/v1/blog', { token: admin.token, brand: null }).send(post('hop-le', bad));
    expect(created.status).toBe(422);
    const { id } = await create(admin.token, 'de-sua');
    expect((await patch(admin.token, id, bad)).status).toBe(422);
  });

  it('accepts every field at its maximum length', async () => {
    const admin = await createAdmin();
    const res = await call('post', '/api/v1/blog', { token: admin.token, brand: null }).send(
      post('toi-da', { title: 'a'.repeat(200), excerpt: 'a'.repeat(500), seoTitle: 'a'.repeat(70), seoDescription: 'a'.repeat(160) }),
    );
    expect(res.status).toBe(201);
  });
});
