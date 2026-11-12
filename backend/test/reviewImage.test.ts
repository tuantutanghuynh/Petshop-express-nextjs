import { PassThrough } from 'stream';
import request from 'supertest';
import { v2 as cloudinary, type UploadApiResponse, type UploadResponseCallback } from 'cloudinary';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../app';
import { signAccessToken } from '../services/jwt.service';

// POST /reviews/images (ADR-027): signed-in customers only, real image bytes, 5 MB, 10 an hour per
// account, stored under the reviews folder. Cloudinary is replaced by a stub (nothing is uploaded).

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0xff, 0xd9]);
const URL_OK = 'https://res.cloudinary.com/test-cloud/image/upload/v1/miniecom-petshop/reviews/a.jpg';
let folders: unknown[] = [];

function stubCloudinary() {
  folders = [];
  return vi.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation(((options?: { folder?: string }, callback?: UploadResponseCallback) => {
    folders.push(options?.folder);
    const stream = new PassThrough();
    stream.on('finish', () => callback?.(undefined, { secure_url: URL_OK } as UploadApiResponse));
    stream.resume();
    return stream;
  }) as unknown as typeof cloudinary.uploader.upload_stream);
}

let n = 0;
// A fresh customer per test: the hourly limit is per account.
const customer = () => signAccessToken({ sub: `review-customer-${(n += 1)}`, role: 'customer' });
const upload = (token: string | null, buf: Buffer, type = 'image/jpeg', name = 'a.jpg') => {
  const req = request(app).post('/api/v1/reviews/images');
  return (token ? req.set('Authorization', `Bearer ${token}`) : req).attach('image', buf, { filename: name, contentType: type });
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/v1/reviews/images', () => {
  it('uploads a real image to the reviews folder', async () => {
    const spy = stubCloudinary();
    const res = await upload(customer(), JPG);
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ url: URL_OK });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(folders[0])).toMatch(/\/reviews$/);
  });

  it('needs a signed-in customer', async () => {
    stubCloudinary();
    expect((await upload(null, JPG)).status).toBe(401);
  });

  it('refuses a file that only claims to be an image, without uploading it', async () => {
    const spy = stubCloudinary();
    const res = await upload(customer(), Buffer.from('<html><script>alert(1)</script></html>'), 'image/jpeg', 'x.jpg');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses another declared type (SVG)', async () => {
    stubCloudinary();
    expect((await upload(customer(), Buffer.from('<svg/>'), 'image/svg+xml', 'x.svg')).status).toBe(422);
  });

  it('refuses a file over 5 MB with its own message', async () => {
    stubCloudinary();
    const big = Buffer.concat([JPG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await upload(customer(), big);
    expect(res.status).toBe(413);
    expect(res.body.error.message).toContain('5MB');
  });

  it('allows 10 uploads an hour per account, then 429', async () => {
    stubCloudinary();
    const token = customer();
    for (let i = 0; i < 10; i++) expect((await upload(token, JPG)).status).toBe(201);
    const res = await upload(token, JPG);
    expect(res.status).toBe(429);
    expect((await upload(customer(), JPG)).status).toBe(201); // another account is not affected
  });
});
