import { describe, expect, it } from 'vitest';
import { call } from './helpers/http';
import { createAdmin, createUser } from './helpers/factories';

// Admin gallery management (spec 2026-11-10): create, edit, delete, with length rules on the text
// the photo carries (alt is what screen readers and image search read).

const photo = (extra: Record<string, unknown> = {}) => ({ imageUrl: 'https://res.cloudinary.com/demo/meo.jpg', altText: 'Mèo con nằm ngủ', ...extra });
const create = async (token: string, extra: Record<string, unknown> = {}) =>
  (await call('post', '/api/v1/gallery', { token, brand: null }).send(photo(extra))).body.data as { id: string };

describe('gallery (admin)', () => {
  it('creates, edits every field, then deletes a photo', async () => {
    const admin = await createAdmin();
    const { id } = await create(admin.token, { title: 'Bé Miu' });
    const edited = await call('put', `/api/v1/gallery/${id}`, { token: admin.token, brand: null })
      .send({ imageUrl: 'https://res.cloudinary.com/demo/cho.jpg', altText: 'Chó con chạy', title: 'Bé Cún' });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ imageUrl: 'https://res.cloudinary.com/demo/cho.jpg', altText: 'Chó con chạy', title: 'Bé Cún' });

    expect((await call('delete', `/api/v1/gallery/${id}`, { token: admin.token, brand: null })).status).toBe(200);
    expect((await call('get', `/api/v1/gallery/${id}`, { brand: null })).status).toBe(404);
    expect((await call('delete', `/api/v1/gallery/${id}`, { token: admin.token, brand: null })).status).toBe(404);
  });

  it('a customer can neither edit nor delete (403)', async () => {
    const admin = await createAdmin();
    const customer = await createUser();
    const { id } = await create(admin.token);
    expect((await call('put', `/api/v1/gallery/${id}`, { token: customer.token, brand: null }).send(photo())).status).toBe(403);
    expect((await call('delete', `/api/v1/gallery/${id}`, { token: customer.token, brand: null })).status).toBe(403);
  });

  it.each([
    ['alt over 200', { altText: 'a'.repeat(201) }],
    ['blank alt', { altText: '   ' }],
    ['title over 120', { title: 'a'.repeat(121) }],
    ['image URL over 500', { imageUrl: `https://res.cloudinary.com/${'a'.repeat(480)}.jpg` }],
  ])('rejects %s with 422 on create and on edit', async (_name, bad) => {
    const admin = await createAdmin();
    expect((await call('post', '/api/v1/gallery', { token: admin.token, brand: null }).send(photo(bad))).status).toBe(422);
    const { id } = await create(admin.token);
    expect((await call('put', `/api/v1/gallery/${id}`, { token: admin.token, brand: null }).send(photo(bad))).status).toBe(422);
  });

  it('accepts alt and title at their maximum and a null title', async () => {
    const admin = await createAdmin();
    const res = await call('post', '/api/v1/gallery', { token: admin.token, brand: null }).send(photo({ altText: 'a'.repeat(200), title: 'a'.repeat(120) }));
    expect(res.status).toBe(201);
    expect((await call('post', '/api/v1/gallery', { token: admin.token, brand: null }).send(photo({ title: null }))).status).toBe(201);
  });
});
